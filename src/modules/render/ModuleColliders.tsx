import { useFrame } from "@react-three/fiber";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  BallCollider,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  TrimeshCollider,
  type RapierRigidBody,
  useBeforePhysicsStep,
} from "@react-three/rapier";
import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";

import {
  kinematicSeconds,
  kinematicTransformsAt,
  transformForAnchor,
  type KinematicClock,
  type KinematicStep,
  type ModuleAnchor,
} from "../kinematics";
import type { ColliderSpec, KinematicTransform, Shape, Spec, VisualSpec } from "../types";
import { applyStep } from "../../validator/applyStep";

const ORIGIN: [number, number, number] = [0, 0, 0];
const IDENTITY_ROTATION: [number, number, number, number] = [0, 0, 0, 1];

// The single render path for every Module's Spec -- used by the Showcase
// (this phase) and, later, the Course (Spec 3). Colliders and visuals are
// rendered from the SAME `Spec` a Module's `buildSpec` produced, per
// PLAN.md -> "The Module contract"; nothing here re-derives geometry.

function ColliderPrimitive({
  collider,
  relativeToRigidBody = false,
}: {
  readonly collider: ColliderSpec;
  readonly relativeToRigidBody?: boolean;
}) {
  const { shape, material } = collider;
  const position = relativeToRigidBody ? ORIGIN : collider.position;
  const quaternion = relativeToRigidBody ? IDENTITY_ROTATION : collider.rotation;

  switch (shape.kind) {
    case "cuboid":
      return (
        <CuboidCollider
          args={shape.halfExtents as [number, number, number]}
          position={position}
          quaternion={quaternion}
          restitution={material.restitution}
          friction={material.friction}
        />
      );
    case "cylinder":
      return (
        <CylinderCollider
          args={[shape.halfHeight, shape.radius]}
          position={position}
          quaternion={quaternion}
          restitution={material.restitution}
          friction={material.friction}
        />
      );
    case "ball":
      return (
        <BallCollider
          args={[shape.radius]}
          position={position}
          quaternion={quaternion}
          restitution={material.restitution}
          friction={material.friction}
        />
      );
    case "trimesh":
      return (
        <TrimeshCollider
          args={
            [
              shape.vertices,
              shape.indices,
              RAPIER.TriMeshFlags.ORIENTED | RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
            ] as unknown as [ArrayLike<number>, ArrayLike<number>]
          }
          position={position}
          quaternion={quaternion}
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

function VisualMesh({
  visual,
  meshRef,
}: {
  readonly visual: VisualSpec;
  readonly meshRef?: RefObject<THREE.Mesh | null>;
}) {
  // Geometry is rebuilt only when this visual's shape reference changes --
  // `buildSpec` returns a fresh object per call, so identity, not deep
  // equality, is the right dependency here: a re-render with the same
  // params (same buildSpec output shape) still gets a stable geometry as
  // long as the caller memoizes the Spec itself (the Showcase does).
  const geometry = useMemo(() => geometryForShape(visual.shape), [visual.shape]);

  // The `geometry` prop bypasses R3F's automatic dispose-on-replace (that
  // only applies to geometries declared as JSX children), and every live
  // param edit produces a new Spec -- hence a new `visual.shape` identity,
  // hence a new geometry from the memo above -- so without this, every
  // slider drag leaked one GPU buffer per tick. Found by fresh review, not
  // observed: unbounded GPU growth during a tuning session isn't something
  // typecheck/lint/build catches.
  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  return (
    <mesh ref={meshRef} geometry={geometry} position={visual.position} quaternion={visual.rotation}>
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
  readonly step: KinematicStep;
  /** The Showcase advances this ref once per fixed Rapier substep. */
  readonly clockRef: MutableRefObject<KinematicClock>;
  /** Where this Module sits in a larger scene. Identity (undefined) in the
   * Showcase, where a Module is shown alone. */
  readonly anchor?: ModuleAnchor;
}

function KinematicCollider({
  collider,
  bodies,
}: {
  readonly collider: ColliderSpec;
  readonly bodies: MutableRefObject<Map<string, RapierRigidBody>>;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (body === null) {
      return;
    }
    bodies.current.set(collider.id, body);
    return () => {
      bodies.current.delete(collider.id);
    };
  }, [bodies, collider.id]);

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={collider.position}
      quaternion={collider.rotation}
    >
      <ColliderPrimitive collider={collider} relativeToRigidBody />
    </RigidBody>
  );
}

function KinematicVisualMesh({
  visual,
  meshes,
}: {
  readonly visual: VisualSpec;
  readonly meshes: MutableRefObject<Map<string, THREE.Mesh>>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) {
      return;
    }
    meshes.current.set(visual.id, mesh);
    return () => {
      meshes.current.delete(visual.id);
    };
  }, [meshes, visual.id]);

  return <VisualMesh visual={visual} meshRef={meshRef} />;
}

