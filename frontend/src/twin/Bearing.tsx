import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

import { orbitPoint, type TwinState } from "./mapping";

/** A bearing housing, tinted by the measured temperature rise. It picks up a
 * fraction of the shaft whirl, as a real housing does. */
export default function Bearing({
  x,
  color,
  state,
}: {
  x: number;
  color: string;
  state: TwinState;
}) {
  const group = useRef<Group>(null);

  useFrame(({ clock }) => {
    const angle = 2 * Math.PI * state.spinRevPerSec * clock.elapsedTime;
    const [y, z] = orbitPoint(angle, state.orbit1x * 0.18, state.orbit2x * 0.18);
    group.current?.position.set(x, y, z);
  });

  return (
    <group ref={group} position={[x, 0, 0]}>
      <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[0.24, 0.09, 16, 48]} />
        <meshStandardMaterial color={color} metalness={0.85} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.55, 0]} castShadow>
        <boxGeometry args={[0.3, 0.6, 0.5]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.6} />
      </mesh>
    </group>
  );
}
