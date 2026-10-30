import type { HealthResponse } from "./types";

/** The frontend talks only to /api; Vite proxies it to the backend in development. */
export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`Health check failed: HTTP ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}
