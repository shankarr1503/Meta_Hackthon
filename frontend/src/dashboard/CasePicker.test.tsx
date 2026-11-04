import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CaseView } from "../api/types";
import CasePicker from "./CasePicker";

const CASES: CaseView[] = [
  { case_id: "case-k7", title: "Pump drive A", note: "Loose weight.", initial_rpm: 2950, initial_load_n: 500 },
  { case_id: "case-r2", title: "Conveyor gearbox input", note: "Re-mounted motor.", initial_rpm: 2950, initial_load_n: 500 },
];

describe("CasePicker case actions", () => {
  it("names each case in its visible button text, not just its aria-label", () => {
    render(
      <CasePicker
        cases={CASES}
        replays={[]}
        metaConfigured={false}
        busy={false}
        onRun={vi.fn()}
        onRunFresh={vi.fn()}
        onOpenReplay={vi.fn()}
      />,
    );
    const buttons = CASES.map((c) =>
      screen.getByRole("button", { name: `Investigate ${c.title}` }),
    );
    for (const [i, button] of buttons.entries()) {
      expect(button).toHaveTextContent(`Investigate ${CASES[i].title}`);
    }
    expect(new Set(buttons.map((b) => b.textContent)).size).toBe(CASES.length);
  });
});
