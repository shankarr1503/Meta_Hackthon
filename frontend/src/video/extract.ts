/** Client-side motion extraction for experimental video vibrometry.
 *
 * The browser decodes the user's own video and samples the mean luminance of a small
 * patch around a user-chosen point, one value per video frame. Only that number series
 * leaves the browser; the video file never does.
 */

/** The one machine-speed rule (60–30,000 RPM) for video analysis and assessment. */
export function machineRpm(text: string): number | null {
  const rpm = Number(text);
  return text.trim() !== "" && rpm >= 60 && rpm <= 30000 ? rpm : null;
}

export const ROI_SIZE = 32;
export const MAX_SAMPLES = 20_000;
export const MIN_SAMPLES = 64;

/** Frame rate implied by per-frame media timestamps. */
export function deriveFps(frameTimes: number[]): number {
  if (frameTimes.length < 2) return 0;
  const span = frameTimes[frameTimes.length - 1] - frameTimes[0];
  return span > 0 ? (frameTimes.length - 1) / span : 0;
}

/** Mean Rec.709 luminance of RGBA pixel data (0-255). */
export function meanLuminance(rgba: Uint8ClampedArray): number {
  let total = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    total += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
  }
  return total / (rgba.length / 4);
}

export interface ExtractedSeries {
  fps: number;
  samples: number[];
}

type VideoFrameCallback = (now: number, metadata: { mediaTime: number }) => void;
type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: VideoFrameCallback) => number;
};

/** Sample the patch around `point` (relative 0-1 coordinates) across the whole video. */
export function extractSeries(
  video: HTMLVideoElement,
  point: { x: number; y: number },
): Promise<ExtractedSeries> {
  const withCallback = video as VideoWithFrameCallback;
  if (typeof withCallback.requestVideoFrameCallback !== "function") {
    return Promise.reject(
      new Error("This browser cannot read video frames; use a Chromium-based or Safari browser."),
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = ROI_SIZE;
  canvas.height = ROI_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return Promise.reject(new Error("Could not create a canvas context."));

  const samples: number[] = [];
  const times: number[] = [];

  return new Promise<ExtractedSeries>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (samples.length < MIN_SAMPLES) {
        reject(
          new Error(
            `Only ${samples.length} frames could be read; use a longer clip (at least ` +
              `${MIN_SAMPLES} frames, ideally a few seconds).`,
          ),
        );
        return;
      }
      resolve({ fps: deriveFps(times), samples });
    };
    const step: VideoFrameCallback = (_, metadata) => {
      if (settled) return;
      const sx = Math.min(
        Math.max(point.x * video.videoWidth - ROI_SIZE / 2, 0),
        Math.max(video.videoWidth - ROI_SIZE, 0),
      );
      const sy = Math.min(
        Math.max(point.y * video.videoHeight - ROI_SIZE / 2, 0),
        Math.max(video.videoHeight - ROI_SIZE, 0),
      );
      context.drawImage(video, sx, sy, ROI_SIZE, ROI_SIZE, 0, 0, ROI_SIZE, ROI_SIZE);
      samples.push(meanLuminance(context.getImageData(0, 0, ROI_SIZE, ROI_SIZE).data));
      times.push(metadata.mediaTime);
      if (video.ended || samples.length >= MAX_SAMPLES) {
        video.pause();
        finish();
        return;
      }
      withCallback.requestVideoFrameCallback?.(step);
    };
    // The last frame callback can fire before `ended` turns true, after which no further
    // callbacks arrive: the ended event is what reliably closes the extraction.
    video.onended = finish;
    video.onerror = () => {
      if (!settled) {
        settled = true;
        reject(new Error("The video could not be decoded."));
      }
    };
    video.currentTime = 0;
    video.muted = true;
    withCallback.requestVideoFrameCallback?.(step);
    void video.play().catch(() => {
      // The browser's own message ("no supported sources") means nothing to a
      // user; say what to do instead.
      reject(
        new Error(
          "The video could not be decoded. Try another clip (MP4, MOV or WebM), " +
            "ideally a short slow-motion recording.",
        ),
      );
    });
  });
}
