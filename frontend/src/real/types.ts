export interface RealChannel {
  channel: number;
  features: Record<string, number>;
  waveform: { time_ms: number; amplitude: number }[];
  spectrum: { frequency_hz: number; amplitude: number }[];
}

export interface RealRecord {
  id: string;
  label: string;
  split: "reference" | "held_out";
  provenance: {
    test: number; archive: string; member: string; recording_sha256: string;
    download_url: string;
  };
  channels: RealChannel[];
  baseline?: { label: string; distances: Record<string, number> };
  meta?: {
    label: string; reason: string; status: string; observed_channels: number[];
    events: { action: string; channel?: number; reason: string; raw_response: string | null }[];
  };
}

export interface RealReport {
  source: "measured_laboratory";
  dataset: { dataset_url: string; doi: string; license: string; license_url: string; attribution: string };
  sample_rate_hz: number;
  shaft_rpm_approximate: number;
  duration_s: number;
  amplitude_units: string;
  reference_trials: number;
  held_out_trials: number;
  model: string | null;
  baseline_correct: number;
  meta_correct: number | null;
  meta_accuracy_ci95: [number, number] | null;
  model_errors: number;
  limitations: string[];
  records: RealRecord[];
}
