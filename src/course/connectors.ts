import { Vector3 as ThreeVector3 } from "three";

import {
  RAIL_HEIGHT,
  RAIL_THICKNESS,
  buildChannel,
  type ChannelSegment,
} from "../modules/geometry/channel";
import type { Anchor, Spec } from "../modules/types";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";
import type { CourseConnector } from "./types";

const GRAVITY_MAGNITUDE = Math.hypot(...SCALE.gravity);
const JOINT_OVERLAP = SCALE.marbleRadius;
const HAIRPIN_EXIT_OVERLAP = SCALE.marbleRadius * 4;
const HAIRPIN_TRANSITION_CLEARANCE = SCALE.marbleRadius * 4;
const HAIRPIN_REACH = SCALE.channelWidth / 2 + SCALE.marbleRadius * 4;
const LINK_SAMPLES = 3;
export const CONNECTOR_EDGE_CLEARANCE = HAIRPIN_REACH + SCALE.channelWidth / 2 + RAIL_THICKNESS;
const CONNECTOR_MATERIAL = Object.freeze({
  restitution: SCALE.defaultRestitution,
  friction: SCALE.defaultFriction,
});
const HAIRPIN_MATERIAL = Object.freeze({ restitution: 0, friction: 0.25 });
const OUTER_WALL_MATERIAL = Object.freeze({
  color: "#d8ff42",
  metalness: 0.05,
  roughness: 0.2,
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
    const start = new ThreeVector3(...request.start.position);
    const end = new ThreeVector3(...request.end.position);
    let controlReach = start.distanceTo(end) / 3;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const firstControl = start.clone().add(startDirection.clone().multiplyScalar(controlReach));
      const secondControl = end.clone().sub(endDirection.clone().multiplyScalar(controlReach));
      const route = Array.from({ length: LINK_SAMPLES + 1 }, (_, index): Vector3 => {
        const t = index / LINK_SAMPLES;
        const inverse = 1 - t;
        return vector(
          start
            .clone()
            .multiplyScalar(inverse ** 3)
            .add(firstControl.clone().multiplyScalar(3 * inverse * inverse * t))
            .add(secondControl.clone().multiplyScalar(3 * inverse * t * t))
            .add(end.clone().multiplyScalar(t ** 3)),
        );
      });
      if (route.every((point, index) => index === 0 || point[1] < route[index - 1][1])) {
        return route;
      }
      controlReach /= 2;
    }
    throw new Error("Course connector tangent-matched link must descend continuously");
  }

  const start = new ThreeVector3(...request.start.position);
  const end = new ThreeVector3(...request.end.position);
  const drop = start.y - end.y;
  const turnReach = Math.max(HAIRPIN_REACH, drop / 2);
  const approachDrop = Math.min(drop / 4, SCALE.channelWidth / 2);
  const firstTurn = start
    .clone()
    .add(startDirection.multiplyScalar(turnReach))
    .setY(start.y - approachDrop);
  const secondTurn = end
    .clone()
    .sub(endDirection.multiplyScalar(turnReach))
    .setY(end.y + approachDrop);
  return [vector(start), vector(firstTurn), vector(secondTurn), vector(end)];
}

function physicalSegments(
  route: readonly Vector3[],
  railHeight: number,
  isHairpin: boolean,
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
      const overlap = isHairpin && index === 2 ? HAIRPIN_EXIT_OVERLAP : JOINT_OVERLAP;
      start.sub(segmentDirection.clone().multiplyScalar(overlap));
    }
    if (index < directions.length - 1) {
      if (isHairpin && index === 1) {
        end.sub(segmentDirection.clone().multiplyScalar(HAIRPIN_TRANSITION_CLEARANCE));
      } else {
        end.add(segmentDirection.clone().multiplyScalar(JOINT_OVERLAP));
      }
    }
    return {
      start: vector(start),
      end: vector(end),
      width: SCALE.channelWidth,
      up: [0, 1, 0],
      railHeight,
    };
  });
}

export function buildCourseConnector(request: ConnectorRequest): CourseConnector {
  validateRequest(request);
  const route = routePoints(request);
  const isHairpin = direction(request.start).dot(direction(request.end)) < 0;
  const railHeight = Math.max(
    RAIL_HEIGHT,
    (request.incomingSpeed * request.incomingSpeed) / (2 * GRAVITY_MAGNITUDE) +
      SCALE.marbleRadius * 2,
  );
  const channel = buildChannel(
    physicalSegments(route, railHeight, isHairpin),
    isHairpin ? HAIRPIN_MATERIAL : CONNECTOR_MATERIAL,
    request.id,
  );
  const outerWall = (() => {
    if (!isHairpin) return null;
    const outwardSign = Math.sign(request.start.tangent[0]) || 1;
    const outerX =
      outwardSign > 0 ? Math.max(...route.map(([x]) => x)) : Math.min(...route.map(([x]) => x));
    const minimumY = Math.min(...route.map(([, y]) => y));
    const maximumY = Math.max(...route.map(([, y]) => y)) + railHeight;
    const minimumZ = Math.min(...route.map(([, , z]) => z));
    const maximumZ = Math.max(...route.map(([, , z]) => z));
    const halfExtents: Vector3 = [
      RAIL_THICKNESS / 2,
      (maximumY - minimumY) / 2,
      (maximumZ - minimumZ) / 2 + SCALE.channelWidth / 2 + RAIL_THICKNESS,
    ];
    const position: Vector3 = [
      outerX + outwardSign * (SCALE.marbleRadius * 3 + RAIL_THICKNESS / 2),
      (minimumY + maximumY) / 2,
      (minimumZ + maximumZ) / 2,
    ];
    const id = `${request.id}-outer-wall`;
    const shape = { kind: "cuboid" as const, halfExtents };
    return {
      collider: {
        id,
        shape,
        position,
        rotation: [0, 0, 0, 1] as const,
        material: HAIRPIN_MATERIAL,
      },
      visual: {
        id,
        shape,
        position,
        rotation: [0, 0, 0, 1] as const,
        material: OUTER_WALL_MATERIAL,
      },
      bounds: {
        min: [
          position[0] - halfExtents[0],
          position[1] - halfExtents[1],
          position[2] - halfExtents[2],
        ] as Vector3,
        max: [
          position[0] + halfExtents[0],
          position[1] + halfExtents[1],
          position[2] + halfExtents[2],
        ] as Vector3,
      },
    };
  })();
  const bounds = outerWall
    ? {
        min: channel.bounds.min.map((value, axis) =>
          Math.min(value, outerWall.bounds.min[axis]),
        ) as unknown as Vector3,
        max: channel.bounds.max.map((value, axis) =>
          Math.max(value, outerWall.bounds.max[axis]),
        ) as unknown as Vector3,
      }
    : channel.bounds;
  const spec: Spec = {
    colliders: outerWall ? [...channel.colliders, outerWall.collider] : channel.colliders,
    visuals: outerWall ? [...channel.visuals, outerWall.visual] : channel.visuals,
    footprint: {
      cells: [],
      entry: { ...channel.entry, position: request.start.position },
      exit: { ...channel.exit, position: request.end.position },
      route,
      bounds,
    },
  };

  return Object.freeze({
    id: request.id,
    fromSlotIndex: request.fromSlotIndex,
    toSlotIndex: request.toSlotIndex,
    spec,
  });
}
