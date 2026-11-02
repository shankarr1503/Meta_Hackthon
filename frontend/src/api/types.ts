/**
 * Mirrors backend/app/schemas (contract version 1). Every type here carries simulator data;
 * the measured laboratory recordings have their own types in src/real/types.ts.
 */
export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  contract_version: string;
}

export interface ReadyResponse {
  status: "ok";
  physics_model_version: string;
  meta_model_configured: boolean;
  meta_model: string;
}

export interface CaseView {
  case_id: string;
  title: string;
  note: string;
  initial_rpm: number;
  initial_load_n: number;
}

export type PlannerName = "meta" | "info_gain" | "sweep" | "random";
export type Probabilities = Record<string, number>;

export interface Prediction {
  amp_1x_um: number;
  amp_2x_um: number;
  temp_rise_c: number;
}

export interface Measured {
  amp_1x_um: number;
  amp_2x_um: number;
  broadband_um: number;
  temp_rise_c: number;
}

export interface Signals {
  time_s: number[];
  displacement_um: number[];
  spectrum_freq_hz: number[];
  spectrum_amp_um: number[];
}

export interface Step {
  index: number;
  rpm: number;
  load_n: number;
  cost: number;
  chosen_by: string;
  rationale: string;
  information_bits: number | null;
  expectations: Record<string, string> | null;
  predictions: Record<string, Prediction>;
  measured: Measured;
  signals: Signals;
  posterior: Probabilities;
  budget_remaining: number;
}

export interface Ranked {
  hypothesis: string;
  probability: number;
}

export interface Diagnosis {
  top: string;
  probability: number;
  confident: boolean;
  ranked: Ranked[];
  remaining_doubts: Ranked[];
  recommended_check: string;
  explanation: string;
}

export interface LlmEvent {
  call: string;
  model: string;
  response: string | null;
  ok: boolean;
  fallback: boolean;
  usage: Record<string, number> | null;
  error_kind?: string;
  error?: string;
}

export interface Trace {
  investigation_id: string;
  case: CaseView;
  planner: PlannerName;
  seed: number;
  source: "simulation";
  model_version: string;
  prior: { probabilities: Probabilities; reason: string };
  alarm: { rpm: number; load_n: number; overall_rms_um: number; posterior: Probabilities };
  steps: Step[];
  experiments: number;
  cost: number;
  budget: number;
  stop_reason: "confident" | "budget" | "no_affordable_experiment";
  diagnosis: Diagnosis;
  llm_events: LlmEvent[];
}

export interface TraceSummary {
  investigation_id: string;
  case_id: string;
  planner: PlannerName;
  seed: number;
  top: string;
  probability: number;
  experiments: number;
  cost: number;
  demo: boolean;
}

export interface InvestigationRequest {
  case_id: string;
  planner: PlannerName;
  seed: number;
}

/** One live-investigation frame streamed from the backend as a Server-Sent Event. */
export type LiveFrame =
  | {
      kind: "prior";
      investigation_id: string;
      case: CaseView;
      planner: PlannerName;
      seed: number;
      prior: { probabilities: Probabilities; reason: string };
    }
  | {
      kind: "alarm";
      investigation_id: string;
      case: CaseView;
      planner: PlannerName;
      seed: number;
      alarm: {
        rpm: number;
        load_n: number;
        overall_rms_um: number;
        posterior: Probabilities;
      };
    }
  | {
      kind: "choice";
      investigation_id: string;
      case: CaseView;
      planner: PlannerName;
      seed: number;
      step: number;
      candidate: { rpm: number; load_n: number; cost: number };
      chosen_by: string;
      rationale: string;
      information_bits: number | null;
      expectations: Record<string, string> | null;
    }
  | {
      kind: "predict";
      investigation_id: string;
      case: CaseView;
      planner: PlannerName;
      seed: number;
      step: number;
      predictions: Record<string, Prediction>;
    }
  | {
      kind: "result";
      investigation_id: string;
      case: CaseView;
      planner: PlannerName;
      seed: number;
      step: Step;
    }
  | {
      kind: "update";
      investigation_id: string;
      case: CaseView;
      planner: PlannerName;
      seed: number;
      step: Step;
    }
  | {
      kind: "diagnosis";
      investigation_id: string;
      case: CaseView;
      planner: PlannerName;
      seed: number;
      diagnosis: Diagnosis;
      stop_reason: Trace["stop_reason"];
      experiments: number;
      cost: number;
    }
  | {
      kind: "trace";
      investigation_id: string;
      case: CaseView;
      planner: PlannerName;
      seed: number;
      trace: Trace;
    };

export interface LabRequest {
  imbalance: number;
  misalignment: number;
  friction: number;
  rpm: number;
  load_n: number;
  seed: number;
}

export interface ExperimentResult extends Signals, Measured {
  source: "simulation";
  kind: "case" | "lab";
  model_version: string;
}

export interface LabResult extends ExperimentResult {
  curve_rpm: number[];
  curve_amp_1x_um: number[];
  curve_amp_2x_um: number[];
}

export interface PlannerMetrics {
  runs: number;
  accuracy: number;
  mean_experiments: number;
  mean_cost: number;
  reached_target: number;
  accuracy_when_confident: number | null;
  fallback_rate: number | null;
}

export interface BenchmarkResult {
  source: "simulation";
  model_version: string;
  generated_at: string;
  rules: Record<string, number>;
  protocols: Record<string, Record<string, unknown>>;
  planners: Record<string, Record<string, PlannerMetrics>>;
  proof?: ProofReport | null;
}

export interface ProofMetrics {
  runs: number;
  correct: number;
  accuracy: number;
  accuracy_ci95: [number, number];
  mean_cost: number;
  calls: number;
  fallbacks: number;
  mean_latency_s: number;
  injection_marker_in_explanation: number;
  confident_errors?: number;
}

export interface ProofReport {
  source: "simulation";
  version: string;
  model: string;
  machines: number;
  paired_runs: number;
  plan_sha256: string;
  generated_at: string;
  conditions: Record<string, {
    meta: ProofMetrics;
    info_gain: ProofMetrics;
    paired_cost_saved: number;
    paired_cost_saved_ci95: [number, number];
  }>;
  limitations: string[];
  runs?: {
    case_id: string;
    condition: string;
    truth: string;
    meta: { top: string; correct: boolean; probability: number; cost: number; fallbacks: number };
    info_gain: { top: string; correct: boolean; probability: number; cost: number; fallbacks: number };
  }[];
}
