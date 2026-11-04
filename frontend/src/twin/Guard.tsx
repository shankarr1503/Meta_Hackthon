/** Translucent safety guard over the coupling: a half shell you can still see
 * the spinning disc through, with end rings and a top handle. */
export default function Guard() {
  return (
    <group position={[0, 0.02, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.52, 0.52, 0.36, 32, 1, true, 0, Math.PI]} />
        <meshPhysicalMaterial
          color="#f59e0b"
          metalness={0.1}
          roughness={0.35}
          transparent
          opacity={0.26}
          side={2}
          depthWrite={false}
        />
      </mesh>
      {[-0.18, 0.18].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.52, 0.018, 10, 40, Math.PI]} />
          <meshStandardMaterial color="#b45309" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.16, 0.04, 0.08]} />
        <meshStandardMaterial color="#b45309" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}
