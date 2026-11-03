import type {
  Answer,
  BenchmarkResult,
  CaseView,
  HealthResponse,
  InvestigationRequest,
  LabRequest,
  LabResult,
  LiveFrame,
  ReadyResponse,
  Trace,
  TraceSummary,
  VideoAnalysis,
  VideoAssessment,
} from "./types";
import type { RealReport } from "../real/types";

/** The frontend talks only to /api; Vite proxies it to the backend in development. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const fallback = `${init?.method ?? "GET"} ${path} failed: HTTP ${response.status}`;
    throw new ApiError(response.status, await errorMessage(response, fallback));
  }
  return (await response.json()) as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const getHealth = () => request<HealthResponse>("/api/health");
export const getReady = () => request<ReadyResponse>("/api/ready");
export const getCases = () => request<CaseView[]>("/api/cases");
/** One case's public fields: a sealed case or a fresh machine `fresh-<seed>`. */
export const getCase = (caseId: string) =>
  request<CaseView>(`/api/cases/${encodeURIComponent(caseId)}`);
export const listInvestigations = () => request<TraceSummary[]>("/api/investigations");
export const getInvestigation = (id: string) =>
  request<Trace>(`/api/investigations/${encodeURIComponent(id)}`);
export const runInvestigation = (body: InvestigationRequest) =>
  post<Trace>("/api/investigations", body);
/** Ask the Meta model about a finished investigation; it answers from the saved trace only. */
export const askInvestigation = (id: string, question: string) =>
  post<Answer>(`/api/investigations/${encodeURIComponent(id)}/ask`, { question });
export const simulateLab = (body: LabRequest) => post<LabResult>("/api/lab/simulate", body);
export const getBenchmark = () => request<BenchmarkResult>("/api/benchmark");
/** Recorded laboratory accelerometer evidence (measured, never simulated). */
export const getRealRecordings = () => request<RealReport>("/api/real-recordings");
/** Spectrum and features from a motion series the browser extracted from a user's video. */
export const analyzeVideo = (body: { fps: number; samples: number[]; nominal_rpm?: number | null }) =>
  post<VideoAnalysis>("/api/video/analyze", body);
/** Meta model reading of video-extracted features (experimental; needs the model key). */
export const assessVideo = (
  analysis: VideoAnalysis,
  context: string,
  nominalRpm: number | null,
) =>
  post<VideoAssessment>("/api/video/assess", {
    fps: analysis.sample_rate_hz,
    duration_s: analysis.duration_s,
    nyquist_hz: analysis.nyquist_hz,
    rms: analysis.rms,
    crest_factor: analysis.crest_factor,
    peaks: analysis.peaks,
    shaft_hz_estimate: analysis.shaft_hz_estimate,
    harmonics: analysis.harmonics,
    nominal_rpm: nominalRpm,
    context,
  });

/** Shown when the stream ends before the final trace. EventSource cannot see the HTTP status. */
export const STREAM_INTERRUPTED =
  "The live investigation stream was interrupted before it finished. " +
  "Check that the server is running, the Meta model is configured and its hourly run limit " +
  "has not been reached.";
export const STREAM_UNREADABLE =
  "The live investigation sent a frame that could not be read, so the stream was stopped.";

function parseFrame(data: unknown): LiveFrame | null {
  if (typeof data !== "string") return null;
  try {
    const frame: unknown = JSON.parse(data);
    if (frame && typeof frame === "object" && typeof (frame as { kind?: unknown }).kind === "string") {
      return frame as LiveFrame;
    }
  } catch {
    // Not JSON: reported by the caller.
  }
  return null;
}

/** Open a Server-Sent Events stream for a live investigation.
 *
 * The backend streams one frame per investigation phase as it is computed. Calls
 * `onFrame` for every frame and `onTrace` once the final complete trace arrives; the
 * stream is closed first, so the browser's end-of-stream `error` event is ignored.
 * Any earlier error or unreadable frame closes the stream and calls `onError` once with
 * a readable message. Returns the EventSource; call `.close()` to abort.
 */
export function streamInvestigation(
  body: InvestigationRequest,
  onFrame: (frame: LiveFrame) => void,
  onTrace: (trace: Trace) => void,
  onError: (message: string) => void,
): EventSource {
  const params = new URLSearchParams({
    case_id: body.case_id,
    planner: body.planner,
    seed: String(body.seed),
  });
  const source = new EventSource(`/api/investigations/stream?${params}`);
  let done = false;
  const finish = () => {
    done = true;
    source.close();
  };
  source.onmessage = (event: MessageEvent) => {
    if (done) return;
    const frame = parseFrame(event.data);
    if (frame === null) {
      finish();
      onError(STREAM_UNREADABLE);
    } else if (frame.kind === "trace") {
      finish();
      onTrace(frame.trace);
    } else {
      onFrame(frame);
    }
  };
  source.onerror = () => {
    if (done) return;
    finish();
    onError(STREAM_INTERRUPTED);
  };
  return source;
}
