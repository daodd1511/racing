import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { enumerateRoleSelections, type RoleSelection } from "../course/arc";
import { assembleCourseFromRoleSelection } from "../course/assembleCourse";
import { stepCourse } from "../course/stepCourse";
import type { Course } from "../course/types";
import type { ColliderSpec } from "../modules/types";
import { KINEMATIC_FIXED_STEP_SECONDS } from "../modules/kinematics";
import { DEFAULT_RACE_CONFIG } from "../race/config";
import { SCALE } from "../race/scale";
import type { RaceOutcome, RaceRequest } from "../race/liveTypes";
import type { Vector3 } from "../race/types";
import {
  advanceWatchdog,
  createRaceProgress,
  recordCheckpoint,
  recordFinish,
  type RaceProgressState,
} from "../race/progress";
import { assignStartPositions } from "../race/startAssignment";
import { applyStep } from "./applyStep";
import {
  buildCourseWorld,
  COURSE_SOLVER_SUBSTEPS,
  type BuiltCourseWorld,
} from "./buildCourseWorld";
import { shuffleCoefficient } from "./metrics";

const VALIDATION_START_SEEDS = 5;
const VALIDATION_MARBLES = 15;
const EXCLUDED_PHYSICS_MODULE_IDS = new Set(["vortex-bowl"]);

export interface ValidatedRoleSelection {
  readonly selection: RoleSelection;
  readonly shapeIndex: number;
}

export function enumeratePhysicsValidatedSelections(): readonly ValidatedRoleSelection[] {
  return Object.freeze(
    enumerateRoleSelections().flatMap((selection, shapeIndex) =>
      Object.values(selection).some((moduleId) => EXCLUDED_PHYSICS_MODULE_IDS.has(moduleId))
        ? []
        : [Object.freeze({ selection, shapeIndex })],
    ),
  );
}

export interface CourseRaceValidation {
  readonly shapeIndex: number;
  readonly startSeed: number;
  readonly outcome: RaceOutcome;
  readonly finishTimes: readonly (number | null)[];
  readonly exitSpeeds: readonly (number | null)[];
  readonly shuffleCoefficient: number;
  readonly finalPositions: readonly Vector3[];
  readonly passedCheckpoints: readonly number[];
}

export interface CourseValidationReport {
  readonly shapeCount: number;
  readonly raceCount: number;
  readonly totalMarbles: number;
  readonly finishedMarbles: number;
  readonly stalledMarbles: number;
  readonly watchdogs: number;
  readonly durations: readonly number[];
  readonly dwellSeconds: readonly number[];
  readonly exitSpeeds: readonly number[];
  readonly shuffleCoefficients: readonly number[];
  readonly races: readonly CourseRaceValidation[];
}

function dotVelocity(body: RAPIER.RigidBody, tangent: readonly number[]): number {
  const velocity = body.linvel();
  return velocity.x * tangent[0] + velocity.y * tangent[1] + velocity.z * tangent[2];
}

function sweptCuboidCrossing(
  previous: Vector3,
  current: Vector3,
  sensor: ColliderSpec & {
    readonly shape: { readonly kind: "cuboid"; readonly halfExtents: Vector3 };
  },
): boolean {
  const inverse = new ThreeQuaternion(...sensor.rotation).normalize().invert();
  const center = new ThreeVector3(...sensor.position);
  const previousLocal = new ThreeVector3(...previous).sub(center).applyQuaternion(inverse);
  const currentLocal = new ThreeVector3(...current).sub(center).applyQuaternion(inverse);
  if (previousLocal.z > 0 || currentLocal.z <= 0) return false;
  const progress = -previousLocal.z / (currentLocal.z - previousLocal.z);
  const crossing = previousLocal.lerp(currentLocal, progress);
  return (
    Math.abs(crossing.x) <= sensor.shape.halfExtents[0] + SCALE.marbleRadius &&
    Math.abs(crossing.y) <= sensor.shape.halfExtents[1] + SCALE.marbleRadius
  );
}

