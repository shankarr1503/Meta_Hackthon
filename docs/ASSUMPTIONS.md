# Assumptions register

Every modelling and product assumption, stated openly. Data in FailureLab AI is
simulated, except the attributed measured-laboratory recordings path (REAL_DATA.md);
nothing here claims validated real-world accuracy. Update this file whenever
behaviour changes.

## Physics model

- One shaft on two bearings, modelled as a single-mass (10 kg) Jeffcott rotor with one
  bending mode; steady state only (no run-up transients).
- Viscous damping, `ζ = 0.03 + 0.08 · friction`: friction lowers resonance peaks.
- A residual unbalance of 1e-5 kg·m is always present, so a healthy machine shows a small 1x.
- Imbalance adds a 2x equal to 20% of its 1x. Misalignment is a static force
  `30 · severity · (1 + load/1500)` N that excites 2x through `D(2r)` and a 1x of 0.6× the
  static deflection.
- Contributions add in phase (amplitudes sum); no phase information is modelled.
- Friction broadband is `6 · friction · rpm/3000` µm RMS of white noise.
- Temperature is the steady bearing temperature rise above ambient, in °C; ambient is not
  modelled. Even a healthy machine warms with speed and load.
- Model version `rotor-1` (`MODEL_VERSION` in `app/physics/model.py`).

## Measurement and sensors

- Model error is random, not systematic: true 1x and 2x are multiplied by log-normal factors
  (log spread 0.35), friction broadband by a log-normal factor (0.20), temperature by
  `1 + 0.10·z`, plus 1.5 °C additive noise.
- One ideal displacement sensor: 1 s at 5 kHz by default, 2 µm RMS white sensor noise, random
  1x and 2x phases.
- 1x and 2x are extracted by least-squares sinusoid fitting at the known running speed
  (ideal tachometer); broadband is the RMS of the fit residual, so it includes sensor noise.
  No harmonics are reported at 0 RPM or when the window holds fewer than two shaft cycles,
  where the least-squares fit is ill-conditioned (D-66). Investigations (≥ 900 RPM, 1 s)
  always exceed this minimum.
- Temperature is measured directly, not derived from the signal; measured rise can be
  slightly negative at low speed because of the additive noise.
- Each experiment's noise is seeded from (seed, case id, experiment index), so a reading
  does not depend on which experiments ran before it.
- The alarm reports overall RMS `√((A1² + A2²)/2 + B²)` from the measured features.

## Inference engine

- The engine assumes the simulator's own model family: results show the method works when
  the model is structurally right, not robustness to unmodelled physics.
- Six hypotheses, each a grid of particles: severities (0.15, 0.3, 0.5, 0.75, 1.0) per present
  fault, critical speeds 3,300–3,900 RPM in steps of 150, thermal factors (0.75, 1.0, 1.3);
  990 particles. A hypothesis's prior is spread evenly over its particles.
- Features are compared in log space for 1x and 2x (`log(1 + x)`, spread 0.354) and
  broadband (spread 0.206), and linearly for temperature (`√(1.5² + (0.1·T)²)` °C). The
  alarm uses log overall RMS (spread 0.354). Features are treated as independent.
- Probabilities are over hypotheses only; the severity and machine values of the particles
  are nuisance parameters that are summed out.
- Expected information gain is a 64-sample Monte Carlo estimate with feature-level noise
  only (no waveforms), seeded by the investigation, clipped at zero.
- Per-hypothesis predictions are the belief-weighted mean of that hypothesis's particles'
  noise-free values at the operating point.

## Planners and the Meta model

- Rule planners start from a uniform prior; they do not read the maintenance note.
- Every planner shares the candidates (8 speeds × 3 loads), costs (2 points above
  4,000 RPM, else 1), budget (8), no repeats and the stop at 90%.
- The planner's random draws (information-gain sampling, random choices) come from a
  generator seeded by the investigation seed alone; measurement noise is seeded separately
  per experiment by the runner.
- "Remaining doubts" are the other hypotheses at 5% or more. Recommended checks are fixed
  maintenance texts per fault, not engineering advice for a real machine.
- The Meta model sees only public data: the case title and note, engine probabilities, the
  top five candidates with their expected information and the engine's per-hypothesis
  predictions, and the measurements so far. It never sees hidden machine values.
- The model's prior is renormalised and floored (`0.05 + 0.7 · p`); its experiment choice is
  limited to the engine's top five by information per cost; its words never change
  measurements, probabilities or stopping.
- Model output is untrusted: JSON is extracted from the reply, unknown hypothesis names are
  dropped, text is capped (reason 600, rationale 400, expectation 200, explanation 1,200
  characters). Any failure falls back to `info_gain` for that call.
- Questions about a finished investigation (D-75) are answered from the saved trace's public
  fields only. The question is untrusted text passed as data; the answer is capped at 900
  characters, shown to the user, never saved, and never affects a measurement, probability,
  stopping decision or diagnosis. A grounded answer can still be wrong: the dashboard shows
  the recorded evidence beside it so a reader can check every quoted reading.

