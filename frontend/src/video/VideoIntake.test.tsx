import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { VideoAnalysis } from "../api/types";
import VideoIntake, { VideoResults } from "./VideoIntake";

const ANALYSIS: VideoAnalysis = {
  source: "video",
  sample_rate_hz: 240,
  duration_s: 4,
  nyquist_hz: 120,
  rms: 7.9,
  crest_factor: 1.9,
  waveform_t_s: [0, 0.1],
  waveform: [0.5, -0.5],
  spectrum_freq_hz: [0, 25, 50],
  spectrum: [0, 10, 5],
  peaks: [
    { freq_hz: 25, amplitude: 10 },
    { freq_hz: 50, amplitude: 5 },
  ],
  shaft_hz_estimate: 25,
  harmonics: [
    { order: 1, freq_hz: 25, amplitude: 10 },
    { order: 2, freq_hz: 50, amplitude: 5 },
  ],
  note: "Experimental video vibrometry: not a calibrated measurement.",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("VideoIntake", () => {
  it("explains the method and its frame-rate limit before any upload", () => {
    render(<VideoIntake metaConfigured={true} />);
    expect(screen.getByText(/the video never leaves your computer/)).toBeInTheDocument();
    expect(screen.getByText(/half the frame rate/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Video file/)).toBeInTheDocument();
  });
});

describe("VideoResults", () => {
  it("shows peaks, extraction details and the honesty note", () => {
    render(<VideoResults analysis={ANALYSIS} nominalRpm={1500} metaConfigured={false} />);
    expect(screen.getAllByText("25.00 Hz").length).toBeGreaterThan(0);
    expect(screen.getByText("240.0 fps")).toBeInTheDocument();
    expect(screen.getByText(/Experimental video vibrometry/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("not configured");
  });

  it("sends the features for a Meta reading and shows the grounded reply", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        json({
          assessment: "Strong 2x over 1x is consistent with misalignment-like forcing.",
          model: "muse-spark-1.3",
          ok: true,
          fallback: false,
          usage: null,
          note: "Experimental video vibrometry.",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<VideoResults analysis={ANALYSIS} nominalRpm={1500} metaConfigured={true} />);
    fireEvent.click(screen.getByRole("button", { name: /Ask the Meta model/ }));
    await waitFor(() =>
      expect(screen.getByText(/misalignment-like forcing/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Read by muse-spark-1.3/)).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.nominal_rpm).toBe(1500);
    expect(body.peaks).toHaveLength(2);
    expect(body).not.toHaveProperty("spectrum");
    vi.unstubAllGlobals();
  });

  it("labels a fallback reply as such", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          json({
            assessment: "The Meta model could not assess this video (timeout).",
            model: "muse-spark-1.3",
            ok: false,
            fallback: true,
            usage: null,
            error_kind: "timeout",
            error: "slow",
            note: "Experimental video vibrometry.",
          }),
        ),
      ),
    );
    render(<VideoResults analysis={ANALYSIS} nominalRpm={null} metaConfigured={true} />);
    fireEvent.click(screen.getByRole("button", { name: /Ask the Meta model/ }));
    await waitFor(() => expect(screen.getByText(/Fallback shown/)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
