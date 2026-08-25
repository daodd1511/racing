import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import type { Course } from "../course/types";
import type { ColliderSpec } from "../modules/types";
import { stepCourse } from "../course/stepCourse";
import { applyStep } from "../validator/applyStep";
import { buildCourseWorld, type BuiltCourseWorld } from "../validator/buildCourseWorld";
import type { RaceContactEvent, RaceOutcome, RaceRequest, RaceSnapshot } from "./liveTypes";
import {
  advanceWatchdog,
  createRaceProgress,
  projectMarbleOntoCourse,
  recordCheckpoint,
  recordFinish,
  recordProjectedMarbleProgress,
  type MarbleRouteProjection,
  type RaceProgressState,
} from "./progress";
import { SCALE } from "./scale";
import { assignStartPositions } from "./startAssignment";
import type { Quaternion, Vector3 } from "./types";

// A safe transform keeps the marble center inside both rails. Recovery waits
// two radii beyond the rail line so ordinary wall contacts and short hops do
// not teleport a marble that remains contained by the Course.
const LAST_SAFE_CORRIDOR_RADIUS = SCALE.channelWidth / 2 - SCALE.marbleRadius;
const OFF_TRACK_RECOVERY_RADIUS = SCALE.channelWidth / 2 + SCALE.marbleRadius * 2;
const BELOW_TRACK_RECOVERY_DISTANCE = SCALE.marbleRadius * 2;
// Lift the restored transform clear of its previous contact surface before
// Rapier resumes gravity on the next fixed step.
const RESPAWN_CLEARANCE = SCALE.marbleRadius;

interface SafeMarbleTransform {
  readonly position: Vector3;
  readonly rotation: Quaternion;
  readonly projection: MarbleRouteProjection;
}

interface MarbleObservation {
  readonly position: Vector3;
  readonly projection: MarbleRouteProjection;
  readonly recovered: boolean;
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

function contactEvent(
  built: BuiltCourseWorld,
  event: RAPIER.TempContactForceEvent,
  elapsedSeconds: number,
): RaceContactEvent | null {
  const marbleIndices = [event.collider1(), event.collider2()].flatMap((handle) => {
    const marbleIndex = built.marbleIndicesByColliderHandle.get(handle);
    return marbleIndex === undefined ? [] : [marbleIndex];
  });
  const impulse = event.totalForceMagnitude();
  return marbleIndices.length > 0 && Number.isFinite(impulse) && impulse > 0
    ? Object.freeze({
        elapsedSeconds,
        marbleIndices: Object.freeze(marbleIndices),
        impulse,
      })
    : null;
}

function snapshot(built: BuiltCourseWorld, progress: RaceProgressState): RaceSnapshot {
  const marbleTransforms = [...built.marbleBodies]
    .sort(([left], [right]) => left - right)
    .map(([marbleIndex, body]) => {
      const position = body.translation();
      const rotation = body.rotation();
      return Object.freeze({
        marbleIndex,
        position: [position.x, position.y, position.z] as Vector3,
        rotation: [rotation.x, rotation.y, rotation.z, rotation.w] as const,
      });
    });
  return Object.freeze({
    elapsedSeconds: progress.elapsedSeconds,
    marbleTransforms: Object.freeze(marbleTransforms),
    ranking: progress.ranking,
    decisiveMarbleIndex: progress.decisiveMarbleIndex,
    passedCheckpoints: progress.passedCheckpoints,
    splitTimes: progress.splitTimes,
  });
}

export interface CourseRaceStep {
  readonly snapshot: RaceSnapshot;
  readonly contactEvents: readonly RaceContactEvent[];
  readonly recoveredMarbleIndices: readonly number[];
  readonly outcome: RaceOutcome | null;
}

export interface CourseRaceRuntimeOptions {
  readonly collectContactEvents?: boolean;
}

/** Shared fixed-step live runtime. `RAPIER.init()` must complete before constructing it. */
export class CourseRaceRuntime {
  readonly #course: Course;
  readonly #built: BuiltCourseWorld;
  readonly #finishSensor: ColliderSpec & {
    readonly shape: { readonly kind: "cuboid"; readonly halfExtents: Vector3 };
  };
  #progress: RaceProgressState;
  #previousPositions: Map<number, Vector3>;
  #lastSafeTransforms: Map<number, SafeMarbleTransform>;
  readonly #collectContactEvents: boolean;
  #finished = new Set<number>();
  #disposed = false;

