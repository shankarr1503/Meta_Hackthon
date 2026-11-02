import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ManualLab from "./ManualLab";

const RESULT = {
  amp_1x_um: 21.5,
  amp_2x_um: 4.3,
  broadband_um: 2.05,
  temp_rise_c: 8.25,
  time_s: [0, 0.001],
  displacement_um: [0, 1],
  spectrum_freq_hz: [0, 50, 100],
  spectrum_amp_um: [0, 21, 4],
  source: "simulation",
  kind: "lab",
  model_version: "rotor-1",
  curve_rpm: [0, 3600, 6000],
  curve_amp_1x_um: [0, 90, 20],
  curve_amp_2x_um: [0, 18, 4],
};

function stubLab() {
  const fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function flush() {
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

describe("ManualLab", () => {
  afterEach(() => vi.useRealTimers());

  it("simulates the preset machine and shows readings", async () => {
    vi.useFakeTimers();
    const fetchMock = stubLab();
    render(<ManualLab />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/lab/simulate");
    expect(JSON.parse(init.body)).toEqual({
      imbalance: 0.3,
      misalignment: 0,
      friction: 0,
      rpm: 2950,
      load_n: 500,
      seed: 0,
    });
    expect(screen.getByText("21.5 µm")).toBeInTheDocument();
    expect(screen.getByText("8.3 °C")).toBeInTheDocument();
    expect(screen.getByText(/1x peaks at 90.0 µm near 3,600 RPM/)).toBeInTheDocument();
    expect(screen.getByText("Simulated")).toBeVisible();
  });

  it("debounces slider changes into one request", async () => {
    vi.useFakeTimers();
    const fetchMock = stubLab();
    render(<ManualLab />);
    await flush();
    const speed = screen.getByLabelText(/Speed/);
    fireEvent.change(speed, { target: { value: "4000" } });
    fireEvent.change(speed, { target: { value: "4500" } });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).rpm).toBe(4500);
  });

  it("shows backend errors", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "bad input" }), { status: 422 }),
      ),
    );
    render(<ManualLab />);
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("bad input");
  });

  it("keeps the noise seed inside the backend integer range", async () => {
    vi.useFakeTimers();
    const fetchMock = stubLab();
    render(<ManualLab />);
    await flush();
    const seed = screen.getByLabelText("Noise seed");
    fireEvent.change(seed, { target: { value: "2.7" } });
    await flush();
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body).seed).toBe(2);
    fireEvent.change(seed, { target: { value: "999999999999" } });
    await flush();
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body).seed).toBe(2147483647);
  });
});
