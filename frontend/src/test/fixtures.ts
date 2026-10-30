import type { Probabilities, Step, Trace } from "../api/types";

const HYPS = [
  "healthy",
  "imbalance",
  "misalignment",
  "friction",
  "imbalance+friction",
  "imbalance+misalignment",
];

export function probs(leader: string, p: number): Probabilities {
  const rest = (1 - p) / (HYPS.length - 1);
  return Object.fromEntries(HYPS.map((h) => [h, h === leader ? p : rest]));
}

function step(index: number, rpm: number, cost: number, posterior: Probabilities): Step {
  const predictions = Object.fromEntries(
    HYPS.map((h, i) => [h, { amp_1x_um: 1 + i, amp_2x_um: 0.5 + i, temp_rise_c: 5 + i }]),
  );
  return {
    index,
    rpm,
    load_n: 1000,
    cost,
    chosen_by: "meta",
    rationale: `Rationale for step ${index}.`,
    information_bits: 0.8,
    expectations: { imbalance: `Strong 1x at step ${index}` },
    predictions,
    measured: { amp_1x_um: 12.34 + index, amp_2x_um: 2.5, broadband_um: 2.1, temp_rise_c: 9.9 },
    signals: {
      time_s: [0, 0.001],
      displacement_um: [0, 1],
      spectrum_freq_hz: [0, 25, 50],
      spectrum_amp_um: [0, 12, 2],
    },
    posterior,
    budget_remaining: 8 - cost * index,
  };
}

export function makeTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    investigation_id: "case-k7-meta-0-20261030120000",
    case: {
      case_id: "case-k7",
      title: "Pump drive A",
      note: "A balance weight was found loose.",
      initial_rpm: 2950,
      initial_load_n: 500,
    },
    planner: "meta",
    seed: 0,
    source: "simulation",
    model_version: "rotor-1",
    prior: { probabilities: probs("imbalance", 0.4), reason: "The note mentions a loose weight." },
    alarm: { rpm: 2950, load_n: 500, overall_rms_um: 8.5, posterior: probs("imbalance", 0.5) },
    steps: [step(1, 1500, 1, probs("imbalance", 0.7)), step(2, 4500, 2, probs("imbalance", 0.95))],
    experiments: 2,
    cost: 3,
    budget: 8,
    stop_reason: "confident",
    diagnosis: {
      top: "imbalance",
      probability: 0.95,
      confident: true,
      ranked: [{ hypothesis: "imbalance", probability: 0.95 }],
      remaining_doubts: [],
      recommended_check: "Check rotor balance.",
      explanation: "Simulated evidence points to imbalance.",
    },
    llm_events: [
      { call: "prior", model: "m", response: "{}", ok: true, fallback: false, usage: null },
    ],
    ...overrides,
  };
}
