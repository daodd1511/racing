import { Vector3 as ThreeVector3 } from "three";

import { START_GRID_CAPACITY, startGridPositions } from "../course/startFinish";
import type { Course } from "../course/types";
import type { MarbleTransform } from "./liveTypes";
import { createSeededRandom, deriveRaceSeed, shuffleStartSlots } from "./random";
import type { Vector3 } from "./types";

export interface StartAssignment {
  readonly marbleIndex: number;
  readonly position: Vector3;
}

export function assignStartPositions(seed: number, rosterSize: number): readonly StartAssignment[] {
  const positions = startGridPositions(rosterSize);
  const random = createSeededRandom(deriveRaceSeed(seed, "start"));
  const occupiedSlots = shuffleStartSlots(rosterSize, random);
  return Object.freeze(
    occupiedSlots.map((slotIndex, marbleIndex) =>
      Object.freeze({
        marbleIndex,
        position: positions[slotIndex],
      }),
    ),
  );
}

export function startPositionInCourse(
  course: Pick<Course, "entry">,
  assignment: StartAssignment,
): Vector3 {
  const forward = new ThreeVector3(course.entry.tangent[0], 0, course.entry.tangent[2]).normalize();
  const up = new ThreeVector3(0, 1, 0);
  const right = up.clone().cross(forward).normalize();
  const local = assignment.position;
  const position = new ThreeVector3(...course.entry.position)
    .add(right.multiplyScalar(local[0]))
    .add(up.multiplyScalar(local[1]))
    .add(forward.multiplyScalar(local[2]));
  return [position.x, position.y, position.z];
}

export function startingGridTransforms(
  course: Pick<Course, "entry">,
  seed: number,
  rosterSize: number,
): readonly MarbleTransform[] {
  return Object.freeze(
    assignStartPositions(seed, rosterSize).map((assignment) =>
      Object.freeze({
        marbleIndex: assignment.marbleIndex,
        position: startPositionInCourse(course, assignment),
        rotation: [0, 0, 0, 1] as const,
      }),
    ),
  );
}

export interface StartingGridCameraTarget {
  readonly position: Vector3;
  readonly forward: Vector3;
}

export function startingGridCameraTarget(
  course: Pick<Course, "entry">,
  rosterSize = START_GRID_CAPACITY,
): StartingGridCameraTarget {
  const positions = startGridPositions(rosterSize);
  const position = positions.reduce(
    (total, localPosition) =>
      total.add(
        new ThreeVector3(
          ...startPositionInCourse(course, { marbleIndex: 0, position: localPosition }),
        ),
      ),
    new ThreeVector3(),
  );
  position.divideScalar(positions.length);
  const forward = new ThreeVector3(...course.entry.tangent).normalize();
  return Object.freeze({
    position: [position.x, position.y, position.z] as const,
    forward: [forward.x, forward.y, forward.z] as const,
  });
}
