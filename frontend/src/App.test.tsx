import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "./App";

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("App", () => {
  it("shows the health status from /api/health and the Simulated label", async () => {
    const fetchMock = stubFetch(
      new Response(
        JSON.stringify({
          status: "ok",
          service: "failurelab-ai",
          version: "0.1.0",
          contract_version: "1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<App />);

    expect(await screen.findByText("ok")).toBeInTheDocument();
    expect(screen.getByText("failurelab-ai")).toBeInTheDocument();
    expect(screen.getByText("Simulated")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith("/api/health");
  });

  it("shows an error when the backend is unreachable", async () => {
    stubFetch(new Response("", { status: 503 }));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 503");
    expect(screen.getByText("Simulated")).toBeVisible();
  });
});
