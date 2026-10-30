import { describe, expect, it } from "vitest";

import { makeTrace } from "../test/fixtures";
import { buildFrames, frameLabel, twinReading, viewAt } from "./player";

const trace = makeTrace();
const frames = buildFrames(trace);
const at = (kind: string, step?: number) =>
  frames.findIndex((f) => f.kind === kind && (step === undefined || ("step" in f && f.step === step)));

describe("player frames", () => {
  it("has prior, alarm, four frames per experiment and a final diagnosis", () => {
    expect(frames).toHaveLength(2 + 4 * trace.steps.length + 1);
    expect(frames[0]).toEqual({ kind: "prior" });
    expect(frames.at(-1)).toEqual({ kind: "diagnosis" });
    expect(frameLabel(frames[2])).toBe("Experiment 1: choice");
  });

  it("starts from the prior with nothing revealed", () => {
    const view = viewAt(trace, frames, 0);
    expect(view.probabilities).toEqual(trace.prior.probabilities);
    expect(view.revealedSteps).toEqual([]);
    expect(view.budgetRemaining).toBe(8);
    expect(view.showDiagnosis).toBe(false);
  });

  it("shows the alarm update after the prior", () => {
    expect(viewAt(trace, frames, at("alarm")).probabilities).toEqual(trace.alarm.posterior);
  });

  it("hides predictions and the measurement while presenting the choice", () => {
    const view = viewAt(trace, frames, at("choice", 0));
    expect(view.current?.index).toBe(1);
    expect(view.showPredictions).toBe(false);
    expect(view.showMeasurement).toBe(false);
  });

  it("shows predictions before the measurement", () => {
    const view = viewAt(trace, frames, at("predict", 0));
    expect(view.showPredictions).toBe(true);
    expect(view.showMeasurement).toBe(false);
    expect(view.revealedSteps).toEqual([]);
  });

  it("reveals the measurement before updating probabilities", () => {
    const result = viewAt(trace, frames, at("result", 0));
    expect(result.showMeasurement).toBe(true);
    expect(result.revealedSteps).toHaveLength(1);
    expect(result.probabilities).toEqual(trace.alarm.posterior);
    const update = viewAt(trace, frames, at("update", 0));
    expect(update.probabilities).toEqual(trace.steps[0].posterior);
  });

  it("charges the budget once a measurement is revealed", () => {
    expect(viewAt(trace, frames, at("choice", 1)).budgetRemaining).toBe(7);
    expect(viewAt(trace, frames, at("result", 1)).budgetRemaining).toBe(5);
  });

  it("shows the diagnosis only at the end", () => {
    const shown = frames.map((_, i) => viewAt(trace, frames, i).showDiagnosis);
    expect(shown.filter(Boolean)).toHaveLength(1);
    expect(shown.at(-1)).toBe(true);
    const end = viewAt(trace, frames, frames.length - 1);
    expect(end.probabilities).toEqual(trace.steps[1].posterior);
    expect(end.revealedSteps).toHaveLength(2);
  });

  it("handles a trace that stopped right after the alarm", () => {
    const empty = makeTrace({ steps: [], experiments: 0, cost: 0 });
    const emptyFrames = buildFrames(empty);
    expect(emptyFrames).toHaveLength(3);
    expect(viewAt(empty, emptyFrames, 2).probabilities).toEqual(empty.alarm.posterior);
  });
});

describe("twin reading", () => {
  it("shows no motion before the first measurement", () => {
    const reading = twinReading(trace, viewAt(trace, frames, at("predict", 0)));
    expect(reading).toEqual({ rpm: 2950, load_n: 500, measured: null });
  });

  it("follows the latest revealed measurement", () => {
    const reading = twinReading(trace, viewAt(trace, frames, at("result", 0)));
    expect(reading.rpm).toBe(1500);
    expect(reading.measured).toEqual(trace.steps[0].measured);
    const waiting = twinReading(trace, viewAt(trace, frames, at("choice", 1)));
    expect(waiting.rpm).toBe(1500); // the next experiment is not shown until measured
  });
});
