import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

import { orbitPoint, seededNoise, type TwinState } from "./mapping";

export const SHAFT_LENGTH = 3.2;

/** The rotor: spins about its axis and whirls on the orbit the measurements imply. */
export default function Shaft({ state, seed }: { state: TwinState; seed: number }) {
  const whirl = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const angle = useRef(0);
  const frame = useRef(0);

  useFrame((_, delta) => {
    angle.current += 2 * Math.PI * state.spinRevPerSec * Math.min(delta, 0.1);
    frame.current += 1;
    const [y, z] = orbitPoint(angle.current, state.orbit1x, state.orbit2x);
    const jy = state.jitter * seededNoise(seed, frame.current);
    const jz = state.jitter * seededNoise(seed + 1, frame.current);
    whirl.current?.position.set(0, y + jy, z + jz);
    if (spin.current) spin.current.rotation.x = angle.current;
  });

  return (
    <group ref={whirl}>
      <group ref={spin}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, SHAFT_LENGTH, 32]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.38, 0.38, 0.18, 48]} />
          <meshStandardMaterial color="#475569" metalness={0.4} roughness={0.5} />
        </mesh>
        {/* Marker so the spin is visible. */}
        <mesh position={[0, 0.38, 0]}>
          <boxGeometry args={[0.2, 0.06, 0.06]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      </group>
    </group>
  );
}