  constructor(course: Course, request: RaceRequest, options: CourseRaceRuntimeOptions = {}) {
    const assignments = assignStartPositions(request.seed, request.roster.length);
    this.#collectContactEvents = options.collectContactEvents ?? true;
    this.#course = course;
    this.#progress = createRaceProgress(request, course);
    this.#built = buildCourseWorld(course, assignments, this.#collectContactEvents);
    const finishSensor = course.finish.colliders.find(
      (
        collider,
      ): collider is ColliderSpec & {
        readonly shape: { readonly kind: "cuboid"; readonly halfExtents: Vector3 };
      } => collider.sensor === true && collider.shape.kind === "cuboid",
    );
    if (!finishSensor) {
      this.dispose();
      throw new Error("Course Finish is missing its finite cuboid sensor");
    }
    this.#finishSensor = finishSensor;
    this.#previousPositions = new Map(
      [...this.#built.marbleBodies].map(([marbleIndex, body]) => {
        const position = body.translation();
        return [marbleIndex, [position.x, position.y, position.z] as Vector3] as const;
      }),
    );
    this.#lastSafeTransforms = new Map(
      [...this.#built.marbleBodies].map(([marbleIndex, body]) => {
        const position = body.translation();
        const rotation = body.rotation();
        const positionTuple: Vector3 = [position.x, position.y, position.z];
        return [
          marbleIndex,
          Object.freeze({
            position: positionTuple,
            rotation: [rotation.x, rotation.y, rotation.z, rotation.w] as const,
            projection: projectMarbleOntoCourse(this.#progress, marbleIndex, positionTuple),
          }),
        ] as const;
      }),
    );
  }

  get currentSnapshot(): RaceSnapshot {
    return snapshot(this.#built, this.#progress);
  }

  get outcome(): RaceOutcome | null {
    return this.#progress.outcome;
  }

  step(elapsedSeconds: number): CourseRaceStep {
    if (this.#disposed) throw new Error("Course race runtime is disposed");
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < this.#progress.elapsedSeconds) {
      throw new RangeError("Course race step time must be finite and monotonic");
    }
    if (this.#progress.outcome) {
      return Object.freeze({
        snapshot: this.currentSnapshot,
        contactEvents: Object.freeze([]),
        recoveredMarbleIndices: Object.freeze([]),
        outcome: this.#progress.outcome,
      });
    }

    applyStep(stepCourse(this.#course, elapsedSeconds), this.#built.kinematicBodies);
    this.#built.world.step(this.#built.eventQueue);
    const observations = this.#recoverOffTrackMarbles();
    const recoveredMarbleIndices = new Set<number>();
    for (const [marbleIndex, observation] of observations) {
      if (observation.recovered) recoveredMarbleIndices.add(marbleIndex);
    }
    this.#processSensorEvents(elapsedSeconds, recoveredMarbleIndices);
    const contactEvents = this.#collectContactEvents
      ? this.#drainContactEvents(elapsedSeconds, recoveredMarbleIndices)
      : Object.freeze([]);
    for (const [marbleIndex] of this.#built.marbleBodies) {
      const observation = observations.get(marbleIndex)!;
      const current = observation.position;
      const previous = observation.recovered ? current : this.#previousPositions.get(marbleIndex)!;
      this.#progress = recordProjectedMarbleProgress(
        this.#progress,
        marbleIndex,
        observation.projection,
        elapsedSeconds,
      );
      if (
        !observation.recovered &&
        this.#progress.outcome === null &&
        !this.#finished.has(marbleIndex) &&
        sweptCuboidCrossing(previous, current, this.#finishSensor)
      ) {
        this.#recordFinish(marbleIndex, elapsedSeconds);
      }
      this.#previousPositions.set(marbleIndex, current);
    }
    this.#progress = advanceWatchdog(this.#progress, elapsedSeconds);
    return Object.freeze({
      snapshot: this.currentSnapshot,
      contactEvents,
      recoveredMarbleIndices: Object.freeze([...recoveredMarbleIndices]),
      outcome: this.#progress.outcome,
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#built.eventQueue.free();
    this.#built.world.free();
  }

  #recoverOffTrackMarbles(): ReadonlyMap<number, MarbleObservation> {
    const observations = new Map<number, MarbleObservation>();
    const recoveryDistanceSquared = OFF_TRACK_RECOVERY_RADIUS ** 2;
    const safeDistanceSquared = LAST_SAFE_CORRIDOR_RADIUS ** 2;

    for (const [marbleIndex, body] of this.#built.marbleBodies) {
      const translation = body.translation();
      let position: Vector3 = [translation.x, translation.y, translation.z];
      let projection = projectMarbleOntoCourse(this.#progress, marbleIndex, position);
      const heightAboveRoute = position[1] - projection.point[1];
      const recovered =
        projection.distanceSquared > recoveryDistanceSquared ||
        heightAboveRoute < -BELOW_TRACK_RECOVERY_DISTANCE;

      if (recovered) {
        const safe = this.#lastSafeTransforms.get(marbleIndex)!;
        position = [safe.position[0], safe.position[1] + RESPAWN_CLEARANCE, safe.position[2]];
        projection = safe.projection;
        body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
        body.setRotation(
          {
            x: safe.rotation[0],
            y: safe.rotation[1],
            z: safe.rotation[2],
            w: safe.rotation[3],
          },
          true,
        );
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      } else if (
        projection.distanceSquared <= safeDistanceSquared &&
        heightAboveRoute >= SCALE.marbleRadius / 2
      ) {
        const rotation = body.rotation();
        this.#lastSafeTransforms.set(
          marbleIndex,
          Object.freeze({
            position,
            rotation: [rotation.x, rotation.y, rotation.z, rotation.w] as const,
            projection,
          }),
        );
      }

      observations.set(marbleIndex, Object.freeze({ position, projection, recovered }));
    }

    return observations;
  }

  #processSensorEvents(elapsedSeconds: number, recoveredMarbleIndices: ReadonlySet<number>): void {
    this.#built.eventQueue.drainCollisionEvents((firstHandle, secondHandle, started) => {
      if (!started || this.#progress.outcome) return;
      const pair = eventPair(this.#built, firstHandle, secondHandle);
      if (!pair) return;
      if (recoveredMarbleIndices.has(pair.marbleIndex)) return;
      const body = this.#built.marbleBodies.get(pair.marbleIndex);
      if (!body) return;

      const checkpointIndex = this.#built.checkpointSensorIds.indexOf(pair.sensorId);
      if (checkpointIndex >= 0) {
        const checkpoint = this.#course.checkpoints[checkpointIndex];
        if (dotVelocity(body, checkpoint.anchor.tangent) > 0) {
          this.#progress = recordCheckpoint(
            this.#progress,
            pair.marbleIndex,
            checkpointIndex,
            elapsedSeconds,
          );
        }
        return;
      }
      if (
        pair.sensorId === this.#built.finishSensorId &&
        dotVelocity(body, this.#course.finish.footprint.entry.tangent) > 0
      ) {
        this.#recordFinish(pair.marbleIndex, elapsedSeconds);
      }
    });
  }

  #drainContactEvents(
    elapsedSeconds: number,
    recoveredMarbleIndices: ReadonlySet<number>,
  ): readonly RaceContactEvent[] {
    const events: RaceContactEvent[] = [];
    this.#built.eventQueue.drainContactForceEvents((event) => {
      const contact = contactEvent(this.#built, event, elapsedSeconds);
      if (
        contact &&
        contact.marbleIndices.every((marbleIndex) => !recoveredMarbleIndices.has(marbleIndex))
      ) {
        events.push(contact);
      }
    });
    return Object.freeze(events);
  }

  #recordFinish(marbleIndex: number, elapsedSeconds: number): void {
    if (this.#finished.has(marbleIndex) || this.#progress.outcome) return;
    this.#finished.add(marbleIndex);
    this.#progress = recordFinish(this.#progress, marbleIndex, elapsedSeconds);
  }
}
