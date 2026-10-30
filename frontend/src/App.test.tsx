import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "./App";
import { makeTrace } from "./test/fixtures";

const CASES = [
  { case_id: "case-k7", title: "Pump drive A", note: "Loose weight.", initial_rpm: 2950, initial_load_n: 500 },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubBackend(metaConfigured = false) {
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
    if (url === "/api/investigations" && init?.method === "POST") {
      return Promise.resolve(json(makeTrace({ planner: "info_gain" })));
    }
    if (url === "/api/investigations") return Promise.resolve(json([]));
    return Promise.resolve(json({ detail: "not found" }, 404));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

  it("runs an investigation and opens the player", async () => {
    const fetchMock = stubBackend(true);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Investigate Pump drive A" }));
    expect(await screen.findByRole("group", { name: "Player controls" })).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      case_id: "case-k7",
      planner: "meta",
      seed: 0,
    });
  });

  it("shows an error when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 503");
    expect(screen.getByText("Simulated")).toBeVisible();
  });
});
