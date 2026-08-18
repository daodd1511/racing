import { Physics, RigidBody } from "@react-three/rapier";
import { Canvas } from "@react-three/fiber";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Phase 1 smoke scene: proves the R3F render loop and the Rapier physics
// step are both alive before anything else in the spec is built on top of
// them. One marble dropped onto one static floor. Replaced by the Showcase
// in Phase 3 -- see specs/marble-race-rebuild/EXECUTION.md.
function SmokeScene() {
  return (
    <Canvas camera={{ position: [0, 0.3, 0.6], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[1, 2, 1]} intensity={1.2} />
      <Physics gravity={[0, -9.81, 0]}>
        <RigidBody type="fixed" colliders="cuboid">
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1, 1]} />
            <meshStandardMaterial color="#2b2f33" />
          </mesh>
        </RigidBody>
        <RigidBody position={[0, 0.5, 0]} colliders="ball" restitution={0.3}>
          <mesh>
            <sphereGeometry args={[0.016, 32, 32]} />
            <meshStandardMaterial color="#d8ff42" metalness={0.4} roughness={0.2} />
          </mesh>
        </RigidBody>
      </Physics>
    </Canvas>
  );
}

const root = document.querySelector<HTMLDivElement>("#app");

if (root === null) {
  throw new Error("Application root is missing");
}

createRoot(root).render(
  <StrictMode>
    <SmokeScene />
  </StrictMode>,
);
