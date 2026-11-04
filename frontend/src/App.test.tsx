import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TraceSummary } from "./api/types";
import App from "./App";
import { installFakeEventSource, liveFrames, makeTrace } from "./test/fixtures";

const CASES = [
  { case_id: "case-k7", title: "Pump drive A", note: "Loose weight.", initial_rpm: 2950, initial_load_n: 500 },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubBackend(metaConfigured = false, replays: TraceSummary[] = []) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/ready") {
      return Promise.resolve(
        json({
          status: "ok",
          physics_model_version: "rotor-1",
          meta_model_configured: metaConfigured,
          meta_model: "",
        }),
      );
    }
    if (url === "/api/cases") return Promise.resolve(json(CASES));
    if (url === "/api/cases/fresh-77") {
      return Promise.resolve(
        json({
          case_id: "fresh-77",
          title: "Unseen machine 77",
          note: "No maintenance history is available for this machine.",
          initial_rpm: 2950,
          initial_load_n: 500,
        }),
      );
    }
    if (url === "/api/investigations" && init?.method === "POST") {
      return Promise.resolve(json(makeTrace({ planner: "info_gain" })));
    }
    if (url === "/api/investigations") return Promise.resolve(json(replays));
    return Promise.resolve(json({ detail: "not found" }, 404));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubEventSource() {
  let capturedUrl: string | null = null;
  class FakeEventSource {
    onmessage: ((e: { data: string }) => void) | null = null;
    constructor(url: string) {
      capturedUrl = url;
      queueMicrotask(() => {
        this.onmessage?.({
          data: JSON.stringify({
            kind: "prior",
            investigation_id: "case-k7-info_gain-0",
            case: CASES[0],
            planner: "info_gain",
            seed: 0,
            prior: { probabilities: {}, reason: "prior" },
          }),
        });
        this.onmessage?.({
          data: JSON.stringify({ kind: "trace", trace: makeTrace() }),
        });
      });
    }
    close() {}
  }
  vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
  return { url: () => capturedUrl };
}