function eventPair(
  built: BuiltCourseWorld,
  firstHandle: number,
  secondHandle: number,
): { readonly sensorId: string; readonly marbleIndex: number } | null {
  const firstMarble = built.marbleIndicesByColliderHandle.get(firstHandle);
  const secondMarble = built.marbleIndicesByColliderHandle.get(secondHandle);
  if (firstMarble !== undefined && secondMarble === undefined) {
    const sensorId = built.colliderIdsByHandle.get(secondHandle);
    return sensorId ? { sensorId, marbleIndex: firstMarble } : null;
  }
  if (secondMarble !== undefined && firstMarble === undefined) {
    const sensorId = built.colliderIdsByHandle.get(firstHandle);
    return sensorId ? { sensorId, marbleIndex: secondMarble } : null;
  }
  return null;
}

function processSensorEvents(
  built: BuiltCourseWorld,
  course: Course,
  state: RaceProgressState,
  elapsedSeconds: number,
  finishTimes: (number | null)[],
  exitSpeeds: (number | null)[],
): RaceProgressState {
  let next = state;
  built.eventQueue.drainCollisionEvents((firstHandle, secondHandle, started) => {
    if (!started) return;
    const pair = eventPair(built, firstHandle, secondHandle);
    if (!pair) return;
    const body = built.marbleBodies.get(pair.marbleIndex);
    if (!body) return;

    const checkpointIndex = built.checkpointSensorIds.indexOf(pair.sensorId);
    if (checkpointIndex >= 0) {
      const checkpoint = course.checkpoints[checkpointIndex];
      if (dotVelocity(body, checkpoint.anchor.tangent) > 0) {
        next = recordCheckpoint(next, pair.marbleIndex, checkpointIndex, elapsedSeconds);
      }
      return;
    }
    if (
      pair.sensorId === built.finishSensorId &&
      dotVelocity(body, course.finish.footprint.entry.tangent) > 0 &&
      finishTimes[pair.marbleIndex] === null
    ) {
      const velocity = body.linvel();
      finishTimes[pair.marbleIndex] = elapsedSeconds;
      exitSpeeds[pair.marbleIndex] = Math.hypot(velocity.x, velocity.y, velocity.z);
      next = recordFinish(next, pair.marbleIndex, elapsedSeconds);
    }
  });
  return next;
}

