import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { buildChannel } from "../modules/geometry/channel";
import type {
  ColliderSpec,
  Footprint,
  KinematicTransform,
  Spec,
  VisualSpec,
} from "../modules/types";
import { SCALE } from "../race/scale";
import type { Quaternion, Vector3 } from "../race/types";

const START_LENGTH = 0.6;
const START_DROP = 0.06;
const GATE_Z = 0.48;
const GATE_HEIGHT = SCALE.marbleRadius * 5;
const GATE_THICKNESS = SCALE.marbleRadius / 2;
const GATE_OPEN_SECONDS = 0.2;
const START_GATE_ID = "start-gate";
const FINISH_LENGTH = 0.6;
const FINISH_DROP = 0.06;
const SENSOR_Z = 0.2;
const SENSOR_HEIGHT = SCALE.marbleRadius * 5;
const WALL_THICKNESS = SCALE.marbleRadius / 2;
const MATERIAL = Object.freeze({
  restitution: SCALE.defaultRestitution,
  friction: SCALE.defaultFriction,
});
const WALL_VISUAL = Object.freeze({ color: "#d8ff42", metalness: 0.05, roughness: 0.2 });

function vector(value: ThreeVector3): Vector3 {
  return [value.x, value.y, value.z];
}

function quaternion(value: ThreeQuaternion): Quaternion {
  return [value.x, value.y, value.z, value.w];
}

function floorY(z: number, length: number, drop: number): number {
  return -(z / length) * drop;
}

const lateralSpacing = (SCALE.channelWidth - SCALE.marbleRadius * 4) / 5;
const rowSpacing = SCALE.marbleRadius * 3;
export const START_POSITIONS: readonly Vector3[] = Object.freeze(
  Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 5 }, (_, column): Vector3 => {
      const z = GATE_Z - SCALE.marbleRadius * 3 - row * rowSpacing;
      const x = (column - 2) * lateralSpacing;
      return Object.freeze([x, floorY(z, START_LENGTH, START_DROP) + SCALE.marbleRadius, z]);
    }),
  ).flat(),
);

function expandedBounds(
  bounds: Footprint["bounds"],
  colliders: readonly ColliderSpec[],
): Footprint["bounds"] {
  const min: [number, number, number] = [...bounds.min];
  const max: [number, number, number] = [...bounds.max];
  for (const collider of colliders) {
    if (collider.shape.kind !== "cuboid") {
      continue;
    }
    const half = collider.shape.halfExtents;
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], collider.position[axis] - half[axis]);
      max[axis] = Math.max(max[axis], collider.position[axis] + half[axis]);
    }
  }
  return { min, max };
}

function infrastructurePart(
  id: string,
  position: Vector3,
  halfExtents: Vector3,
): { readonly collider: ColliderSpec; readonly visual: VisualSpec } {
  const shape = { kind: "cuboid" as const, halfExtents };
  const rotation: Quaternion = [0, 0, 0, 1];
  return {
    collider: { id, shape, position, rotation, material: MATERIAL },
    visual: { id, shape, position, rotation, material: WALL_VISUAL },
  };
}

export function buildStartSpec(): Spec {
  const channel = buildChannel(
    [{ start: [0, 0, 0], end: [0, -START_DROP, START_LENGTH], width: SCALE.channelWidth }],
    MATERIAL,
    "start",
  );
  const back = infrastructurePart(
    "start-back-wall",
    [0, GATE_HEIGHT / 2, 0],
    [SCALE.channelWidth / 2, GATE_HEIGHT / 2, WALL_THICKNESS / 2],
  );
  const gateY = floorY(GATE_Z, START_LENGTH, START_DROP);
  const gatePivot: Vector3 = [0, gateY, GATE_Z];
  const gate = infrastructurePart(
    START_GATE_ID,
    [0, gateY + GATE_HEIGHT / 2, GATE_Z],
    [SCALE.channelWidth / 2, GATE_HEIGHT / 2, GATE_THICKNESS / 2],
  );
  const gateCollider: ColliderSpec = {
    ...gate.collider,
    kinematic: true,
    motion: {
      kind: "rotation",
      axis: [1, 0, 0],
      pivot: gatePivot,
      angularVelocity: -Math.PI / 2 / GATE_OPEN_SECONDS,
    },
  };
  const colliders = [...channel.colliders, back.collider, gateCollider];

  return {
    colliders,
    visuals: [...channel.visuals, back.visual, gate.visual],
    footprint: {
      cells: [],
      entry: channel.entry,
      exit: channel.exit,
      route: channel.route,
      bounds: expandedBounds(channel.bounds, colliders),
    },
  };
}

export function buildFinishSpec(): Spec {
  const channel = buildChannel(
    [{ start: [0, 0, 0], end: [0, -FINISH_DROP, FINISH_LENGTH], width: SCALE.channelWidth }],
    MATERIAL,
    "finish",
  );
  const sensorY = floorY(SENSOR_Z, FINISH_LENGTH, FINISH_DROP);
  const sensor: ColliderSpec = {
    id: "photo-finish-sensor",
    sensor: true,
    shape: {
      kind: "cuboid",
      halfExtents: [SCALE.channelWidth / 2, SENSOR_HEIGHT / 2, WALL_THICKNESS / 2],
    },
    position: [0, sensorY + SENSOR_HEIGHT / 2, SENSOR_Z],
    rotation: [0, 0, 0, 1],
    material: MATERIAL,
  };
  const catchWall = infrastructurePart(
    "finish-catch-wall",
    [0, -FINISH_DROP + GATE_HEIGHT / 2, FINISH_LENGTH],
    [SCALE.channelWidth / 2, GATE_HEIGHT / 2, WALL_THICKNESS / 2],
  );
  const colliders = [...channel.colliders, sensor, catchWall.collider];

  return {
    colliders,
    visuals: [...channel.visuals, catchWall.visual],
    footprint: {
      cells: [],
      entry: channel.entry,
      exit: channel.exit,
      route: channel.route,
      bounds: expandedBounds(channel.bounds, colliders),
    },
  };
}

export function stepStartGate(spec: Spec, tSeconds: number): readonly KinematicTransform[] {
  const gate = spec.colliders.find(
    (collider) =>
      collider.kinematic &&
      collider.motion?.kind === "rotation" &&
      (collider.id === START_GATE_ID || collider.id.endsWith(`:${START_GATE_ID}`)),
  );
  if (!gate?.motion) {
    throw new Error("Start Spec is missing its kinematic gate");
  }

  const elapsed = Math.min(GATE_OPEN_SECONDS, Math.max(0, tSeconds));
  const delta = new ThreeQuaternion().setFromAxisAngle(
    new ThreeVector3(...gate.motion.axis),
    gate.motion.angularVelocity * elapsed,
  );
  const pivot = new ThreeVector3(...gate.motion.pivot);
  const position = new ThreeVector3(...gate.position).sub(pivot).applyQuaternion(delta).add(pivot);
  const rotation = delta.multiply(new ThreeQuaternion(...gate.rotation)).normalize();
  return [{ id: gate.id, position: vector(position), rotation: quaternion(rotation) }];
}
