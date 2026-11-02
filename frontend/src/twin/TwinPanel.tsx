import { Suspense, lazy, useState } from "react";

import ErrorBoundary from "../ErrorBoundary";
import { celsius, newtons, rpm, um } from "../format";
import { ORBIT_EXAGGERATION, SPIN_SLOWDOWN, twinState, type TwinReading } from "./mapping";

const ShaftScene = lazy(() => import("./ShaftScene"));

let webglSupport: boolean | null = null;

function detectWebgl(): boolean {
  if (typeof WebGLRenderingContext === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    // Release the probe context at once; browsers cap the number of live WebGL contexts.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

/** Probed once per page load, not on every mount. */
function webglAvailable(): boolean {
  webglSupport ??= detectWebgl();
  return webglSupport;
}

/** Twin view plus a text description of everything it shows. */
export default function TwinPanel({ reading, seed }: { reading: TwinReading; seed: number }) {
  const state = twinState(reading);
  const [canRender] = useState(webglAvailable);
  const m = reading.measured;

  return (
    <figure className="space-y-2">
      <div className="h-56 w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-950">
        {canRender ? (
          <ErrorBoundary
            label="3D twin"
            fallback={
              <p className="p-3 text-sm text-slate-500">
                3D view failed to load; the description below still applies.
              </p>
            }
          >
            <Suspense fallback={<p className="p-3 text-sm">Loading 3D twin…</p>}>
              <ShaftScene state={state} seed={seed} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <p className="p-3 text-sm text-slate-500">3D view unavailable (no WebGL).</p>
        )}
      </div>
      <figcaption className="text-xs text-slate-600 dark:text-slate-400">
        Simulated twin at {rpm(reading.rpm)} (spin shown {SPIN_SLOWDOWN}× slower),{" "}
        {newtons(reading.load_n)} load (blue arrow).{" "}
        {m ? (
          <>
            Whirl orbit from measured 1x {um(m.amp_1x_um)} and 2x {um(m.amp_2x_um)}, exaggerated{" "}
            {ORBIT_EXAGGERATION.toLocaleString("en-US")}×
            {state.figureEight ? "; strong 2x draws a figure-eight" : ""}
            {state.jitter > 0 ? "; jitter from broadband above the sensor floor" : ""}. Bearing
            tint from a {celsius(m.temp_rise_c)} temperature rise.
          </>
        ) : (
          "No orbit shown: only the alarm's overall level is known so far."
        )}
      </figcaption>
    </figure>
  );
}
