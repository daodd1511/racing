import { useMemo } from "react";

import type { Course } from "../types";
import { SpecVisuals } from "../../modules/render/ModuleColliders";
import { stepCourse } from "../stepCourse";
import { createMarbleStyles, type MarbleStyle } from "../../render/marbleStyles";
import { SCALE } from "../../race/scale";
import type { RaceSnapshot } from "../../race/liveTypes";
import { Board } from "./Board";
import { raceVisibleSpec } from "./raceVisuals";

export interface CourseSceneProps {
  readonly course: Course;
  readonly snapshot: RaceSnapshot | null;
  readonly marbleStyles?: readonly MarbleStyle[];
}

function sceneSpecs(course: Course) {
  return [
    { id: "start", spec: course.start },
    ...course.modules.map(({ slotIndex, spec }) => ({ id: `module-${slotIndex}`, spec })),
    ...course.connectors.map(({ id, spec }) => ({ id, spec })),
    { id: "finish", spec: course.finish },
  ];
}

function Marble({
  color,
  position,
  rotation,
}: {
  readonly color: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
}) {
  return (
    <mesh castShadow position={position} quaternion={rotation}>
      <sphereGeometry args={[SCALE.marbleRadius, 20, 14]} />
      <meshStandardMaterial color={color} metalness={0.2} roughness={0.22} />
    </mesh>
  );
}

/** Visual Course counterpart to the raw live world. Specs come from the
 * materialized Course exactly once; only marble meshes consume live snapshots. */
export function CourseScene({ course, snapshot, marbleStyles }: CourseSceneProps) {
  const styles = marbleStyles ?? createMarbleStyles(snapshot?.marbleTransforms.length ?? 0);
  const transforms = stepCourse(course, snapshot?.elapsedSeconds ?? 0);
  const visibleSpecs = useMemo(
    () => sceneSpecs(course).map(({ id, spec }) => ({ id, spec: raceVisibleSpec(spec) })),
    [course],
  );

  return (
    <group name="course-scene">
      <Board board={course.board} />
      {visibleSpecs.map(({ id, spec }) => (
        <SpecVisuals key={id} spec={spec} transforms={transforms} />
      ))}
      {snapshot?.marbleTransforms.map(({ marbleIndex, position, rotation }) => (
        <Marble
          key={marbleIndex}
          color={styles[marbleIndex]?.color ?? "#ffffff"}
          position={position}
          rotation={rotation}
        />
      ))}
    </group>
  );
}
