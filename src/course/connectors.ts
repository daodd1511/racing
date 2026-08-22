import { Vector3 as ThreeVector3 } from "three";

import { RAIL_HEIGHT, buildChannel, type ChannelSegment } from "../modules/geometry/channel";
import type { Anchor, Spec } from "../modules/types";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";
import type { CourseConnector } from "./types";

const GRAVITY_MAGNITUDE = Math.hypot(...SCALE.gravity);
const JOINT_OVERLAP = SCALE.marbleRadius;
const HAIRPIN_REACH = SCALE.channelWidth / 2 + SCALE.marbleRadius * 4;
const CONNECTOR_MATERIAL = Object.freeze({
  restitution: SCALE.defaultRestitution,
  friction: SCALE.defaultFriction,
});

export interface ConnectorRequest {
  readonly id: string;
  readonly fromSlotIndex: number;
  readonly toSlotIndex: number;
  readonly start: Anchor;
  readonly end: Anchor;
  readonly incomingSpeed: number;
}

function vector(value: ThreeVector3): Vector3 {
  return [value.x, value.y, value.z];
}

function direction(anchor: Anchor): ThreeVector3 {
  return new ThreeVector3(...anchor.tangent).normalize();
}

function validateRequest(request: ConnectorRequest): void {
  if (request.id.length === 0) {
    throw new Error("Course connector id must not be empty");
  }
  if (request.toSlotIndex !== request.fromSlotIndex + 1) {
    throw new Error("Course connector Slots must be consecutive");
  }
  if (!Number.isFinite(request.incomingSpeed) || request.incomingSpeed < 0) {
    throw new Error("Course connector incoming speed must be finite and non-negative");
  }
  const coordinates = [
    ...request.start.position,
    ...request.start.tangent,
    ...request.end.position,
    ...request.end.tangent,
  ];
  if (!coordinates.every(Number.isFinite)) {
    throw new Error("Course connector Anchors must be finite");
  }
  if (request.end.position[1] >= request.start.position[1]) {
    throw new Error("Course connector must descend continuously");
  }
}

function routePoints(request: ConnectorRequest): readonly Vector3[] {
  const startDirection = direction(request.start);
  const endDirection = direction(request.end);
  if (startDirection.dot(endDirection) >= 0) {
    return [request.start.position, request.end.position];
  }

  const start = new ThreeVector3(...request.start.position);
  const end = new ThreeVector3(...request.end.position);
  const drop = start.y - end.y;
  const firstTurn = start
    .clone()
    .add(startDirection.multiplyScalar(HAIRPIN_REACH))
    .setY(start.y - drop / 3);
  const secondTurn = end
    .clone()
    .sub(endDirection.multiplyScalar(HAIRPIN_REACH))
    .setY(start.y - (drop * 2) / 3);
  return [vector(start), vector(firstTurn), vector(secondTurn), vector(end)];
}

function physicalSegments(
  route: readonly Vector3[],
  railHeight: number,
): readonly ChannelSegment[] {
  const directions = route
    .slice(0, -1)
    .map((start, index) =>
      new ThreeVector3(...route[index + 1]).sub(new ThreeVector3(...start)).normalize(),
    );

  return directions.map((segmentDirection, index) => {
    const start = new ThreeVector3(...route[index]);
    const end = new ThreeVector3(...route[index + 1]);
    if (index > 0) {
      start.sub(segmentDirection.clone().multiplyScalar(JOINT_OVERLAP));
    }
    if (index < directions.length - 1) {
      end.add(segmentDirection.clone().multiplyScalar(JOINT_OVERLAP));
    }
    return {
      start: vector(start),
      end: vector(end),
      width: SCALE.channelWidth,
      railHeight,
    };
  });
}

export function buildCourseConnector(request: ConnectorRequest): CourseConnector {
  validateRequest(request);
  const route = routePoints(request);
  const railHeight = Math.max(
    RAIL_HEIGHT,
    (request.incomingSpeed * request.incomingSpeed) / (2 * GRAVITY_MAGNITUDE) +
      SCALE.marbleRadius * 2,
  );
  const channel = buildChannel(physicalSegments(route, railHeight), CONNECTOR_MATERIAL, request.id);
  const spec: Spec = {
    colliders: channel.colliders,
    visuals: channel.visuals,
    footprint: {
      cells: [],
      entry: { ...channel.entry, position: request.start.position },
      exit: { ...channel.exit, position: request.end.position },
      route,
      bounds: channel.bounds,
    },
  };

  return Object.freeze({
    id: request.id,
    fromSlotIndex: request.fromSlotIndex,
    toSlotIndex: request.toSlotIndex,
    spec,
  });
}
