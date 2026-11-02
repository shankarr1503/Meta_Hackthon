import { useState, type FormEvent } from "react";

import { askInvestigation } from "../api/client";
import type { Answer } from "../api/types";
import Panel from "./Panel";

/** Starter questions an engineer would ask; each is sent exactly as shown. */
const SUGGESTED_QUESTIONS = [
  "Why not the runner-up hypothesis?",
  "Which experiment mattered most, and what reading decided it?",
  "What would have changed the diagnosis?",
  "What should I check first on the physical machine?",
];

const MIN_CHARS = 3;
const MAX_CHARS = 300;

interface Props {
  investigationId: string;
  metaConfigured: boolean;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Lets the user question a finished investigation. The Meta model answers from the saved
 * trace only; answers are shown here, never written into the replay, and this panel
 * computes nothing: every number in an answer was quoted from the recorded evidence.
 */
export default function AskPanel({ investigationId, metaConfigured }: Props) {
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (text: string) => {
    const clean = text.trim();
    if (clean.length < MIN_CHARS || busy) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await askInvestigation(investigationId, clean);
      setAnswers((previous) => [answer, ...previous]);
      setQuestion("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };

  return (
    <Panel title="Ask the investigator">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        The Meta model answers from this investigation&apos;s recorded evidence only. Answers are
        not saved and cannot change a measurement, a probability or the diagnosis.
      </p>

      {metaConfigured ? (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            Your question
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={question}
                maxLength={MAX_CHARS}
                disabled={busy}
                placeholder="e.g. Why was misalignment ruled out?"
                onChange={(e) => setQuestion(e.target.value)}
                className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="submit"
                disabled={busy || question.trim().length < MIN_CHARS}
                className="rounded bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                Ask
              </button>
            </div>
          </label>
          <ul aria-label="Suggested questions" className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void ask(suggestion)}
                  className="rounded-full border border-indigo-300 px-3 py-1 text-xs text-indigo-800 hover:bg-indigo-50 disabled:opacity-40 dark:border-indigo-700 dark:text-indigo-200 dark:hover:bg-indigo-950"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </form>
      ) : (
        <p role="note" className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          Questions need the Meta model, which is not configured on this server. The recorded
          explanation above was written by the investigator that ran this case.
        </p>
      )}

      {busy && (
        <p role="status" className="mt-3 text-sm text-slate-500">
          Asking the Meta model…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}

      {answers.length > 0 && (
        <ol aria-label="Answers" className="mt-4 space-y-3">
          {answers.map((item, index) => (
            <li
              key={`${answers.length - index}-${item.question}`}
              className="rounded border border-slate-200 p-3 text-sm dark:border-slate-800"
            >
              <p className="font-semibold">{item.question}</p>
              <p className="mt-1 leading-relaxed">{item.answer}</p>
              <p className="mt-2 text-xs text-slate-500">
                {item.ok
                  ? `Answered by ${item.model} from the recorded evidence.`
                  : `Fallback: the model gave no usable answer (${item.error_kind ?? "error"}); the recorded explanation is shown instead.`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
