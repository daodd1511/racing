import RAPIER from "@dimforge/rapier3d-compat";
import {
  Matrix4 as ThreeMatrix4,
  Quaternion as ThreeQuaternion,
  Vector3 as ThreeVector3,
} from "three";

import type { Course } from "../course/types";
import type { Anchor, ColliderSpec, Spec } from "../modules/types";
import { SCALE } from "../race/scale";
import type { StartAssignment } from "../race/startAssignment";
import type { Quaternion, Vector3 } from "../race/types";
import { buildWorld } from "./buildWorld";

const CHECKPOINT_SENSOR_PREFIX = "course-checkpoint";
const MARBLE_PREFIX = "marble";
const SENSOR_HALF_HEIGHT = SCALE.marbleRadius * 5;
const SENSOR_HALF_DEPTH = SCALE.marbleRadius * 4;
const MATERIAL = Object.freeze({
  restitution: SCALE.defaultRestitution,
  friction: SCALE.defaultFriction,
});
export const COURSE_SOLVER_SUBSTEPS = 1;
const COURSE_SOLVER_ITERATIONS = 8;

function tuple(vector: ThreeVector3): Vector3 {
  return [vector.x, vector.y, vector.z];
}

function quaternionTuple(rotation: ThreeQuaternion): Quaternion {
  return [rotation.x, rotation.y, rotation.z, rotation.w];
}

function anchorFrame(anchor: Anchor): {
  readonly right: ThreeVector3;
  readonly up: ThreeVector3;
  readonly tangent: ThreeVector3;
  readonly rotation: ThreeQuaternion;
} {
  const tangent = new ThreeVector3(...anchor.tangent).normalize();
  const upHint = new ThreeVector3(...anchor.up).normalize();
  const right = upHint.clone().cross(tangent).normalize();
  const up = tangent.clone().cross(right).normalize();
  const rotation = new ThreeQuaternion().setFromRotationMatrix(
    new ThreeMatrix4().makeBasis(right, up, tangent),
  );
  return { right, up, tangent, rotation };
}

function checkpointSpec(course: Course): Spec {
  const colliders: ColliderSpec[] = course.checkpoints.map(({ anchor }, index) => {
    const frame = anchorFrame(anchor);
    const center = new ThreeVector3(...anchor.position).add(
      frame.up.clone().multiplyScalar(SENSOR_HALF_HEIGHT),
    );
    return {
      id: `${CHECKPOINT_SENSOR_PREFIX}-${index}`,
      sensor: true,
      shape: {
        kind: "cuboid",
        halfExtents: [SCALE.channelWidth / 2, SENSOR_HALF_HEIGHT, SENSOR_HALF_DEPTH],
      },
      position: tuple(center),
      rotation: quaternionTuple(frame.rotation),
      material: MATERIAL,
    };
  });
  return {
    colliders,
    visuals: [],
    footprint: {
      cells: [],
      entry: course.entry,
      exit: course.exit,
      route: course.route,
      bounds: course.board.bounds,
    },
  };
}

function courseSpecs(course: Course): readonly Spec[] {
  return [
    course.start,
    ...course.modules.map(({ spec }) => spec),
    ...course.connectors.map(({ spec }) => spec),
    course.finish,
    checkpointSpec(course),
  ];
}

function assignmentPosition(course: Course, assignment: StartAssignment): Vector3 {
  const horizontalTangent = new ThreeVector3(
    course.entry.tangent[0],
    0,
    course.entry.tangent[2],
  ).normalize();
  const up = new ThreeVector3(0, 1, 0);
  const right = up.clone().cross(horizontalTangent).normalize();
  const local = assignment.position;
  const position = new ThreeVector3(...course.entry.position)
    .add(right.multiplyScalar(local[0]))
    .add(up.multiplyScalar(local[1]))
    .add(horizontalTangent.multiplyScalar(local[2]));
  return tuple(position);
}

export interface BuiltCourseWorld {
  readonly world: RAPIER.World;
  readonly eventQueue: RAPIER.EventQueue;
  readonly kinematicBodies: ReadonlyMap<string, RAPIER.RigidBody>;
  readonly marbleBodies: ReadonlyMap<number, RAPIER.RigidBody>;
  readonly marbleIndicesByColliderHandle: ReadonlyMap<number, number>;
  readonly colliderIdsByHandle: ReadonlyMap<number, string>;
  readonly checkpointSensorIds: readonly string[];
  readonly finishSensorId: string;
}

export function buildCourseWorld(
  course: Course,
  assignments: readonly StartAssignment[],
): BuiltCourseWorld {
  if (
    assignments.length < 1 ||
    new Set(assignments.map(({ marbleIndex }) => marbleIndex)).size !== assignments.length ||
    assignments.some(({ marbleIndex }, index) => marbleIndex !== index)
  ) {
    throw new Error("Course world requires ordered unique marble assignments");
  }
  const built = buildWorld(courseSpecs(course));
  built.world.timestep = 1 / 60 / COURSE_SOLVER_SUBSTEPS;
  built.world.integrationParameters.numSolverIterations = COURSE_SOLVER_ITERATIONS;
  built.world.integrationParameters.maxCcdSubsteps = 4;
  const colliderIdsByHandle = new Map<number, string>();
  for (const [id, collider] of built.colliders) {
    colliderIdsByHandle.set(collider.handle, id);
  }
  const finishSensors = [...built.colliders.entries()]
    .filter(([, collider]) => collider.isSensor())
    .filter(([id]) => !id.startsWith(CHECKPOINT_SENSOR_PREFIX));
  if (finishSensors.length !== 1) {
    built.world.free();
    throw new Error(
      `Course world requires exactly one Finish sensor, found ${finishSensors.length}`,
    );
  }

  const marbleBodies = new Map<number, RAPIER.RigidBody>();
  const marbleIndicesByColliderHandle = new Map<number, number>();
  for (const assignment of assignments) {
    const position = assignmentPosition(course, assignment);
    const body = built.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position[0], position[1], position[2])
        .setLinearDamping(SCALE.linearDamping)
        .setAngularDamping(SCALE.angularDamping)
        .setCcdEnabled(true),
    );
    const collider = built.world.createCollider(
      RAPIER.ColliderDesc.ball(SCALE.marbleRadius)
        .setRestitution(SCALE.defaultRestitution)
        .setFriction(SCALE.defaultFriction)
        .setDensity(2.4)
        .setActiveEvents(
          RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
        )
        .setContactForceEventThreshold(0),
      body,
    );
    marbleBodies.set(assignment.marbleIndex, body);
    marbleIndicesByColliderHandle.set(collider.handle, assignment.marbleIndex);
    colliderIdsByHandle.set(collider.handle, `${MARBLE_PREFIX}-${assignment.marbleIndex}`);
  }

  return {
    world: built.world,
    eventQueue: new RAPIER.EventQueue(true),
    kinematicBodies: built.kinematicBodies,
    marbleBodies,
    marbleIndicesByColliderHandle,
    colliderIdsByHandle,
    checkpointSensorIds: Object.freeze(
      course.checkpoints.map((_, index) => `${CHECKPOINT_SENSOR_PREFIX}-${index}`),
    ),
    finishSensorId: finishSensors[0][0],
  };
}
