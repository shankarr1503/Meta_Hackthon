/** Mirrors backend/app/schemas/health.py (contract version 1). */
export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  contract_version: string;
}
