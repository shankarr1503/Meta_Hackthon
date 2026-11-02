import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ErrorBoundary from "./ErrorBoundary";

let broken = true;
function Fragile() {
  if (broken) throw new Error("bad frame");
  return <p>Recovered view</p>;
}

describe("ErrorBoundary", () => {
  it("contains a render crash to its own part of the page and can retry", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    broken = true;
    render(
      <div>
        <p>Navigation stays</p>
        <ErrorBoundary label="benchmark">
          <Fragile />
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByText("Navigation stays")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The benchmark view could not be displayed: bad frame",
    );
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Recovered view")).toBeVisible();
    vi.restoreAllMocks();
  });

  it("uses a quiet fallback when one is given", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    broken = true;
    render(
      <ErrorBoundary label="3D twin" fallback={<p>3D view failed to load</p>}>
        <Fragile />
      </ErrorBoundary>,
    );
    expect(screen.getByText("3D view failed to load")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
