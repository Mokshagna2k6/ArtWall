"use client";

/** Shared room shell — floor, ceiling glow and ambient lighting for every template. */
export function Room() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[0, 4, 0]} intensity={40} decay={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#f2f0ec" />
      </mesh>
    </>
  );
}
