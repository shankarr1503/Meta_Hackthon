import type { LiveFrame, Prediction, Probabilities, Step, Trace } from "../api/types";
import { posteriorBefore, type Experiment, type ProbabilityChange } from "./player";

type AlarmFrame = Extract<LiveFrame, { kind: "alarm" }>;
type ChoiceFrame = Extract<LiveFrame, { kind: "choice" }>;
type PredictFrame = Extract<LiveFrame, { kind: "predict" }>;
type DiagnosisFrame = Extract<LiveFrame, { kind: "diagnosis" }>;

/**
 * What a live investigation has revealed so far. Frames arrive in the replay player's order,
 * choice → predict → result → update per experiment, and each phase reveals only its own part:
 * `result` adds the measured step to the log; `update` applies its posterior and budget.
 */
export interface LiveState {
  phase: LiveFrame["kind"] | "connecting";
  priorReason: string | null;
  alarm: AlarmFrame["alarm"] | null;
  /** Engine probabilities currently shown. */
  probabilities: Probabilities;
  /** Budget left after the last applied update; null before the first experiment. */
  budgetRemaining: number | null;
  /** Experiments whose measurement has been revealed, in order. */
  steps: Step[];
  /** Number of experiments whose belief update has been applied. */
  updated: number;
  choice: ChoiceFrame | null;
  predict: PredictFrame | null;
  diagnosis: Pick<DiagnosisFrame, "diagnosis" | "stop_reason" | "experiments" | "cost"> | null;
  trace: Trace | null;
  error: string | null;
}

export type LiveAction =
  | { type: "frame"; frame: LiveFrame }
  | { type: "trace"; trace: Trace }
  | { type: "error"; message: string };

export const INITIAL_LIVE: LiveState = {
  phase: "connecting",
  priorReason: null,
  alarm: null,
  probabilities: {},
  budgetRemaining: null,
  steps: [],
  updated: 0,
  choice: null,
  predict: null,
  diagnosis: null,
  trace: null,
  error: null,
};

function applyFrame(state: LiveState, frame: LiveFrame): LiveState {
  const next = { ...state, phase: frame.kind };
  switch (frame.kind) {
    case "prior":
      return { ...next, priorReason: frame.prior.reason, probabilities: frame.prior.probabilities };
    case "alarm":
      return { ...next, alarm: frame.alarm, probabilities: frame.alarm.posterior };
    case "choice":
      return { ...next, choice: frame, predict: null };
    case "predict":
      return { ...next, predict: frame };
    case "result":
      // One log row per experiment, even if a frame is repeated.
      if (state.steps.some((s) => s.index === frame.step.index)) return next;
      return { ...next, steps: [...state.steps, frame.step] };
    case "update":
      return {
        ...next,
        probabilities: frame.step.posterior,
        budgetRemaining: frame.step.budget_remaining,
        updated: Math.max(state.updated, frame.step.index),
      };
    case "diagnosis":
      return {
        ...next,
        diagnosis: {
          diagnosis: frame.diagnosis,
          stop_reason: frame.stop_reason,
          experiments: frame.experiments,
          cost: frame.cost,
        },
      };
    case "trace":
      return { ...next, trace: frame.trace };
  }
}

export function liveReducer(state: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case "frame":
      return applyFrame(state, action.frame);
    case "trace":
      return { ...state, phase: "trace", trace: action.trace };
    case "error":
      return { ...state, error: action.message };
  }
}

/** The experiment currently presented and how much of it has been revealed. */
export interface LiveExperiment {
  experiment: Experiment;
  predictions: Record<string, Prediction> | null;
  step: Step | null;
  change: ProbabilityChange | null;
}

export function currentExperiment(state: LiveState): LiveExperiment | null {
  const { choice, predict, steps, alarm } = state;
  if (!choice) return null;
  const position = steps.findIndex((s) => s.index === choice.step);
  const step = position >= 0 ? steps[position] : null;
  const predictions = step?.predictions ?? (predict?.step === choice.step ? predict.predictions : null);
  const change =
    step && state.updated >= step.index && alarm
      ? { before: posteriorBefore(steps, position, alarm.posterior), after: step.posterior }
      : null;
  return {
    experiment: {
      index: choice.step,
      rpm: choice.candidate.rpm,
      load_n: choice.candidate.load_n,
      cost: choice.candidate.cost,
      chosen_by: choice.chosen_by,
      rationale: choice.rationale,
      information_bits: choice.information_bits,
      expectations: choice.expectations,
    },
    predictions,
    step,
    change,
  };
}