## Cases and benchmark

- Six sealed cases with fixed truths and hidden machine values (TECHNICAL_DESIGN.md §11);
  all start from an alarm at 2,950 RPM and 500 N.
- Generated cases: equal numbers per hypothesis, severities uniform in 0.15–0.8, critical
  speed uniform in 3,300–3,900 RPM, thermal factor uniform in 0.7–1.4 (off the engine's
  grid on purpose), and a note saying no history is available.
- Misalignment combined with friction is not a modelled hypothesis, so no case has it.
- Fresh machines (`fresh-<seed>`, D-74) draw their label uniformly from the six hypotheses
  and their severities and machine values from the generated-case ranges above, all from
  one generator seeded by the id. The same seed always gives the same machine; a different
  seed gives an unrelated one. They are simulated like every other case.
- Benchmark: generated cases use seed 2026 and one investigation seed each; sealed cases run
  with seeds 0–4 (rule planners) or 0–2 (Meta). Accuracy is top hypothesis = truth label.

## API and frontend

- The UI normalises seeds to integers within each endpoint's range (investigations
  0–10,000; manual lab 0–2,147,483,647). The backend remains the validation authority.
- Simultaneous saves to one replay id use unique temporary files and atomic replacement.
  The last successful replacement wins; readers see one complete trace.
- On Windows, replacement permission errors are retried up to five times, with short
  delays, because simultaneous replacements can briefly deny access.
- Production dashboard hosting is opt-in through `FAILURELAB_FRONTEND_DIR`; it exposes
  only the built frontend directory. The API-only development mode stays the default.
- The cross-site guard relies on browsers sending `Sec-Fetch-Site` or `Origin`; non-browser
  clients are not blocked by it. The Meta run limit is counted per server process (D-64).

- The 3D twin is an illustration, not a second simulator: every motion comes from a
  measured feature. The shaft is drawn as a 0.8 m rotor; whirl is exaggerated 1,000×
  (1 µm shown as 1 mm) and capped; spin is shown 20× slower than the true RPM; a figure-eight
  is drawn when 2x is at least 1x and above the 2 µm noise floor; bearing tint saturates at
  a 40 °C rise; jitter is seeded, so a replay looks the same each time.
- Recommended checks and explanations are for the simulated machine only.
- The maintenance action plan (D-79) is static engineering practice per fault class,
  shown with every diagnosis and labelled general guidance, not a machine-specific
  work order. It uses no model call and changes no trace, schema or probability;
  compound faults combine both sections with a fixed ordering note.

## Video vibrometry (experimental, D-81)

- The input is the mean luminance of one user-chosen patch per video frame, in
  arbitrary pixel units. Pixel brightness is assumed to move monotonically with the
  point's physical motion; no calibration to displacement, velocity or g is claimed.
- Motion is readable only up to half the frame rate (Nyquist). The spectrum, peaks
  and harmonics stop there, and the Meta reading is instructed to flag an
  insufficient frame rate.
- Peaks are the strongest local maxima at or above 0.5 Hz, strongest first, at most
  five. Given a nominal speed, the shaft estimate is the frequency within ±15% of
  it whose visible 1x/2x/3x bands (each ±0.5 Hz) carry the most energy; harmonics
  above Nyquist are omitted.
- The Meta model reads the derived features and the user's context text only, never
  the video. Its reading feeds no benchmark, study or probability.

## Proof challenge

The paired proof challenge uses 24 newly generated machines under three note
conditions. Notes are correlated variants of each machine, not independent samples.
Identical prompts reuse a recorded model reply, so repeated stages are not independent
model samples; the injection-note prior was effectively sampled once.
The inference and simulator still share a model family. See PROOF_OF_CONCEPT.md
for the frozen protocol, uncertainty estimates and limits.

## Measured-data scope (2 November 2026)

Real recordings are from a physical test rig with deliberately introduced faults.
They are not simulated numbers or naturally occurring factory failures. The
measured path has four different classes and no calibrated probability model.
Only eight held-out trials from one rig were evaluated; the study real-2 result (Meta
8/8, Wilson 95% interval 67.56%–100%; baseline 5/8) has wide uncertainty. The
superseded real-1 (6/8 each) is preserved. Absolute amplitude units are unverified.
See REAL_DATA.md.

- Shaft speed is estimated per recording (D-67): a harmonic-sum search within ±15% of
  the documented 1238 RPM over the first four harmonics. This assumes the shaft
  harmonics dominate that band; another strong periodic source there could shift the
  estimate and every harmonic band centred on it.
- Measured harmonic features are the largest amplitude within ±1 Hz of each order of the
  estimated shaft frequency.
- The second-rig check (D-78) is exploratory: its 50 recordings per condition are
  consecutive segments of one session, so held-out segments are correlated with the
  references. It shows the feature pipeline is not tuned to one apparatus; it adds
  no independent trials and no Meta call was made on that rig.
