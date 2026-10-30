import { describe, expect, it } from "vitest";

import { casesLabel } from "./cases";

describe("casesLabel", () => {
  it("describes sealed and generated runs", () => {
    expect(casesLabel({ sealed_seeds: 5, generated_per_hypothesis: 20 })).toBe(
      "6 sealed × 5 seeds + 120 generated",
    );
    expect(casesLabel({ sealed_seeds: 3, generated_per_hypothesis: 0 })).toBe("6 sealed × 3 seeds");
  });
});
