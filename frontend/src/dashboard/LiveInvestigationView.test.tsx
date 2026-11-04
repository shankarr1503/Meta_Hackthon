import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LiveFrame, PlannerName, Trace } from "../api/types";
import { installFakeEventSource, liveFrames, makeTrace } from "../test/fixtures";
import LiveInvestigationView from "./LiveInvestigationView";

async function startLive(trace: Trace, planner: PlannerName = "meta") {
  const opened = installFakeEventSource();
  const onOpenReplay = vi.fn();
  render(
    <LiveInvestigationView
      caseView={trace.case}
      planner={planner}
      seed={trace.seed}
      onOpenReplay={onOpenReplay}
    />,
  );
  await waitFor(() => expect(opened).toHaveLength(1));
  const source = opened[0];
  const send = (...frames: (LiveFrame | string)[]) =>
    act(() => {
      for (const frame of frames) source.emit(frame);
    });
  return { source, send, onOpenReplay, opened };
}

const meter = (name: string) => screen.getByRole("meter", { name });
const logRows = () =>
  within(screen.getByRole("table", { name: "Experiment log" })).getAllByRole("row").slice(1);

describe("LiveInvestigationView", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders a complete stream once and ignores the browser's end-of-stream error", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const trace = makeTrace();
    const { source, send, onOpenReplay, opened } = await startLive(trace);
    expect(source.url).toBe("/api/investigations/stream?case_id=case-k7&planner=meta&seed=0");

    send(...liveFrames(trace));
    act(() => source.fail()); // the server closed the finished stream

    expect(source.closed).toBe(true);
    expect(opened).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/interrupted|object Event/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Diagnosis: Imbalance/ })).toBeVisible();
    expect(screen.getByText("Simulated evidence points to imbalance.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("investigation complete");

    // One log row per experiment, not one per result and update frame.
    expect(logRows()).toHaveLength(2);
    expect(meter("Imbalance")).toHaveAttribute("aria-valuetext", "95.0%");

    // The Meta model's stated expectation and the prediction check for the last experiment.
    const check = screen.getByRole("table", { name: "Prediction check: experiment 2" });
    expect(within(check).getByText("Strong 1x at step 2")).toBeVisible();
    const imbalance = within(check).getByRole("row", { name: /^Imbalance largest rise/ });
    expect(imbalance).toHaveTextContent("70.0% → 95.0%");
    expect(imbalance).toHaveTextContent("rose");
    const healthy = within(check).getByRole("row", { name: /^Healthy/ });
    expect(healthy).toHaveTextContent("6.0% → 1.0%");
    expect(healthy).toHaveTextContent("fell");
    expect(within(check).getAllByText("largest rise")).toHaveLength(1);
    expect(within(check).getByTestId("measured-row")).toHaveTextContent("14.3 µm");

    expect(screen.getByText(/saved as replay/)).toHaveTextContent(trace.investigation_id);
    fireEvent.click(screen.getByRole("button", { name: "Open full replay" }));
    expect(onOpenReplay).toHaveBeenCalledWith(trace);

    const logged = errors.mock.calls.flat().map(String).join("\n");
    expect(logged).not.toMatch(/same key/);
  });

  it("reveals each experiment in replay order: choice, predict, result, update", async () => {
    const trace = makeTrace();
    const frames = liveFrames(trace);
    const { send } = await startLive(trace);
    const [prior, alarm, choice, predict, result, update] = frames;

    send(prior, alarm);
    expect(screen.getByText(/Only this single number is known/)).toBeVisible();
    expect(meter("Imbalance")).toHaveAttribute("aria-valuetext", "50.0%");

    send(choice);
    expect(screen.getByText("Rationale for step 1.")).toBeVisible();
    expect(screen.getByText(/Meta model expects \(stated before the run\)/)).toBeVisible();
    expect(screen.getByText("Strong 1x at step 1")).toBeVisible();
    expect(screen.queryByRole("table", { name: /experiment 1/ })).not.toBeInTheDocument();

    send(predict);
    const before = screen.getByRole("table", { name: "Predictions before experiment 1" });
    expect(within(before).getByText("Not yet revealed")).toBeVisible();
    expect(within(before).getByText("Strong 1x at step 1")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("engine predictions received (experiment 1)");

    send(result);
    expect(logRows()).toHaveLength(1);
    expect(screen.getByRole("table", { name: "Prediction check: experiment 1" })).toBeVisible();
    expect(screen.getAllByText("13.3 µm").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Probability before/)).not.toBeInTheDocument();
    expect(meter("Imbalance")).toHaveAttribute("aria-valuetext", "50.0%");
    expect(screen.getByText("0 of 8 points spent")).toBeVisible();

    send(update);
    expect(logRows()).toHaveLength(1);
    expect(meter("Imbalance")).toHaveAttribute("aria-valuetext", "70.0%");
    expect(screen.getByText("1 of 8 points spent")).toBeVisible();
    const check = screen.getByRole("table", { name: "Prediction check: experiment 1" });
    // The first experiment's "before" is the alarm posterior.
    const imbalance = within(check).getByRole("row", { name: /^Imbalance (largest rise )?\d/ });
    expect(imbalance).toHaveTextContent("50.0% → 70.0%");
    expect(screen.queryByRole("heading", { name: /^Diagnosis:/ })).not.toBeInTheDocument();
  });

  it("shows elapsed time and the expected wait while a Meta run is in progress", async () => {
    const trace = makeTrace();
    const { send } = await startLive(trace);
    send(liveFrames(trace)[0]);
    expect(screen.getByRole("status")).toHaveTextContent(/elapsed/);
    expect(screen.getByRole("status")).toHaveTextContent(/about 10 seconds each/);
  });

  it("shows a readable message when the stream stops before the trace", async () => {
    const trace = makeTrace();
    const { source, send } = await startLive(trace);
    const [prior, alarm] = liveFrames(trace);
    send(prior, alarm);
    act(() => source.fail());

    expect(source.closed).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The live investigation stream was interrupted before it finished.",
    );
    expect(screen.queryByText(/object Event/)).not.toBeInTheDocument();
    expect(screen.getByText(/Only this single number is known/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Open full replay" })).not.toBeInTheDocument();
  });

  it("stops on an unreadable frame and ignores anything after it", async () => {
    const trace = makeTrace();
    const { source, send } = await startLive(trace);
    send("not json");
    expect(source.closed).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be read");

    send(liveFrames(trace)[0]);
    act(() => source.fail());
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByText("The note mentions a loose weight.")).not.toBeInTheDocument();
  });

  it("omits the Meta column for a rule planner but still checks predictions", async () => {
    const base = makeTrace();
    const trace = makeTrace({
      planner: "info_gain",
      steps: base.steps.map((s) => ({ ...s, chosen_by: "info_gain", expectations: null })),
    });
    const { send } = await startLive(trace, "info_gain");
    send(...liveFrames(trace));

    const check = screen.getByRole("table", { name: "Prediction check: experiment 2" });
    expect(within(check).queryByRole("columnheader", { name: "Meta model expected" })).toBeNull();
    expect(within(check).getByRole("columnheader", { name: "Probability before → after" })).toBeVisible();
  });
});
