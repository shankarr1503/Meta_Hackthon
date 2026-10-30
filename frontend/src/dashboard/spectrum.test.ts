import { describe, expect, it } from "vitest";

import { spectrumSummary } from "./spectrum";

describe("spectrumSummary", () => {
  it("reads the amplitude nearest the 1x and 2x lines", () => {
    const freq = [0, 25, 49, 50, 51, 100];
    const amp = [0, 0.1, 0.2, 12, 0.3, 3];
    expect(spectrumSummary(freq, amp, 3000)).toBe("1x at 50.0 Hz: 12.0 µm; 2x at 100.0 Hz: 3.00 µm.");
  });

  it("says when the shaft is stopped", () => {
    expect(spectrumSummary([0, 1], [0, 0], 0)).toMatch(/stopped/);
  });
});
