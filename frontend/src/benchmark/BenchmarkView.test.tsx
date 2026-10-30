import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import BenchmarkView from "./BenchmarkView";

const metrics = (accuracy: number, cost: number) => ({
  runs: 150,
  accuracy,
  mean_experiments: cost,
  mean_cost: cost,
  reached_target: 0.95,
  accuracy_when_confident: 0.99,
  fallback_rate: null,
});

const RESULT = {
  source: "simulation",
  model_version: "rotor-1",
  generated_at: "2026-10-30T05:54:43Z",
  rules: { budget: 8, confidence_target: 0.9 },
  protocols: { info_gain: { runtime_s: 36.4 }, sweep: { runtime_s: 0.8 } },
  planners: {
    sweep: { all: metrics(0.96, 2.99), "truth:misalignment": metrics(0.84, 4.12) },
    info_gain: { all: metrics(0.993, 2.15), "truth:misalignment": metrics(0.96, 3.72) },
  },
};

function stub(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("BenchmarkView", () => {
  it("shows planners in a fixed order with numbers", async () => {
    stub(new Response(JSON.stringify(RESULT), { status: 200 }));
    render(<BenchmarkView />);
    const rows = await screen.findAllByRole("row");
    expect(rows[1]).toHaveTextContent("Information gain");
    expect(rows[1]).toHaveTextContent("99.3%");
    expect(rows[1]).toHaveTextContent("36.4 s");
    expect(rows[2]).toHaveTextContent("Fixed sweep");
    expect(screen.getByText(/not been benchmarked yet/)).toBeInTheDocument();
    expect(screen.getByText("Simulated")).toBeVisible();
  });

  it("filters by case group", async () => {
    stub(new Response(JSON.stringify(RESULT), { status: 200 }));
    render(<BenchmarkView />);
    fireEvent.change(await screen.findByLabelText("Cases"), {
      target: { value: "truth:misalignment" },
    });
    expect(screen.getByText("84.0%")).toBeInTheDocument();
  });

  it("explains a missing benchmark", async () => {
    stub(new Response(JSON.stringify({ detail: "No benchmark yet" }), { status: 404 }));
    render(<BenchmarkView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("tasks.py benchmark");
  });
});
