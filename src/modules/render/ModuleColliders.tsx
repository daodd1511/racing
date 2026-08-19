import {
  BallCollider,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  TrimeshCollider,
} from "@react-three/rapier";
import { useMemo } from "react";
import * as THREE from "three";

import type { ColliderSpec, Shape, Spec, VisualSpec } from "../types";

// The single render path for every Module's Spec -- used by the Showcase
// (this phase) and, later, the Course (Spec 3). Colliders and visuals are
// rendered from the SAME `Spec` a Module's `buildSpec` produced, per
// PLAN.md -> "The Module contract"; nothing here re-derives geometry.

function ColliderPrimitive({ collider }: { readonly collider: ColliderSpec }) {
  const { shape, material } = collider;

  switch (shape.kind) {
    case "cuboid":
      return (
        <CuboidCollider
          args={shape.halfExtents as [number, number, number]}
          position={collider.position}
          quaternion={collider.rotation}
          restitution={material.restitution}
          friction={material.friction}
        />
      );
    case "cylinder":
      return (
        <CylinderCollider
          args={[shape.halfHeight, shape.radius]}
          position={collider.position}
          quaternion={collider.rotation}
          restitution={material.restitution}
          friction={material.friction}
        />
      );
    case "ball":
      return (
        <BallCollider
          args={[shape.radius]}
          position={collider.position}
          quaternion={collider.rotation}
          restitution={material.restitution}
          friction={material.friction}
        />
      );
    case "trimesh":
      return (
        <TrimeshCollider
          args={[shape.vertices, shape.indices]}
          position={collider.position}
          quaternion={collider.rotation}
          restitution={material.restitution}
          friction={material.friction}
        />
      );
  }
}

function geometryForShape(shape: Shape): THREE.BufferGeometry {
  switch (shape.kind) {
    case "cuboid":
      return new THREE.BoxGeometry(
        shape.halfExtents[0] * 2,
        shape.halfExtents[1] * 2,
        shape.halfExtents[2] * 2,
      );
    case "cylinder":
      return new THREE.CylinderGeometry(shape.radius, shape.radius, shape.halfHeight * 2, 24);
    case "ball":
      return new THREE.SphereGeometry(shape.radius, 24, 16);
    case "trimesh": {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(shape.vertices, 3));
      geometry.setIndex(shape.indices as number[]);
      geometry.computeVertexNormals();
      return geometry;
    }
  }
}

function VisualMesh({ visual }: { readonly visual: VisualSpec }) {
  // Geometry is rebuilt only when this visual's shape reference changes --
  // `buildSpec` returns a fresh object per call, so identity, not deep
  // equality, is the right dependency here: a re-render with the same
  // params (same buildSpec output shape) still gets a stable geometry as
  // long as the caller memoizes the Spec itself (the Showcase does).
  const geometry = useMemo(() => geometryForShape(visual.shape), [visual.shape]);

  return (
    <mesh geometry={geometry} position={visual.position} quaternion={visual.rotation}>
      <meshStandardMaterial
        color={visual.material.color}
        metalness={visual.material.metalness}
        roughness={visual.material.roughness}
      />
    </mesh>
  );
}

export interface ModuleCollidersProps {
  readonly spec: Spec;
  /** Where this Module sits in a larger scene. Identity (undefined) in the
   * Showcase, where a Module is shown alone. */
  readonly anchor?: {
    readonly position?: readonly [number, number, number];
    readonly rotation?: readonly [number, number, number, number];
  };
}

export function ModuleColliders({ spec, anchor }: ModuleCollidersProps) {
  return (
    <group position={anchor?.position} quaternion={anchor?.rotation}>
      <RigidBody type="fixed" colliders={false}>
        {spec.colliders.map((collider) => (
          <ColliderPrimitive key={collider.id} collider={collider} />
        ))}
      </RigidBody>
      {spec.visuals.map((visual) => (
        <VisualMesh key={visual.id} visual={visual} />
      ))}
    </group>
  );
}
