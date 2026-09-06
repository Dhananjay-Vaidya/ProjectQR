"use client";

/**
 * The three lights every diorama scene mounts. Theme colour comes from
 * materials only — no coloured or point lights.
 */
export function DioramaLights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={[0xffffff, 0xd9cfc0, 1.1]} />
      <directionalLight position={[5, 10, 4]} intensity={2.2} />
      <directionalLight position={[-6, 4, -3]} intensity={0.6} />
    </>
  );
}
