import { useEffect, useMemo, useState } from "react";

import type { Trace } from "../api/types";
import { buildFrames, viewAt } from "./player";

export const FRAME_MS = 1400;

/** Step player over one trace: play, pause, step forward and back. */
export function useInvestigation(trace: Trace) {
  const frames = useMemo(() => buildFrames(trace), [trace]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = frames.length - 1;

  useEffect(() => {
    if (!playing || index >= last) return;
    const timer = window.setTimeout(() => {
      setIndex(index + 1);
      if (index + 1 >= last) setPlaying(false);
    }, FRAME_MS);
    return () => window.clearTimeout(timer);
  }, [playing, index, last]);

  return {
    view: viewAt(trace, frames, index),
    index,
    total: frames.length,
    playing,
    atStart: index === 0,
    atEnd: index === last,
    play: () => {
      if (index >= last) setIndex(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    forward: () => setIndex((i) => Math.min(i + 1, last)),
    back: () => setIndex((i) => Math.max(i - 1, 0)),
    toEnd: () => {
      setPlaying(false);
      setIndex(last);
    },
    restart: () => {
      setPlaying(false);
      setIndex(0);
    },
  };
}

export type Player = ReturnType<typeof useInvestigation>;