function applyVisualTransforms(
  transforms: readonly KinematicTransform[],
  meshes: ReadonlyMap<string, THREE.Mesh>,
): void {
  for (const transform of transforms) {
    const mesh = meshes.get(transform.id);
    if (mesh === undefined) {
      continue;
    }
    if (transform.position !== undefined) {
      mesh.position.set(...transform.position);
    }
    if (transform.rotation !== undefined) {
      mesh.quaternion.set(...transform.rotation);
    }
  }
}

export interface SpecVisualsProps {
  readonly spec: Spec;
  readonly transforms?: readonly KinematicTransform[];
}

/** Render one materialized Spec without creating any physics bodies. Course
 * scenes own visual kinematics from the same transforms the raw live world
 * receives; meshes never feed changing positions back into RigidBody props. */
export function SpecVisuals({ spec, transforms = [] }: SpecVisualsProps) {
  const kinematicVisuals = useRef(new Map<string, THREE.Mesh>());
  const kinematicIds = new Set(
    spec.colliders.filter((collider) => collider.kinematic).map((collider) => collider.id),
  );

  useEffect(() => {
    applyVisualTransforms(transforms, kinematicVisuals.current);
  }, [transforms]);

  return (
    <>
      {spec.visuals.map((visual) =>
        kinematicIds.has(visual.id) ? (
          <KinematicVisualMesh key={visual.id} visual={visual} meshes={kinematicVisuals} />
        ) : (
          <VisualMesh key={visual.id} visual={visual} />
        ),
      )}
    </>
  );
}

export function ModuleColliders({ spec, step, clockRef, anchor }: ModuleCollidersProps) {
  const kinematicBodies = useRef(new Map<string, RapierRigidBody>());
  const kinematicVisuals = useRef(new Map<string, THREE.Mesh>());
  const kinematicIds = new Set(
    spec.colliders.filter((collider) => collider.kinematic).map((collider) => collider.id),
  );

  // The physics hook fires once per actual fixed Rapier substep, before that
  // substep integrates. `setNextKinematic*` lets Rapier derive the collider's
  // velocity for contact resolution; assigning a transform after a render
  // frame would both miss substeps and let marbles pass through a blade.
  useBeforePhysicsStep(() => {
    const transforms = kinematicTransformsAt(step, spec, kinematicSeconds(clockRef.current));
    applyStep(
      transforms.map((transform) => transformForAnchor(transform, anchor)),
      kinematicBodies.current,
    );
  });

  // The same fixed-step time reaches the visual path explicitly. This is a
  // render concern, so it runs in `useFrame`; it never advances or samples a
  // wall clock, leaving the Showcase-owned clock as the sole time source.
  useFrame(() => {
    const transforms = kinematicTransformsAt(step, spec, kinematicSeconds(clockRef.current));
    applyVisualTransforms(transforms, kinematicVisuals.current);
  });

  return (
    <group position={anchor?.position} quaternion={anchor?.rotation}>
      <RigidBody type="fixed" colliders={false}>
        {spec.colliders
          .filter((collider) => !collider.kinematic)
          .map((collider) => (
            <ColliderPrimitive key={collider.id} collider={collider} />
          ))}
      </RigidBody>
      {spec.colliders
        .filter((collider) => collider.kinematic)
        .map((collider) => (
          <KinematicCollider key={collider.id} collider={collider} bodies={kinematicBodies} />
        ))}
      {spec.visuals.map((visual) =>
        kinematicIds.has(visual.id) ? (
          <KinematicVisualMesh key={visual.id} visual={visual} meshes={kinematicVisuals} />
        ) : (
          <VisualMesh key={visual.id} visual={visual} />
        ),
      )}
    </group>
  );
}
