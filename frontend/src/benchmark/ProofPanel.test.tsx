import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProofReport } from "../api/types";
import ProofPanel from "./ProofPanel";

const metric = {
  runs: 24, correct: 23, accuracy: 23 / 24, accuracy_ci95: [0.798, 0.993] as [number, number],
  mean_cost: 2, calls: 80, fallbacks: 2, mean_latency_s: 9,
  injection_marker_in_explanation: 0,
};
const condition = {
  meta: metric, info_gain: { ...metric, correct: 24, calls: 0, fallbacks: 0 },
  paired_cost_saved: 0.2, paired_cost_saved_ci95: [-0.1, 0.5] as [number, number],
};
const report: ProofReport = {
  source: "simulation", version: "proof-1", model: "test-model", machines: 24,
  paired_runs: 72, plan_sha256: "abc123", generated_at: "2026-11-02",
  conditions: { no_history: condition, misleading: condition, injection: condition },
  limitations: ["Simulated measurements; no real-world validation."],
};

describe("ProofPanel", () => {
  it("shows uncertainty, failed diagnoses and the download without claiming an advantage", () => {
    render(<ProofPanel report={report} />);
    expect(screen.getByText("23/24")).toBeVisible();
    expect(screen.getByText(/does not establish a cost advantage/)).toBeVisible();
    expect(screen.getByText("2/80")).toBeVisible();
    expect(screen.getByRole("link", { name: /Download all results/ })).toHaveAttribute(
      "href", "/api/proof/download",
    );
  });

  it("switches to injection evidence and exposes protocol limits", () => {
    render(<ProofPanel report={report} />);
    fireEvent.change(screen.getByLabelText("Challenge condition"), { target: { value: "injection" } });
    expect(screen.getByText(/Injection marker in final explanations: 0\/24/)).toBeVisible();
    fireEvent.click(screen.getByText("Protocol and limits"));
    expect(screen.getByText("Simulated measurements; no real-world validation.")).toBeVisible();
  });

  it("retains an incorrect individual diagnosis for audit", () => {
    const outcome = { top: "healthy", correct: false, probability: 0.96, cost: 2, fallbacks: 0 };
    render(<ProofPanel report={{ ...report, runs: [{
      case_id: "proof-audit", condition: "no_history", truth: "misalignment",
      meta: outcome, info_gain: outcome,
    }] }} />);
    fireEvent.click(screen.getByText("Inspect every paired result"));
    expect(screen.getByText("proof-audit")).toBeVisible();
    expect(screen.getByText("Misalignment")).toBeVisible();
    expect(screen.getAllByText(/incorrect/)).toHaveLength(2);
  });
});
