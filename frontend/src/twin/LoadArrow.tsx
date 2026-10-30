/** Downward arrow above the rotor; its length follows the applied load. */
export default function LoadArrow({ length }: { length: number }) {
  if (length <= 0) return null;
  const head = 0.18;
  return (
    <group position={[0, 0.55, 0]}>
      <mesh position={[0, head + length / 2, 0]}>
        <cylinderGeometry args={[0.035, 0.035, length, 12]} />
        <meshStandardMaterial color="#0ea5e9" />
      </mesh>
      <mesh position={[0, head / 2, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.1, head, 16]} />
        <meshStandardMaterial color="#0ea5e9" />
      </mesh>
    </group>
  );
}
