import { describe, expect, it } from "vitest";

import {
  MAX_ORBIT_UNITS,
  ORBIT_EXAGGERATION,
  ORBIT_UNITS_PER_UM,
  SPIN_SLOWDOWN,
  bearingColor,
  isFigureEight,
  jitterUnits,
  loadArrowLength,
  orbitPoint,
  orbitUnits,
  seededNoise,
  spinRevPerSec,
  twinState,
} from "./mapping";

const MEASURED = { amp_1x_um: 50, amp_2x_um: 5, broadband_um: 2, temp_rise_c: 10 };

describe("twin mapping", () => {
  it("slows the spin by a stated factor", () => {
    expect(spinRevPerSec(3000)).toBeCloseTo(3000 / 60 / SPIN_SLOWDOWN);
    expect(spinRevPerSec(0)).toBe(0);
  });

  it("scales the orbit with measured 1x and caps it", () => {
    expect(orbitUnits(10)).toBeCloseTo(10 * ORBIT_UNITS_PER_UM);
    expect(orbitUnits(1e6)).toBe(MAX_ORBIT_UNITS);
    expect(orbitUnits(-5)).toBe(0);
  });

  it("states the orbit exaggeration", () => {
    expect(ORBIT_EXAGGERATION).toBe(1000);
  });

  it("adds jitter only for broadband above the sensor floor", () => {
    expect(jitterUnits(2)).toBe(0);
    expect(jitterUnits(1.5)).toBe(0);
    expect(jitterUnits(7)).toBeCloseTo(5 * ORBIT_UNITS_PER_UM);
  });

  it("draws a figure-eight only when 2x is strong", () => {
    expect(isFigureEight(10, 2)).toBe(false);
    expect(isFigureEight(3, 12)).toBe(true);
    expect(isFigureEight(0.5, 1)).toBe(false); // both in the noise
  });

  it("traces a circle for pure 1x and a figure-eight for pure 2x", () => {
    const circle = [0, 1, 2, 3].map((k) => orbitPoint((k * Math.PI) / 2, 1, 0));
    circle.forEach(([x, y]) => expect(Math.hypot(x, y)).toBeCloseTo(1));
    const eight = orbitPoint(Math.PI, 0, 1);
    expect(eight[0]).toBeCloseTo(0);
    expect(eight[1]).toBeCloseTo(0); // crosses the centre twice per revolution
    expect(orbitPoint(Math.PI / 4, 0, 1)[1]).toBeCloseTo(1);
  });

  it("tints bearings from cool to hot", () => {
    expect(bearingColor(0)).toBe("#64748b");
    expect(bearingColor(40)).toBe("#dc2626");
    expect(bearingColor(400)).toBe("#dc2626");
    expect(bearingColor(20)).not.toBe(bearingColor(0));
  });

  it("scales the load arrow and hides it at zero load", () => {
    expect(loadArrowLength(0)).toBe(0);
    expect(loadArrowLength(5000)).toBeCloseTo(0.9);
    expect(loadArrowLength(2500)).toBeCloseTo(0.45);
  });

  it("produces repeatable noise per seed", () => {
    expect(seededNoise(3, 10)).toBe(seededNoise(3, 10));
    expect(seededNoise(3, 10)).not.toBe(seededNoise(3, 11));
    for (let i = 0; i < 100; i += 1) {
      const n = seededNoise(1, i);
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThan(1);
    }
  });

  it("shows no whirl before anything is measured", () => {
    const state = twinState({ rpm: 2950, load_n: 500, measured: null });
    expect(state.measured).toBe(false);
    expect(state.orbit1x).toBe(0);
    expect(state.orbit2x).toBe(0);
    expect(state.jitter).toBe(0);
    expect(state.spinRevPerSec).toBeGreaterThan(0);
  });

  it("maps a measured reading", () => {
    const state = twinState({ rpm: 3300, load_n: 2000, measured: MEASURED });
    expect(state.orbit1x).toBeCloseTo(50 * ORBIT_UNITS_PER_UM);
    expect(state.figureEight).toBe(false);
    expect(state.bearingColor).toBe(bearingColor(10));
    expect(state.loadArrowLength).toBeCloseTo(loadArrowLength(2000));
  });
});