describe("App", () => {
  it("lists cases with the Simulated label", async () => {
    stubBackend();
    render(<App />);
    expect(await screen.findByText("Pump drive A")).toBeInTheDocument();
    expect(screen.getByText("Simulated")).toBeVisible();
    expect(screen.getByText("No saved investigations yet.")).toBeInTheDocument();
  });

  it("defaults to information gain when the Meta model is not configured", async () => {
    stubBackend(false);
    render(<App />);
    const select = await screen.findByLabelText("Investigator");
    expect(select).toHaveValue("info_gain");
    fireEvent.change(select, { target: { value: "meta" } });
    expect(screen.getByRole("note")).toHaveTextContent("not configured");
    expect(screen.getByRole("button", { name: "Investigate Pump drive A" })).toBeDisabled();
  });

  it("opens a live investigation stream when a case is investigated", async () => {
    stubBackend(true);
    const { url } = stubEventSource();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Investigate Pump drive A" }));
    await screen.findByText("Pump drive A");
    expect(url()).toBe("/api/investigations/stream?case_id=case-k7&planner=meta&seed=0");
  });

  it("investigates a fresh machine by seed through its public case view", async () => {
    stubBackend(true);
    const { url } = stubEventSource();
    render(<App />);
    fireEvent.change(await screen.findByLabelText("Machine seed"), { target: { value: "77" } });
    fireEvent.click(screen.getByRole("button", { name: "Investigate unseen machine" }));
    expect(await screen.findByText("Unseen machine 77")).toBeInTheDocument();
    await waitFor(() =>
      expect(url()).toBe("/api/investigations/stream?case_id=fresh-77&planner=meta&seed=0"),
    );
  });

  it("starts the unseen machine on a fresh seed and warns when a seed was already run", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    stubBackend(true, [
      {
        investigation_id: "fresh-4242-meta-0-20261102132418",
        case_id: "fresh-4242",
        planner: "meta",
        seed: 0,
        top: "healthy",
        probability: 0.99,
        experiments: 1,
        cost: 1,
        demo: true,
      },
    ]);
    render(<App />);
    const machineSeed = await screen.findByLabelText("Machine seed");
    expect(machineSeed).toHaveValue(5000);
    fireEvent.change(machineSeed, { target: { value: "4242" } });
    expect(screen.getByText(/no longer unseen/)).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("reports when a fresh machine cannot be looked up", async () => {
    stubBackend(true);
    render(<App />);
    fireEvent.change(await screen.findByLabelText("Machine seed"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Investigate unseen machine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not found");
    expect(screen.getByRole("button", { name: "Investigate unseen machine" })).toBeEnabled();
  });

  it("shows the configured Meta model in the header", async () => {
    const fetchMock = stubBackend(true);
    fetchMock.mockImplementation((url: string) =>
      url === "/api/ready"
        ? Promise.resolve(
            json({
              status: "ok",
              physics_model_version: "rotor-1",
              meta_model_configured: true,
              meta_model: "muse-spark-1.3",
            }),
          )
        : url === "/api/cases"
          ? Promise.resolve(json(CASES))
          : Promise.resolve(json([])),
    );
    render(<App />);
    expect(await screen.findByText("Meta model muse-spark-1.3 · live")).toBeVisible();
  });

  it("shows an error when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 503");
    expect(screen.getByText("Simulated")).toBeVisible();
  });

  it("sends a valid integer seed when a fractional seed is entered", async () => {
    stubBackend();
    const { url } = stubEventSource();
    render(<App />);
    fireEvent.change(await screen.findByLabelText("Seed"), { target: { value: "2.7" } });
    fireEvent.click(screen.getByRole("button", { name: "Investigate Pump drive A" }));
    await screen.findByText("Pump drive A");
    expect(url()).toBe("/api/investigations/stream?case_id=case-k7&planner=info_gain&seed=2");
  });
});

describe("App navigation", () => {
  it("switches to the manual lab", async () => {
    stubBackend();
    render(<App />);
    await screen.findByText("Pump drive A");
    fireEvent.click(screen.getByRole("button", { name: "Manual lab" }));
    expect(screen.getByRole("heading", { name: "Manual lab" })).toBeInTheDocument();
    expect(screen.queryByText("Pump drive A")).not.toBeInTheDocument();
  });

  it("writes the section into the URL so browser Back returns to it", async () => {
    window.history.pushState({}, "", "/");
    stubBackend();
    render(<App />);
    await screen.findByText("Pump drive A");
    fireEvent.click(screen.getByRole("button", { name: "Benchmark" }));
    expect(window.location.search).toContain("view=benchmark");
    // Browser Back fires popstate with the previous URL restored.
    window.history.pushState({}, "", "/?view=investigate");
    fireEvent(window, new Event("popstate"));
    expect(await screen.findByText("Pump drive A")).toBeInTheDocument();
  });

  it("opens the section named by a deep link", async () => {
    window.history.pushState({}, "", "/?view=lab");
    stubBackend();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Manual lab" })).toBeInTheDocument();
    window.history.pushState({}, "", "/");
  });
});

describe("App live investigations", () => {
  const listCalls = (fetchMock: ReturnType<typeof stubBackend>) =>
    fetchMock.mock.calls.filter(([url, init]) => url === "/api/investigations" && !init).length;

  async function startRun() {
    const fetchMock = stubBackend(true);
    const opened = installFakeEventSource();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Investigate Pump drive A" }));
    await waitFor(() => expect(opened).toHaveLength(1));
    const frames = liveFrames(makeTrace());
    const send = (count = frames.length, from = 0) =>
      act(() => {
        for (const frame of frames.slice(from, from + count)) opened[0].emit(frame);
      });
    return { fetchMock, opened, send };
  }

  it("goes back to the cases after a live run and refreshes the saved replays", async () => {
    const { fetchMock, opened, send } = await startRun();
    send();
    expect(screen.getByRole("heading", { name: /^Diagnosis:/ })).toBeVisible();
    const before = listCalls(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: /Back to cases/ }));
    expect(await screen.findByRole("button", { name: "Investigate Pump drive A" })).toBeVisible();
    await waitFor(() => expect(listCalls(fetchMock)).toBe(before + 1));
    expect(opened[0].closed).toBe(true);
  });

  it("closes an unfinished stream when going back to the cases", async () => {
    const { opened, send } = await startRun();
    send(2);
    fireEvent.click(screen.getByRole("button", { name: /Back to cases/ }));
    expect(await screen.findByRole("button", { name: "Investigate Pump drive A" })).toBeVisible();
    expect(opened[0].closed).toBe(true);
  });

  it("keeps one stream running while other tabs are shown", async () => {
    const { opened, send } = await startRun();
    send(2);
    fireEvent.click(screen.getByRole("button", { name: "Manual lab" }));
    expect(screen.getByRole("heading", { name: "Manual lab" })).toBeVisible();
    expect(screen.getByText(/Only this single number is known/)).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Benchmark" }));
    fireEvent.click(screen.getByRole("button", { name: "Investigate" }));
    expect(screen.getByText(/Only this single number is known/)).toBeVisible();
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(opened).toHaveLength(1);
    expect(opened[0].closed).toBe(false);
    send(Infinity, 2);
    expect(screen.getByRole("button", { name: "Open full replay" })).toBeVisible();
  });

  it("starts a fresh view for every run", async () => {
    const { opened, send } = await startRun();
    send();
    fireEvent.click(screen.getByRole("button", { name: /Back to cases/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Investigate Pump drive A" }));
    await waitFor(() => expect(opened).toHaveLength(2));
    expect(screen.queryByRole("heading", { name: /^Diagnosis:/ })).not.toBeInTheDocument();
    expect(screen.getByText("No experiments run yet.")).toBeVisible();
  });

  it("opens the finished live run as a full replay", async () => {
    const { send } = await startRun();
    send();
    fireEvent.click(screen.getByRole("button", { name: "Open full replay" }));
    expect(screen.getByRole("group", { name: "Player controls" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Open full replay" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Back to cases/ }));
    expect(await screen.findByRole("button", { name: "Investigate Pump drive A" })).toBeVisible();
  });

  it("lists saved replays without revealing their diagnosis", async () => {
    stubBackend(false, [
      {
        investigation_id: "case-k7-info_gain-0",
        case_id: "case-k7",
        planner: "info_gain",
        seed: 0,
        top: "imbalance",
        probability: 0.99,
        experiments: 3,
        cost: 4,
        demo: true,
      },
    ]);
    render(<App />);
    expect(await screen.findByText(/seed 0 · 3 experiments · 4 points/)).toBeVisible();
    expect(screen.queryByText(/Imbalance|99/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open replay case-k7-info_gain-0" })).toBeVisible();
  });
});
