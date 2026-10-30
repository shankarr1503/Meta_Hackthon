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
    forward(); // update
    expect(screen.getAllByText("70.0%").length).toBeGreaterThan(0);
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
