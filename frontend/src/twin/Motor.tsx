/** Drive motor at the left end: finned stator body, terminal box, feet and a
 * stub shaft into the left bearing. Form follows a real TEFC motor. */
export default function Motor() {
  const fins = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (i / 8) * 2 * Math.PI;
    return { y: 0.36 * Math.cos(a), z: 0.36 * Math.sin(a), rot: -a };
  });
  return (
    <group position={[-2.2, 0, 0]}>
      {/* Stub shaft into the bearing. */}
      <mesh position={[0.62, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.55, 24]} />
        <meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.25} />
      </mesh>
      {/* Stator body. */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.95, 32]} />
        <meshPhysicalMaterial color="#3f5a78" metalness={0.7} roughness={0.42} clearcoat={0.3} />
      </mesh>
      {/* Cooling fins around the body. */}
      {fins.map((f, i) => (
        <mesh key={i} position={[0, f.y, f.z]} rotation={[f.rot, 0, 0]} castShadow>
          <boxGeometry args={[0.9, 0.05, 0.12]} />
          <meshStandardMaterial color="#35506e" metalness={0.7} roughness={0.5} />
        </mesh>
      ))}
      {/* End bell and terminal box. */}
      <mesh position={[-0.55, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.26, 0.3, 0.22, 32]} />
        <meshStandardMaterial color="#2c4258" metalness={0.7} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.44, 0]} castShadow>
        <boxGeometry args={[0.34, 0.16, 0.26]} />
        <meshStandardMaterial color="#24384e" metalness={0.6} roughness={0.55} />
      </mesh>
      {/* Feet on the bed. */}
      <mesh position={[0, -0.78, 0]} castShadow>
        <boxGeometry args={[0.8, 0.16, 0.62]} />
        <meshStandardMaterial color="#24384e" metalness={0.4} roughness={0.65} />
      </mesh>
    </group>
  );
}
