import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Answer } from "../api/types";
import AskPanel from "./AskPanel";

const SUGGESTION = "Which experiment mattered most, and what reading decided it?";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function answer(overrides: Partial<Answer> = {}): Answer {
  return {
    investigation_id: "case-r2-meta-0-20261102030032",
    question: "Why not imbalance?",
    answer: "At 1500 RPM the 2x reading was 70.78 µm, far above the imbalance prediction.",
    model: "muse-spark-1.3",
    ok: true,
    fallback: false,
    usage: null,
    error_kind: null,
    error: null,
    source: "simulation",
    ...overrides,
  };
}

describe("AskPanel", () => {
  it("explains that it needs the Meta model when it is not configured", () => {
    render(<AskPanel investigationId="case-r2-info_gain-0" metaConfigured={false} />);
    expect(screen.getByRole("note")).toHaveTextContent("not configured");
    expect(screen.queryByRole("button", { name: "Ask" })).not.toBeInTheDocument();
  });

  it("sends a typed question and shows the grounded answer", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json(answer())));
    vi.stubGlobal("fetch", fetchMock);
    render(<AskPanel investigationId="case-r2-meta-0-20261102030032" metaConfigured />);

    const input = screen.getByLabelText("Your question");
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "Why not imbalance?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText(/70\.78 µm/)).toBeInTheDocument();
    expect(screen.getByText("Answered by muse-spark-1.3 from the recorded evidence.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/investigations/case-r2-meta-0-20261102030032/ask",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ question: "Why not imbalance?" }),
      }),
    );
    expect(input).toHaveValue("");
  });

  it("sets the wait expectation while the model is answering", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    render(<AskPanel investigationId="case-r2-meta-0-20261102030032" metaConfigured />);
    fireEvent.change(screen.getByLabelText("Your question"), {
      target: { value: "Why not imbalance?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/usually a few seconds/);
  });

  it("sends a suggested question exactly as shown", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(json(answer({ question: SUGGESTION, answer: "Experiment 2." }))),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AskPanel investigationId="case-r2-meta-0-20261102030032" metaConfigured />);
    fireEvent.click(screen.getByRole("button", { name: SUGGESTION }));
    expect(await screen.findByText("Experiment 2.")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ question: SUGGESTION });
  });

  it("labels a fallback answer and keeps earlier answers", async () => {
    const replies = [
      answer(),
      answer({
        question: "Second?",
        answer: "The Meta model could not answer this question (model request timed out). The recorded explanation says: misalignment.",
        ok: false,
        fallback: true,
        error_kind: "model_error",
        error: "model request timed out",
      }),
    ];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(json(replies.shift()))));
    render(<AskPanel investigationId="case-r2-meta-0-20261102030032" metaConfigured />);
    const input = screen.getByLabelText("Your question");
    fireEvent.change(input, { target: { value: "Why not imbalance?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText(/70\.78 µm/);
    fireEvent.change(input, { target: { value: "Second?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText(/Fallback:/);
    const items = within(screen.getByRole("list", { name: "Answers" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Second?");
    expect(items[0]).toHaveTextContent("Fallback: the model gave no usable answer (model_error)");
    expect(screen.getByText(/70\.78 µm/)).toBeInTheDocument();
  });

  it("shows the server's error message when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(json({ detail: "The hourly limit of questions has been reached." }, 429))),
    );
    render(<AskPanel investigationId="case-r2-meta-0-20261102030032" metaConfigured />);
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Why?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("hourly limit of questions"),
    );
  });
});
