import type {
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
} from "./types";

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
export const listInvestigations = () => request<TraceSummary[]>("/api/investigations");
export const getInvestigation = (id: string) =>
  request<Trace>(`/api/investigations/${encodeURIComponent(id)}`);
export const runInvestigation = (body: InvestigationRequest) =>
  post<Trace>("/api/investigations", body);
export const simulateLab = (body: LabRequest) => post<LabResult>("/api/lab/simulate", body);
export const getBenchmark = () => request<BenchmarkResult>("/api/benchmark");

/** Open a Server-Sent Events stream for a live investigation.
 *
 * The backend streams one frame per investigation phase as it is computed. Call
 * `onFrame` for every frame and `onTrace` when the final complete trace arrives.
 * Returns the EventSource; call `.close()` to abort.
 */
export function streamInvestigation(
  body: InvestigationRequest,
  onFrame: (frame: LiveFrame) => void,
  onTrace: (trace: Trace) => void,
  onError: (e: unknown) => void,
): EventSource {
  const params = new URLSearchParams({
    case_id: body.case_id,
    planner: body.planner,
    seed: String(body.seed),
  });
  const source = new EventSource(`/api/investigations/stream?${params}`);
  source.onmessage = (event: MessageEvent) => {
    try {
      const frame: LiveFrame = JSON.parse(event.data);
      if (frame.kind === "trace") {
        onTrace(frame.trace);
      } else {
        onFrame(frame);
      }
    } catch (error) {
      onError(error);
    }
  };
  source.onerror = (error: unknown) => {
    source.close();
    onError(error);
  };
  return source;
}
