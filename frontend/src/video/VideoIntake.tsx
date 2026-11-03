import { Fragment, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { analyzeVideo, assessVideo } from "../api/client";
import type { VideoAnalysis, VideoAssessment } from "../api/types";
import { extractSeries } from "./extract";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Spectrum of the extracted motion, in native pixel units. */
function VideoSpectrum({ analysis }: { analysis: VideoAnalysis }) {
  const data = analysis.spectrum_freq_hz.map((f, i) => ({ f, a: analysis.spectrum[i] }));
  const shaft = analysis.shaft_hz_estimate;
  return (
    <figure className="space-y-1">
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis
              dataKey="f"
              type="number"
              domain={[0, analysis.nyquist_hz]}
              tickCount={9}
              fontSize={11}
              label={{ value: "Hz", position: "insideBottomRight", offset: -8, fontSize: 11 }}
            />
            <YAxis fontSize={11} width={40} />
            <Tooltip
              formatter={(value) => [Number(value).toFixed(4), "Amplitude"]}
              labelFormatter={(f) => `${Number(f).toFixed(1)} Hz`}
            />
            {shaft !== null && (
              <ReferenceLine x={shaft} stroke="#1d4ed8" strokeDasharray="4 2" label="1x" />
            )}
            {shaft !== null && 2 * shaft <= analysis.nyquist_hz && (
              <ReferenceLine x={2 * shaft} stroke="#f59e0b" strokeDasharray="4 2" label="2x" />
            )}
            <Line dataKey="a" dot={false} stroke="#0f766e" strokeWidth={1.5} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-xs text-slate-600 dark:text-slate-400">
        Motion spectrum from the tracked point, native pixel units, readable up to{" "}
        {analysis.nyquist_hz.toFixed(1)} Hz (half the video frame rate).
      </figcaption>
    </figure>
  );
}

/** Extracted features, their spectrum and the optional Meta reading. Exported for tests. */
export function VideoResults({
  analysis,
  nominalRpm,
  metaConfigured,
}: {
  analysis: VideoAnalysis;
  nominalRpm: number | null;
  metaConfigured: boolean;
}) {
  const [context, setContext] = useState("");
  const [assessment, setAssessment] = useState<VideoAssessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      setAssessment(await assessVideo(analysis, context, nominalRpm));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <VideoSpectrum analysis={analysis} />
      <div className="grid gap-4 sm:grid-cols-2">
        <section aria-labelledby="video-peaks-heading" className="text-sm">
          <h4 id="video-peaks-heading" className="font-semibold">
            Strongest motion peaks
          </h4>
          {analysis.peaks.length === 0 ? (
            <p>No clear periodic motion found.</p>
          ) : (
            <table className="mt-1 w-full text-left font-mono text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="py-0.5 pr-4 font-normal">Frequency</th>
                  <th className="font-normal">Amplitude</th>
                </tr>
              </thead>
              <tbody>
                {analysis.peaks.map((p) => (
                  <tr key={p.freq_hz}>
                    <td className="py-0.5 pr-4">{p.freq_hz.toFixed(2)} Hz</td>
                    <td>{p.amplitude.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="text-sm">
          <h4 className="font-semibold">Extraction</h4>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-xs">
            <dt className="text-slate-500">Frame rate</dt>
            <dd>{analysis.sample_rate_hz.toFixed(1)} fps</dd>
            <dt className="text-slate-500">Duration</dt>
            <dd>{analysis.duration_s.toFixed(2)} s</dd>
            <dt className="text-slate-500">Readable to</dt>
            <dd>{analysis.nyquist_hz.toFixed(1)} Hz</dd>
            {analysis.shaft_hz_estimate !== null && (
              <>
                <dt className="text-slate-500">Shaft estimate</dt>
                <dd>{analysis.shaft_hz_estimate.toFixed(2)} Hz</dd>
              </>
            )}
            {analysis.harmonics.map((h) => (
              <Fragment key={h.order}>
                <dt className="text-slate-500">{h.order}x amplitude</dt>
                <dd>{h.amplitude.toFixed(4)}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      </div>

      <section aria-labelledby="video-assess-heading" className="space-y-2">
        <h4 id="video-assess-heading" className="text-sm font-semibold">
          Meta model reading
        </h4>
        {metaConfigured ? (
          <>
            <div className="flex flex-wrap gap-2">
              <input
                className="min-w-64 flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                placeholder="Optional context, e.g. workshop fan filmed at 240 fps"
                value={context}
                maxLength={300}
                onChange={(e) => setContext(e.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void ask()}
                className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {busy ? "Asking…" : "Ask the Meta model to read this spectrum"}
              </button>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            )}
            {assessment && (
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
                <p>{assessment.assessment}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {assessment.fallback
                    ? "Fallback shown: the model reply failed and this text is built from the features only."
                    : `Read by ${assessment.model} from the extracted features only.`}
                </p>
              </div>
            )}
          </>
        ) : (
          <p role="note" className="text-sm text-slate-600 dark:text-slate-400">
            The Meta model is not configured on this server, so the extracted spectrum is shown
            without a model reading.
          </p>
        )}
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-400">{analysis.note}</p>
    </div>
  );
}

export default function VideoIntake({ metaConfigured }: { metaConfigured: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [point, setPoint] = useState({ x: 0.5, y: 0.5 });
  const [rpmText, setRpmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(file));
    setAnalysis(null);
    setError(null);
  };

  const onPick = (event: React.MouseEvent<HTMLVideoElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPoint({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  };

  const extract = async () => {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    setError(null);
    setAnalysis(null);
    try {
      const series = await extractSeries(video, point);
      const rpm = Number(rpmText);
      setAnalysis(
        await analyzeVideo({
          fps: series.fps,
          samples: series.samples,
          nominal_rpm: rpmText && rpm >= 60 && rpm <= 30000 ? rpm : null,
        }),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="video-intake-heading" className="space-y-4">
      <header>
        <h2 id="video-intake-heading" className="text-lg font-semibold">
          Video intake <span className="font-normal text-slate-500">· experimental</span>
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Film the vibrating machine and upload the clip: the browser tracks the brightness of
          one point frame by frame and only that motion series is analysed — the video never
          leaves your computer. Vibration is readable up to half the frame rate, so prefer
          slow-motion (120 or 240 fps) for machines above about 900 RPM, and film a
          high-contrast edge near a bearing.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Video file</span>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Machine speed (RPM, optional)</span>
          <input
            type="number"
            min={60}
            max={30000}
            value={rpmText}
            onChange={(e) => setRpmText(e.target.value)}
            className="w-40 rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
          />
        </label>
        {url && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void extract()}
            className="rounded bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {busy ? "Reading frames…" : "Extract vibration"}
          </button>
        )}
      </div>

      {url && (
        <div className="relative w-fit">
          <video
            ref={videoRef}
            src={url}
            onClick={onPick}
            playsInline
            muted
            controls={!busy}
            className="max-h-80 rounded border border-slate-200 dark:border-slate-700"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-500"
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Click the point to track (amber ring) — pick a high-contrast edge that moves.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      {analysis && (
        <VideoResults
          analysis={analysis}
          nominalRpm={rpmText && Number(rpmText) >= 60 ? Number(rpmText) : null}
          metaConfigured={metaConfigured}
        />
      )}
    </section>
  );
}
