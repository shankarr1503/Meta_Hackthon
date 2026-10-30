/** A bearing housing, tinted by the measured temperature rise. */
export default function Bearing({ x, color }: { x: number; color: string }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.24, 0.09, 16, 48]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[0.3, 0.6, 0.5]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}
