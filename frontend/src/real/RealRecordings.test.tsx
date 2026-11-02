import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RealRecordings from "./RealRecordings";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: () => <div>Measured chart</div>,
  Line: () => null, CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null,
}));

const channels = Array.from({ length: 4 }, (_, channel) => ({
  channel, features: { rms: channel + 0.5 }, waveform: [], spectrum: [],
}));
const report = {
  source: "measured_laboratory", dataset: { dataset_url: "https://data.mendeley.com/datasets/zx8pfhdtnb/1",
    license: "CC BY 4.0", license_url: "https://creativecommons.org/licenses/by/4.0/", attribution: "Brito et al. (2022)" },
  sample_rate_hz: 25000, duration_s: 1, shaft_rpm_approximate: 1238,
  amplitude_units: "native source units", reference_trials: 12, held_out_trials: 8,
  model: "test-model", baseline_correct: 6, meta_correct: 7, meta_accuracy_ci95: [0.53, 0.98],
  model_errors: 0, limitations: ["Real laboratory recordings, not a live factory connection."],
  records: [{ id: "real-a", split: "held_out", label: "misalignment", channels,
    provenance: { archive: "Test 13_Misalignment.zip", member: "source.npy", recording_sha256: "abc123" },
    baseline: { label: "unbalance" }, meta: { label: "misalignment", reason: "Compared recorded channels.",
      events: [{ action: "inspect", channel: 2, reason: "Compare disc-side vibration." }], observed_channels: [0, 2] } }],
};

describe("RealRecordings", () => {
  it("shows measured data and attribution, and reveals the source label only on request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(report))));
    render(<RealRecordings />);
    expect(await screen.findByRole("heading", { name: "Real machine recordings" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Original dataset" })).toHaveAttribute("href", report.dataset.dataset_url);
    expect(screen.queryByText(/Dataset label:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Test 13_Misalignment.zip/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Reveal dataset label/ }));
    expect(screen.getByText(/Dataset label:/)).toBeVisible();
    expect(screen.getByText(/Test 13_Misalignment.zip/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show sensor 3" }));
    expect(screen.getByLabelText("Measured sensor")).toHaveValue("2");
    expect(screen.getByText("2.5000")).toBeVisible();
  });

  it("explains an empty held-out list instead of crashing", async () => {
    const empty = { ...report, records: [{ ...report.records[0], split: "reference" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(empty))));
    render(<RealRecordings />);
    expect(await screen.findByText(/no held-out recordings/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Real machine recordings" })).toBeVisible();
    expect(screen.queryByLabelText("Held-out recording")).not.toBeInTheDocument();
  });

  it("reports unavailable real evidence instead of substituting simulated measurements", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    render(<RealRecordings />);
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
  });
});
