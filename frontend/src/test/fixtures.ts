import { vi } from "vitest";

import type { LiveFrame, Probabilities, Step, Trace } from "../api/types";

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

/** The full live-stream frame sequence the backend sends for `trace`, in order. */
export function liveFrames(trace: Trace): LiveFrame[] {
  const base = {
    investigation_id: trace.investigation_id,
    case: trace.case,
    planner: trace.planner,
    seed: trace.seed,
  };
  const frames: LiveFrame[] = [
    { kind: "prior", ...base, prior: trace.prior },
    { kind: "alarm", ...base, alarm: trace.alarm },
  ];
  for (const s of trace.steps) {
    frames.push(
      {
        kind: "choice",
        ...base,
        step: s.index,
        candidate: { rpm: s.rpm, load_n: s.load_n, cost: s.cost },
        chosen_by: s.chosen_by,
        rationale: s.rationale,
        information_bits: s.information_bits,
        expectations: s.expectations,
      },
      { kind: "predict", ...base, step: s.index, predictions: s.predictions },
      { kind: "result", ...base, step: s },
      { kind: "update", ...base, step: s },
    );
  }
  frames.push(
    {
      kind: "diagnosis",
      ...base,
      diagnosis: trace.diagnosis,
      stop_reason: trace.stop_reason,
      experiments: trace.experiments,
      cost: trace.cost,
    },
    { kind: "trace", ...base, trace },
  );
  return frames;
}

/** A controllable stand-in for the browser EventSource. */
export class FakeEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {}

  /** Deliver one message; objects are sent as JSON, strings as-is. */
  emit(data: unknown): void {
    const text = typeof data === "string" ? data : JSON.stringify(data);
    this.onmessage?.(new MessageEvent("message", { data: text }));
  }

  /** Fire `error`, as browsers do when the server ends the stream or the connection drops. */
  fail(): void {
    this.onerror?.(new Event("error"));
  }

  close(): void {
    this.closed = true;
  }
}

/** Replace the global EventSource; the returned list collects every stream opened. */
export function installFakeEventSource(): FakeEventSource[] {
  const opened: FakeEventSource[] = [];
  class Tracked extends FakeEventSource {
    constructor(url: string) {
      super(url);
      opened.push(this);
    }
  }
  vi.stubGlobal("EventSource", Tracked);
  return opened;
}
