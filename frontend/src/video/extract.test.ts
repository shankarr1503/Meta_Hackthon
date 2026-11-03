import { describe, expect, it } from "vitest";

import { deriveFps, meanLuminance } from "./extract";

describe("deriveFps", () => {
  it("derives the frame rate from media timestamps", () => {
    const times = Array.from({ length: 61 }, (_, i) => i / 60);
    expect(deriveFps(times)).toBeCloseTo(60, 5);
  });

  it("returns 0 for degenerate inputs", () => {
    expect(deriveFps([])).toBe(0);
    expect(deriveFps([1])).toBe(0);
    expect(deriveFps([2, 2])).toBe(0);
  });
});

describe("meanLuminance", () => {
  it("weights RGB by Rec.709 and ignores alpha", () => {
    const white = new Uint8ClampedArray([255, 255, 255, 0]);
    expect(meanLuminance(white)).toBeCloseTo(255, 3);
    const green = new Uint8ClampedArray([0, 255, 0, 255]);
    expect(meanLuminance(green)).toBeCloseTo(0.7152 * 255, 3);
  });

  it("averages over all pixels", () => {
    const two = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    expect(meanLuminance(two)).toBeCloseTo(127.5, 3);
  });
});