export function runCourseRaceValidation(
  selection: RoleSelection,
  shapeIndex: number,
  startSeed: number,
): CourseRaceValidation {
  const seed = shapeIndex * VALIDATION_START_SEEDS + startSeed;
  const course = assembleCourseFromRoleSelection(seed, selection);
  const assignments = assignStartPositions(seed, VALIDATION_MARBLES);
  const request: RaceRequest = {
    seed,
    roster: assignments.map(({ marbleIndex }) => `Marble ${marbleIndex + 1}`),
    selectionMode: "last",
  };
  let progress = createRaceProgress(request, course);
  const finishTimes: (number | null)[] = assignments.map(() => null);
  const exitSpeeds: (number | null)[] = assignments.map(() => null);
  const built = buildCourseWorld(course, assignments);
  const finishSensor = course.finish.colliders.find(
    (collider): collider is ColliderSpec & {
      readonly shape: { readonly kind: "cuboid"; readonly halfExtents: Vector3 };
    } => collider.sensor === true && collider.shape.kind === "cuboid",
  );
  if (!finishSensor) {
    built.eventQueue.free();
    built.world.free();
    throw new Error("Course Finish is missing its finite cuboid sensor");
  }
  const previousPositions = new Map(
    [...built.marbleBodies].map(([marbleIndex, body]) => {
      const position = body.translation();
      return [marbleIndex, [position.x, position.y, position.z] as Vector3] as const;
    }),
  );
  const maximumSteps = Math.ceil(
    DEFAULT_RACE_CONFIG.maximumSimulationSeconds / KINEMATIC_FIXED_STEP_SECONDS,
  );
  let finalPositions: readonly Vector3[] = [];

  try {
    for (let step = 1; step <= maximumSteps && !progress.outcome; step += 1) {
      for (let substep = 1; substep <= COURSE_SOLVER_SUBSTEPS; substep += 1) {
        const elapsedSeconds =
          (step - 1 + substep / COURSE_SOLVER_SUBSTEPS) * KINEMATIC_FIXED_STEP_SECONDS;
        applyStep(stepCourse(course, elapsedSeconds), built.kinematicBodies);
        built.world.step(built.eventQueue);
        progress = processSensorEvents(
          built,
          course,
          progress,
          elapsedSeconds,
          finishTimes,
          exitSpeeds,
        );
        for (const [marbleIndex, body] of built.marbleBodies) {
          const position = body.translation();
          const current: Vector3 = [position.x, position.y, position.z];
          const previous = previousPositions.get(marbleIndex)!;
          if (
            finishTimes[marbleIndex] === null &&
            sweptCuboidCrossing(previous, current, finishSensor)
          ) {
            const velocity = body.linvel();
            finishTimes[marbleIndex] = elapsedSeconds;
            exitSpeeds[marbleIndex] = Math.hypot(velocity.x, velocity.y, velocity.z);
            progress = recordFinish(progress, marbleIndex, elapsedSeconds);
          }
          previousPositions.set(marbleIndex, current);
        }
        progress = advanceWatchdog(progress, elapsedSeconds);
        if (progress.outcome) break;
      }
    }
    finalPositions = Object.freeze(
      [...built.marbleBodies.values()].map((body): Vector3 => {
        const position = body.translation();
        return [position.x, position.y, position.z];
      }),
    );
  } finally {
    built.eventQueue.free();
    built.world.free();
  }
  if (!progress.outcome) {
    throw new Error("Course validation ended without a terminal outcome");
  }
  return Object.freeze({
    shapeIndex,
    startSeed,
    outcome: progress.outcome,
    finishTimes: Object.freeze(finishTimes),
    exitSpeeds: Object.freeze(exitSpeeds),
    shuffleCoefficient: shuffleCoefficient(finishTimes),
    finalPositions,
    passedCheckpoints: progress.passedCheckpoints,
  });
}

export async function validateCourseVariants(): Promise<CourseValidationReport> {
  await RAPIER.init();
  const races: CourseRaceValidation[] = [];
  const validatedSelections = enumeratePhysicsValidatedSelections();
  for (const { selection, shapeIndex } of validatedSelections) {
    for (let startSeed = 0; startSeed < VALIDATION_START_SEEDS; startSeed += 1) {
      races.push(runCourseRaceValidation(selection, shapeIndex, startSeed));
    }
  }
  const finishTimes = races.flatMap(({ finishTimes: times }) => times);
  const exitSpeeds = races.flatMap(({ exitSpeeds: speeds }) => speeds);
  return Object.freeze({
    shapeCount: validatedSelections.length,
    raceCount: races.length,
    totalMarbles: finishTimes.length,
    finishedMarbles: finishTimes.filter((time) => time !== null).length,
    stalledMarbles: finishTimes.filter((time) => time === null).length,
    watchdogs: races.filter(({ outcome }) => outcome.kind === "watchdog").length,
    durations: Object.freeze(races.map(({ outcome }) => outcome.elapsedSeconds)),
    dwellSeconds: Object.freeze(finishTimes.filter((time): time is number => time !== null)),
    exitSpeeds: Object.freeze(exitSpeeds.filter((speed): speed is number => speed !== null)),
    shuffleCoefficients: Object.freeze(races.map((race) => race.shuffleCoefficient)),
    races: Object.freeze(races),
  });
}
