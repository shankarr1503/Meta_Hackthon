"""Build real-data examples and a trial-held-out Meta assessment. No simulated input.

Run fetch_real.py first, then this script with --live for actual Meta assessment.
The fixed split is the first three source trials/class for reference, last two for test.

Study versions are pre-registered: each writes its analysis plan before any model call and
refuses to run if the plan changes. real-1 (bands at the nominal 1238 RPM) is preserved,
superseded, under data/real/studies/real-1; real-2 estimates the shaft speed per recording.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.agent.llm_client import ChatCompletionsClient, LLMError  # noqa: E402
from app.agent.meta_planner import parse_json_object  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.measured import (  # noqa: E402
    BAND_HZ,
    SPEED_HARMONICS,
    SPEED_SEARCH,
    analyse_recording,
    estimate_shaft_hz,
    nearest_reference,
)
from scripts.proof import wilson, write_json  # noqa: E402

DATA = BACKEND / "data" / "real"
OUT = BACKEND / "results" / "real-recordings.json"
VERSION = "real-2"
STUDY = DATA / "studies" / VERSION
SUPERSEDED = DATA / "studies" / "real-1" / "summary.json"
SAMPLE_RATE_HZ = 25000
NOMINAL_RPM = 1238  # documented by the dataset authors; the spectra show ~1260-1302 RPM
LABELS = ("normal", "unbalance", "misalignment", "looseness")
# From the dataset authors' test log. Never included with a held-out query sent to Meta.
TEST_LABELS = (
    "normal",
    "misalignment",
    "normal",
    "unbalance",
    "looseness",
    "normal",
    "unbalance",
    "looseness",
    "normal",
    "misalignment",
    "misalignment",
    "looseness",
    "misalignment",
    "looseness",
    "unbalance",
    "misalignment",
    "normal",
    "unbalance",
    "looseness",
    "unbalance",
)
SYSTEM = """You inspect real recorded accelerometer measurements from a laboratory rotor rig.
These are NOT simulated signals. You can inspect only the four already recorded channels;
you cannot change speed, load or generate measurements. Source amplitude units are not
specified here; compare features to labelled reference trials from the same rig. Do not
apply simulated probabilities, claim calibrated confidence or invent sensor values.
Classes: normal, unbalance, misalignment, looseness. An 'unknown' assessment is allowed.
Reference examples are labelled; the query's label, filename and trial number are hidden.
Give one JSON object. Either {"action":"inspect","channel":1,"reason":"..."} to
inspect an unseen channel 0-3, or {"action":"diagnose","label":"normal",
"reason":"evidence-based explanation with limitations"}. Use only the supplied features.
Radial signals and one short recording may not uniquely distinguish faults.
"""


def public_features(channels: list[dict]) -> list[dict]:
    return [{"channel": c["channel"], "features": c["features"]} for c in channels]


def assess(client, reference: list[dict], channels: list[dict]) -> dict:
    observed, events = [0], []
    labelled = [
        {"label": r["label"], "channels": public_features(r["channels"])} for r in reference
    ]
    for turn in range(4):
        reply = None
        user = json.dumps(
            {
                "reference_trials": labelled,
                "query_channels": public_features([channels[i] for i in observed]),
                "available_unseen_channels": [i for i in range(4) if i not in observed],
                "must_diagnose": turn == 3,
                "shaft_speed": "1x/2x/3x features are centred on each recording's own shaft "
                "speed, estimated from its spectrum (about 1,260-1,300 RPM)",
                "sample_rate_hz": SAMPLE_RATE_HZ,
            }
        )
        try:
            reply = client.complete(SYSTEM, user)
            result = parse_json_object(reply)
            action = result.get("action")
            reason = str(result.get("reason", ""))[:1400]
            if action == "inspect" and turn < 3:
                channel = result.get("channel")
                if type(channel) is not int or channel not in range(4) or channel in observed:
                    raise ValueError("invalid or already observed channel")
                events.append(
                    {"action": action, "channel": channel, "reason": reason, "raw_response": reply}
                )
                observed.append(channel)
            elif action == "diagnose" and result.get("label") in (*LABELS, "unknown"):
                events.append({"action": action, "reason": reason, "raw_response": reply})
                return {
                    "label": result["label"],
                    "reason": reason,
                    "events": events,
                    "observed_channels": observed,
                    "status": "completed",
                }
            else:
                raise ValueError("unsupported model action or label")
        except (LLMError, ValueError) as error:
            events.append({"action": "error", "reason": str(error), "raw_response": reply})
            return {
                "label": "unknown",
                "reason": str(error),
                "events": events,
                "observed_channels": observed,
                "status": "model_error",
            }
    raise RuntimeError("unreachable assessment state")


def build(live: bool = False) -> dict:
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    counts, records = {}, []
    for entry, label in zip(manifest["recordings"], TEST_LABELS, strict=True):
        payload = (DATA / "raw" / f"test-{entry['test']:02d}.npy").read_bytes()
        if hashlib.sha256(payload).hexdigest() != entry["recording_sha256"]:
            raise ValueError("source recording checksum changed")
        counts[label] = counts.get(label, 0) + 1
        identifier = hashlib.sha256(payload).hexdigest()[:12]
        signal = np.load(DATA / "raw" / f"test-{entry['test']:02d}.npy", allow_pickle=False)
        shaft_hz = estimate_shaft_hz(signal, SAMPLE_RATE_HZ, NOMINAL_RPM)
        records.append(
            {
                "id": f"record-{identifier}",
                "label": label,
                "split": "reference" if counts[label] <= 3 else "held_out",
                "provenance": entry,
                "shaft_rpm_estimated": round(shaft_hz * 60, 1),
                "channels": analyse_recording(signal, SAMPLE_RATE_HZ, shaft_hz),
            }
        )
    reference = [r for r in records if r["split"] == "reference"]
    held_out = [r for r in records if r["split"] == "held_out"]
    superseded = json.loads(SUPERSEDED.read_text(encoding="utf-8"))
    plan = {
        "version": VERSION,
        "supersedes": {"version": superseded["version"], "plan_sha256": superseded["plan_sha256"]},
        "speed_estimation": {
            "nominal_rpm": NOMINAL_RPM,
            "search_fraction": SPEED_SEARCH,
            "harmonics": SPEED_HARMONICS,
            "band_half_width_hz": BAND_HZ,
        },
        "dataset": manifest["doi"],
        "features": ["rms", "crest_factor", "kurtosis", "shaft_1x", "shaft_2x", "shaft_3x"],
        "references": [r["id"] for r in reference],
        "held_out": [r["id"] for r in held_out],
        "system_prompt_sha256": hashlib.sha256(SYSTEM.encode()).hexdigest(),
        # Line endings normalised so a Windows and a Linux checkout hash the same code.
        "feature_code_sha256": hashlib.sha256(
            (BACKEND / "app/measured.py").read_bytes().replace(b"\r\n", b"\n")
        ).hexdigest(),
    }
    plan_hash = hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()
    plan_path = STUDY / "analysis-plan.json"
    if plan_path.exists() and json.loads(plan_path.read_text(encoding="utf-8")) != plan:
        raise ValueError("the real-data analysis plan changed; preserve the original study")
    write_json(plan_path, plan)  # written before any model call
    for record in held_out:
        record["baseline"] = nearest_reference(reference, record["channels"])
    model_name = None
    if live:
        settings = get_settings()
        if not settings.llm_configured:
            raise SystemExit("Meta model not configured")
        with ChatCompletionsClient.from_settings(settings) as client:
            model_name = client.model
            for i, record in enumerate(held_out, 1):
                checkpoint = STUDY / "assessments" / f"{record['id']}.json"
                if checkpoint.exists():
                    saved = json.loads(checkpoint.read_text(encoding="utf-8"))
                    if saved["plan_hash"] != plan_hash or saved["model"] != client.model:
                        raise ValueError("saved real assessment plan/model mismatch")
                else:
                    saved = {
                        "plan_hash": plan_hash,
                        "model": client.model,
                        "assessment": assess(client, reference, record["channels"]),
                    }
                    write_json(checkpoint, saved)
                record["meta"] = saved["assessment"]
                print(f"{i}/8 real recording assessed: {record['meta']['label']}", flush=True)
    else:
        for record in held_out:
            checkpoint = STUDY / "assessments" / f"{record['id']}.json"
            if checkpoint.exists():
                saved = json.loads(checkpoint.read_text(encoding="utf-8"))
                if saved["plan_hash"] != plan_hash:
                    raise ValueError("recorded assessment does not match the frozen real-data plan")
                if model_name is not None and model_name != saved["model"]:
                    raise ValueError("recorded assessments use different models")
                model_name = saved["model"]
                record["meta"] = saved["assessment"]
    assessed = sum("meta" in r for r in held_out)
    model_correct = sum(r.get("meta", {}).get("label") == r["label"] for r in held_out)
    speeds = [r["shaft_rpm_estimated"] for r in records]
    report = {
        "source": "measured_laboratory",
        "study_version": VERSION,
        "dataset": manifest,
        "sample_rate_hz": SAMPLE_RATE_HZ,
        "duration_s": 1,
        "shaft_rpm_approximate": round(float(np.median(speeds))),
        "shaft_rpm_documented": NOMINAL_RPM,
        "shaft_rpm_estimated_range": [min(speeds), max(speeds)],
        "amplitude_units": "native source units (physical unit not verified)",
        "plan_sha256": plan_hash,
        "reference_trials": len(reference),
        "held_out_trials": len(held_out),
        "model": model_name,
        "baseline_correct": sum(r["baseline"]["label"] == r["label"] for r in held_out),
        "meta_correct": model_correct if assessed == len(held_out) else None,
        "meta_accuracy_ci95": wilson(model_correct, len(held_out))
        if assessed == len(held_out)
        else None,
        "model_errors": sum(r.get("meta", {}).get("status") == "model_error" for r in held_out),
        "records": records,
        "superseded_study": superseded,
        "limitations": [
            "Shaft speed is estimated from each recording's spectrum; the documented "
            "~1238 RPM did not match where the harmonics are. An earlier study (real-1) "
            "that used 1238 RPM is kept and reported as superseded.",
            "Real accelerometer measurements from a laboratory rig with deliberately "
            "introduced faults; not a live factory installation.",
            "One preselected one-second window per test; only eight held-out trials from one rig.",
            "No temperature, force, newly commanded speed/load experiment or calibrated "
            "fault probability is available.",
            "Reference and test trials are separated by source test, not windows from "
            "the same recording.",
            "The baseline uses all four channels; Meta may inspect fewer. This is not a "
            "controlled equal-information comparison.",
            "Native amplitude units are not verified; no conversion to g, displacement "
            "or engineering alarm threshold is claimed.",
        ],
    }
    # Compact: the report holds 80 waveform/spectrum previews and is served to the browser.
    OUT.write_text(json.dumps(report, separators=(",", ":")) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="assess the eight held-out real trials")
    args = parser.parse_args()
    result = build(args.live)
    print(f"Saved {OUT}: {result['held_out_trials']} held-out real trials")
