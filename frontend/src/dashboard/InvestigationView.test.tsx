import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FRAME_MS } from "../state/useInvestigation";
import { makeTrace } from "../test/fixtures";
import InvestigationView from "./InvestigationView";

const forward = () => fireEvent.click(screen.getByRole("button", { name: /Forward/ }));

describe("InvestigationView", () => {
  afterEach(() => vi.useRealTimers());

  it("starts at the prior with probabilities shown as numbers", () => {
    render(<InvestigationView trace={makeTrace()} />);
    expect(screen.getByText("The note mentions a loose weight.")).toBeInTheDocument();
    const bars = screen.getByRole("list", { name: "Hypothesis probabilities" });
    expect(within(bars).getByText("40.0%")).toBeInTheDocument();
    expect(screen.getAllByText("Simulated").length).toBeGreaterThan(0);
  });

  it("steps through choice, predictions, measurement and update", () => {
    render(<InvestigationView trace={makeTrace()} />);
    forward(); // alarm
    expect(screen.getByText(/Only this single number is known/)).toBeInTheDocument();
    forward(); // choice
    expect(screen.getByText("Rationale for step 1.")).toBeInTheDocument();
    expect(screen.queryByTestId("measured-row")).not.toBeInTheDocument();
    forward(); // predictions
    expect(screen.getByText("Strong 1x at step 1")).toBeInTheDocument();
    expect(screen.getByText("Not yet revealed")).toBeInTheDocument();
    expect(screen.queryByText("13.3 µm")).not.toBeInTheDocument();
    forward(); // measurement
    expect(screen.queryByText("Not yet revealed")).not.toBeInTheDocument();
    expect(screen.getAllByText("13.3 µm").length).toBeGreaterThan(0);
    expect(screen.getByText(/Simulated amplitude spectrum/)).toBeInTheDocument();
    expect(screen.getAllByText("50.0%").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Probability before/)).not.toBeInTheDocument();
    forward(); // update
    expect(screen.getAllByText("70.0%").length).toBeGreaterThan(0);
    const check = screen.getByRole("table", { name: "Prediction check: experiment 1" });
    const imbalance = within(check).getByRole("row", { name: /^Imbalance (largest rise )?\d/ });
    expect(imbalance).toHaveTextContent("50.0% → 70.0%");
    expect(imbalance).toHaveTextContent("largest rise");
  });

  it("shows the Meta model's stated expectations with the choice", () => {
    render(<InvestigationView trace={makeTrace()} />);
    forward(); // alarm
    forward(); // choice
    expect(screen.getByText(/Meta model expects \(stated before the run\)/)).toBeVisible();
    expect(screen.getByText("Strong 1x at step 1")).toBeVisible();
  });

  it("goes back a step", () => {
    render(<InvestigationView trace={makeTrace()} />);
    forward();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByText("The note mentions a loose weight.")).toBeInTheDocument();
  });

  it("shows the diagnosis only at the end", () => {
    render(<InvestigationView trace={makeTrace()} />);
    expect(screen.queryByText(/Simulated evidence points/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Skip to end/ }));
    expect(screen.getByText("Simulated evidence points to imbalance.")).toBeInTheDocument();
    expect(screen.getByText("Check rotor balance.")).toBeInTheDocument();
  });

  it("shows how the evidence built up once the diagnosis is reached", () => {
    render(<InvestigationView trace={makeTrace()} />);
    expect(screen.queryByRole("region", { name: "Evidence trail" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Skip to end/ }));
    const trail = screen.getByRole("region", { name: "Evidence trail" });
    const items = within(trail).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Experiment 1: 1,500 RPM, 1,000 N");
    expect(items[0]).toHaveTextContent("Imbalance rose 50.0% → 70.0%");
    expect(items[0]).toHaveTextContent("Imbalance at 70.0% after this step");
    expect(items[1]).toHaveTextContent("Imbalance rose 70.0% → 95.0%");
    expect(items[1]).toHaveTextContent("14.3 µm");
  });

  it("plays automatically and stops at the end", () => {
    vi.useFakeTimers();
    render(<InvestigationView trace={makeTrace()} />);
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(FRAME_MS);
      });
    }
    expect(screen.getByText("Simulated evidence points to imbalance.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Play/ })).toBeInTheDocument();
  });

  it("reports Meta fallbacks", () => {
    render(<InvestigationView trace={makeTrace()} />);
    expect(screen.getByText(/1 model calls, 0 fell back/)).toBeInTheDocument();
  });
});
