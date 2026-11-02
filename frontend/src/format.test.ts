import { describe, expect, it } from "vitest";
import { percent, probability } from "./format";

describe("probability", () => {
  it("never displays a rounded-up certainty", () => {
    expect(probability(1)).toBe(">99.9%");
    expect(probability(0.9996)).toBe(">99.9%");
    expect(probability(0.0002)).toBe("<0.1%");
  });

  it("shows ordinary values and exact zero as numbers", () => {
    expect(probability(0.9994)).toBe("99.9%");
    expect(probability(0.412)).toBe("41.2%");
    expect(probability(0)).toBe("0.0%");
  });

  it("leaves exact accuracies to percent", () => {
    expect(percent(1)).toBe("100.0%");
  });
});
