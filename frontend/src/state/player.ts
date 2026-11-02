import type { Probabilities, Step, Trace } from "../api/types";
import type { TwinReading } from "../twin/mapping";

/**
 * The step player turns a trace into frames. For each experiment it shows the choice and
 * reasoning, then the predictions, then reveals the measurement, then the updated
 * probabilities. The diagnosis appears only on the last frame. Live runs and replays use
 * the same frames.
 */
export type Frame =
  | { kind: "prior" }
  | { kind: "alarm" }
  | { kind: "choice"; step: number }
  | { kind: "predict"; step: number }
  | { kind: "result"; step: number }
  | { kind: "update"; step: number }
  | { kind: "diagnosis" };

const STEP_PHASES = ["choice", "predict", "result", "update"] as const;

export function buildFrames(trace: Trace): Frame[] {
  const frames: Frame[] = [{ kind: "prior" }, { kind: "alarm" }];
  trace.steps.forEach((_, step) => {
    for (const kind of STEP_PHASES) frames.push({ kind, step });
  });
  frames.push({ kind: "diagnosis" });
  return frames;
}

/** What is known about an experiment as soon as it is chosen. */
export type Experiment = Pick<
  Step,
  "index" | "rpm" | "load_n" | "cost" | "chosen_by" | "rationale" | "information_bits" | "expectations"
>;

/** Engine probabilities just before and just after one experiment's update. */
export interface ProbabilityChange {
  before: Probabilities;
  after: Probabilities;
}

/**
 * The engine's probabilities before the experiment at `position` (0-based): the previous
 * step's posterior, or the alarm posterior for the first experiment. Nothing is computed.
 */
export function posteriorBefore(
  steps: Step[],
  position: number,
  alarmPosterior: Probabilities,
): Probabilities {
  return position > 0 ? steps[position - 1].posterior : alarmPosterior;
}

export interface View {
  frame: Frame;
  /** Probabilities to display: they change only once an update is shown. */
  probabilities: Probabilities;
  budgetRemaining: number;
  /** Steps whose measurement is visible, in order. */
  revealedSteps: Step[];
  /** The experiment being presented, if any. */
  current: Step | null;
  showPredictions: boolean;
  showMeasurement: boolean;
  /** Before/after probabilities for the current experiment, once its update is shown. */
  change: ProbabilityChange | null;
  showDiagnosis: boolean;
}

export function viewAt(trace: Trace, frames: Frame[], index: number): View {
  const frame = frames[Math.max(0, Math.min(index, frames.length - 1))];
  const stepIndex = "step" in frame ? frame.step : frame.kind === "diagnosis" ? trace.steps.length : -1;
  const measured = frame.kind === "result" || frame.kind === "update";
  const revealedCount =
    frame.kind === "diagnosis" ? trace.steps.length : stepIndex >= 0 ? stepIndex + (measured ? 1 : 0) : 0;
  const current = "step" in frame ? trace.steps[frame.step] : null;

  let probabilities = trace.prior.probabilities;
  if (frame.kind !== "prior") probabilities = trace.alarm.posterior;
  const updatedCount = frame.kind === "update" ? stepIndex + 1 : frame.kind === "diagnosis" ? trace.steps.length : Math.max(0, stepIndex);
  if (updatedCount > 0) probabilities = trace.steps[updatedCount - 1].posterior;

  const spentSteps = trace.steps.slice(0, revealedCount);
  const spent = spentSteps.reduce((sum, s) => sum + s.cost, 0);

  return {
    frame,
    probabilities,
    budgetRemaining: trace.budget - spent,
    revealedSteps: spentSteps,
    current,
    showPredictions: frame.kind === "predict" || measured,
    showMeasurement: measured,
    change:
      frame.kind === "update"
        ? {
            before: posteriorBefore(trace.steps, frame.step, trace.alarm.posterior),
            after: trace.steps[frame.step].posterior,
          }
        : null,
    showDiagnosis: frame.kind === "diagnosis",
  };
}

export function frameLabel(frame: Frame): string {
  switch (frame.kind) {
    case "prior":
      return "Starting beliefs";
    case "alarm":
      return "Alarm reading";
    case "choice":
      return `Experiment ${frame.step + 1}: choice`;
    case "predict":
      return `Experiment ${frame.step + 1}: predictions`;
    case "result":
      return `Experiment ${frame.step + 1}: measurement`;
    case "update":
      return `Experiment ${frame.step + 1}: updated beliefs`;
    case "diagnosis":
      return "Diagnosis";
  }
}

/**
 * What the 3D twin may show: the latest revealed measurement at its own operating point,
 * or, before any experiment, the alarm's operating point with no measured motion.
 */
export function twinReading(trace: Trace, view: View): TwinReading {
  const latest = view.revealedSteps.at(-1);
  if (!latest) return { rpm: trace.alarm.rpm, load_n: trace.alarm.load_n, measured: null };
  return { rpm: latest.rpm, load_n: latest.load_n, measured: latest.measured };
}
