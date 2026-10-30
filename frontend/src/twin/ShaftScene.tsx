import { Canvas } from "@react-three/fiber";

import Bearing from "./Bearing";
import LoadArrow from "./LoadArrow";
import type { TwinState } from "./mapping";
import Shaft, { SHAFT_LENGTH } from "./Shaft";

/** WebGL scene. Loaded lazily so three.js stays out of the main bundle. */
export default function ShaftScene({ state, seed }: { state: TwinState; seed: number }) {
  return (
    <Canvas camera={{ position: [2.2, 1.4, 3.4], fov: 40 }} dpr={[1, 2]}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <Shaft state={state} seed={seed} />
      <Bearing x={-SHAFT_LENGTH / 2 + 0.3} color={state.bearingColor} />
      <Bearing x={SHAFT_LENGTH / 2 - 0.3} color={state.bearingColor} />
      <LoadArrow length={state.loadArrowLength} />
    </Canvas>
  );
}
