import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Course } from "../types";
import { SpecVisuals } from "../../modules/render/ModuleColliders";
import { StaticSpecVisuals } from "../../modules/render/StaticSpecVisuals";
import { stepCourse } from "../stepCourse";
import { createMarbleStyles, type MarbleStyle } from "../../render/marbleStyles";
import { marbleStripeTexture } from "../../render/marbleSkin";
import { SCALE } from "../../race/scale";
import type { MarbleTransform, RaceSnapshot } from "../../race/liveTypes";
import { Board } from "./Board";
import { raceVisibleSpec } from "./raceVisuals";

const FALLBACK_MARBLE_STYLE: MarbleStyle = Object.freeze({
  color: "#ffffff",
  accentColor: "#12171c",
  pattern: "stripe",
});
const MARBLE_RENDER_DAMPING = 30;

function frameDamping(rate: number, deltaSeconds: number): number {
  return 1 - Math.exp(-rate * deltaSeconds);
}

export interface CourseSceneProps {
  readonly course: Course;
  readonly snapshot: RaceSnapshot | null;
  readonly marbleStyles?: readonly MarbleStyle[];
  readonly marbleNames?: readonly string[];
  readonly stagedMarbleTransforms?: readonly MarbleTransform[];
}

function sceneSpecs(course: Course) {
  return [
    { id: "start", spec: course.start },
    ...course.modules.map(({ slotIndex, spec }) => ({ id: `module-${slotIndex}`, spec })),
    ...course.connectors.map(({ id, spec }) => ({ id, spec })),
    { id: "finish", spec: course.finish },
  ];
}

function hasKinematicVisuals({ spec }: ReturnType<typeof sceneSpecs>[number]): boolean {
  return spec.colliders.some(({ kinematic }) => kinematic === true);
}

const StaticCourse = memo(function StaticCourse({ course }: { readonly course: Course }) {
  const visibleSpecs = useMemo(
    () =>
      sceneSpecs(course)
        .filter((entry) => !hasKinematicVisuals(entry))
        .map(({ id, spec }) => ({ id, spec: raceVisibleSpec(spec) })),
    [course],
  );

  return (
    <>
      <Board board={course.board} />
      <StaticSpecVisuals specs={visibleSpecs.map(({ spec }) => spec)} />
    </>
  );
});

function Marble({
  style,
  name,
  position,
  rotation,
}: {
  readonly style: MarbleStyle;
  readonly name?: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<THREE.Group>(null);
  const targetPositionRef = useRef(new THREE.Vector3(...position));
  const targetRotationRef = useRef(new THREE.Quaternion(...rotation));
  const initialPositionRef = useRef(position);
  const initialRotationRef = useRef(rotation);

  useEffect(() => {
    targetPositionRef.current.set(...position);
    targetRotationRef.current.set(...rotation).normalize();
  }, [position, rotation]);

  useFrame((_, deltaSeconds) => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const damping = frameDamping(MARBLE_RENDER_DAMPING, deltaSeconds);
    mesh.position.lerp(targetPositionRef.current, damping);
    mesh.quaternion.slerp(targetRotationRef.current, damping);
    labelRef.current?.position.copy(mesh.position);
  });

  return (
    <>
      <mesh
        ref={meshRef}
        castShadow
        position={initialPositionRef.current}
        quaternion={initialRotationRef.current}
      >
        <sphereGeometry args={[SCALE.marbleRadius, 20, 14]} />
        <meshStandardMaterial
          color="#ffffff"
          map={marbleStripeTexture(style)}
          metalness={0.2}
          roughness={0.22}
        />
      </mesh>
      {name === undefined ? null : (
        <group ref={labelRef} position={initialPositionRef.current}>
          <Html aria-hidden="true" center pointerEvents="none" zIndexRange={[1, 0]}>
            <span className="marble-name-label">
              <span
                className="marble-name-label__swatch"
                style={{ backgroundColor: style.color }}
              />
              <span className="marble-name-label__text">{name}</span>
            </span>
          </Html>
        </group>
      )}
    </>
  );
}

/** Visual Course counterpart to the raw live world. Specs come from the
 * materialized Course exactly once; only moving visuals and marble meshes
 * consume live snapshots. */
export function CourseScene({
  course,
  snapshot,
  marbleStyles,
  marbleNames,
  stagedMarbleTransforms = [],
}: CourseSceneProps) {
  const marbleTransforms = snapshot?.marbleTransforms ?? stagedMarbleTransforms;
  const styles = marbleStyles ?? createMarbleStyles(marbleTransforms.length);
  const transforms = stepCourse(course, snapshot?.elapsedSeconds ?? 0);
  const movingSpecs = useMemo(
    () =>
      sceneSpecs(course)
        .filter(hasKinematicVisuals)
        .map(({ id, spec }) => ({ id, spec: raceVisibleSpec(spec) })),
    [course],
  );

  return (
    <group name="course-scene">
      <StaticCourse course={course} />
      {movingSpecs.map(({ id, spec }) => (
        <SpecVisuals key={id} spec={spec} transforms={transforms} />
      ))}
      {marbleTransforms.map(({ marbleIndex, position, rotation }) => (
        <Marble
          key={marbleIndex}
          name={marbleNames?.[marbleIndex]}
          style={styles[marbleIndex] ?? FALLBACK_MARBLE_STYLE}
          position={position}
          rotation={rotation}
        />
      ))}
    </group>
  );
}
