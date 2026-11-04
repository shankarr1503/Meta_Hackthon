import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { PMREMGenerator } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import Bearing from "./Bearing";
import Guard from "./Guard";
import LoadArrow from "./LoadArrow";
import Motor from "./Motor";
import type { TwinState } from "./mapping";
import { clampOrbit, orbitCameraPosition, zoomByPinch, type OrbitState } from "./orbit";
import Shaft, { SHAFT_LENGTH } from "./Shaft";

/** Image-based light so the PBR metals read as metal, not grey plastic. */
function Environment() {
  const gl = useThree((s) => s.gl);
  const texture = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    return env.texture;
  }, [gl]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <primitive attach="environment" object={texture} />;
}

/** Drag to orbit, wheel/pinch to zoom, with damped motion. */
function CameraRig() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  // Near the previous fixed camera, pulled back to frame the motor as well.
  const target = useRef<OrbitState>({ theta: 0.57, phi: 1.24, radius: 4.9 });
  const current = useRef<OrbitState>({ theta: 0.57, phi: 1.24, radius: 4.9 });

  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        target.current = clampOrbit({
          ...target.current,
          radius: zoomByPinch(target.current.radius, pinchDist, dist),
        });
        pinchDist = dist;
        return;
      }
      target.current = clampOrbit({
        theta: target.current.theta - dx * 0.005,
        phi: target.current.phi - dy * 0.005,
        radius: target.current.radius,
      });
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      target.current = clampOrbit({
        ...target.current,
        radius: target.current.radius + e.deltaY * 0.005,
      });
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl]);

  useFrame(() => {
    const c = current.current;
    const t = target.current;
    c.theta += (t.theta - c.theta) * 0.12;
    c.phi += (t.phi - c.phi) * 0.12;
    c.radius += (t.radius - c.radius) * 0.12;
    const [x, y, z] = orbitCameraPosition(c.theta, c.phi, c.radius);
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/** Machine bed the pedestals and motor stand on; receives the contact shadows. */
function Bed() {
  return (
    <mesh position={[-0.4, -0.92, 0]} receiveShadow>
      <boxGeometry args={[5.8, 0.14, 1.7]} />
      <meshStandardMaterial color="#1e293b" metalness={0.25} roughness={0.85} />
    </mesh>
  );
}

/** WebGL scene. Loaded lazily so three.js stays out of the main bundle. */
export default function ShaftScene({ state, seed }: { state: TwinState; seed: number }) {
  return (
    <Canvas
      shadows
      camera={{ position: [2.2, 1.4, 3.4], fov: 40 }}
      dpr={[1, 2]}
      style={{ touchAction: "none" }}
    >
      <hemisphereLight args={["#e2e8f0", "#334155", 0.5]} />
      <directionalLight
        position={[3, 5, 4]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#93c5fd" />
      <Environment />
      <CameraRig />
      <Motor />
      <Shaft state={state} seed={seed} />
      <Guard />
      <Bearing x={-SHAFT_LENGTH / 2 + 0.3} color={state.bearingColor} state={state} />
      <Bearing x={SHAFT_LENGTH / 2 - 0.3} color={state.bearingColor} state={state} />
      <LoadArrow length={state.loadArrowLength} />
      <Bed />
    </Canvas>
  );
}
