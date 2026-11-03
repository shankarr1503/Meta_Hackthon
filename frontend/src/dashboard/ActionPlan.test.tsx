import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ActionPlan from "./ActionPlan";

describe("ActionPlan", () => {
  it("shows where to look, root causes, actions and verification for one fault", () => {
    render(<ActionPlan hypothesis="misalignment" />);
    expect(screen.getByRole("heading", { name: /Action plan — Misalignment/ })).toBeInTheDocument();
    expect(screen.getByText(/Coupling and motor mounting/)).toBeInTheDocument();
    expect(screen.getAllByText(/soft foot/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Laser-align the shafts/)).toBeInTheDocument();
    expect(screen.getByText(/2x line falls back toward the sensor floor/)).toBeInTheDocument();
    expect(
      screen.getByText(/not a machine-specific work order/),
    ).toBeInTheDocument();
  });

  it("combines both fault sections and the ordering note for a compound fault", () => {
    render(<ActionPlan hypothesis="imbalance+misalignment" />);
    expect(screen.getByText(/Align first, then balance/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Imbalance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Misalignment" })).toBeInTheDocument();
    expect(screen.getByText(/Field-balance the rotor/)).toBeInTheDocument();
    expect(screen.getByText(/Laser-align the shafts/)).toBeInTheDocument();
  });

  it("recommends monitoring, not repairs, for a healthy machine", () => {
    render(<ActionPlan hypothesis="healthy" />);
    expect(screen.getByText(/No component implicated/)).toBeInTheDocument();
    expect(screen.getByText(/Keep the routine monitoring interval/)).toBeInTheDocument();
    expect(screen.queryByText(/Likely root causes/)).not.toBeInTheDocument();
  });

  it("renders nothing for an unknown hypothesis", () => {
    const { container } = render(<ActionPlan hypothesis="unknown" />);
    expect(container).toBeEmptyDOMElement();
  });
});
