import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TwinPanel from "./TwinPanel";

vi.mock("./ShaftScene", () => ({
  default: () => {
    throw new Error("scene crashed");
  },
}));

const reading = { rpm: 2950, load_n: 500, measured: null };

describe("TwinPanel", () => {
  it("probes WebGL once, releases the probe context and contains a 3D scene crash", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loseContext = vi.fn();
    const probe = { getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null) };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(probe as unknown as RenderingContext);
    vi.stubGlobal("WebGLRenderingContext", class {});

    render(<TwinPanel reading={reading} seed={0} />).unmount();
    render(<TwinPanel reading={reading} seed={0} />);

    expect(getContext).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/3D view failed to load/)).toBeVisible();
    expect(screen.getByText(/No orbit shown/)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
