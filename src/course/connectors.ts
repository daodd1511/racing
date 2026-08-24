import { Vector3 as ThreeVector3 } from "three";

import {
  FLOOR_THICKNESS,
  RAIL_HEIGHT,
  RAIL_THICKNESS,
  buildChannel,
  type ChannelSegment,
} from "../modules/geometry/channel";
import type { Anchor, ColliderSpec, Spec } from "../modules/types";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";
import type { CourseConnector } from "./types";

const GRAVITY_MAGNITUDE = Math.hypot(...SCALE.gravity);
const JOINT_OVERLAP = SCALE.marbleRadius;
const MINIMUM_HAIRPIN_REACH = SCALE.channelWidth / 2 + SCALE.marbleRadius * 4;
// A row turn should read as part of the raceway, not a drop chute. The
// centreline gains at least ten metres of horizontal travel per metre of
// vertical drop, which caps the average turn grade at roughly 10%.
export const HAIRPIN_REACH_PER_DROP = 5;
const LINK_SAMPLES = 16;
const HAIRPIN_SAMPLES = 96;
export const CONNECTOR_EDGE_CLEARANCE =
  MINIMUM_HAIRPIN_REACH + SCALE.channelWidth / 2 + RAIL_THICKNESS;
const CONNECTOR_MATERIAL = Object.freeze({
  restitution: SCALE.defaultRestitution,
  friction: SCALE.defaultFriction,
});
const HAIRPIN_MATERIAL = Object.freeze({ restitution: 0, friction: 0.3 });
const GOVERNOR_CLEARANCE = SCALE.marbleRadius * 6;

export interface ConnectorRequest {
  readonly id: string;
  readonly fromSlotIndex: number;
  readonly toSlotIndex: number;
  readonly start: Anchor;
  readonly end: Anchor;
  readonly incomingSpeed: number;
  readonly speedGovernor?: boolean;
}

function vector(value: ThreeVector3): Vector3 {
  return [value.x, value.y, value.z];
}

function direction(anchor: Anchor): ThreeVector3 {
  return new ThreeVector3(...anchor.tangent).normalize();
}

function validateRequest(request: ConnectorRequest): void {
  if (request.id.length === 0) throw new Error("Course connector id must not be empty");
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
  const start = new ThreeVector3(...request.start.position);
  const end = new ThreeVector3(...request.end.position);
  if (startDirection.dot(endDirection) >= 0) {
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

  const drop = start.y - end.y;
  const turnReach = Math.max(MINIMUM_HAIRPIN_REACH, drop * HAIRPIN_REACH_PER_DROP);
  const outwardSign = Math.sign(startDirection.x) || 1;
  const depthReach = drop * 0.75;
  const planarRoute = Array.from({ length: HAIRPIN_SAMPLES + 1 }, (_, index): Vector3 => {
    const t = index / HAIRPIN_SAMPLES;
    return [
      start.x + (end.x - start.x) * t + outwardSign * turnReach * Math.sin(Math.PI * t),
      0,
      start.z +
        (end.z - start.z) * t +
        depthReach * Math.sin(2 * Math.PI * t) * Math.sin(Math.PI * t) ** 2,
    ];
  });
  const planarDistances = [0];
  for (let index = 1; index < planarRoute.length; index += 1) {
    const previous = planarRoute[index - 1];
    const current = planarRoute[index];
    planarDistances.push(
      planarDistances[index - 1] + Math.hypot(current[0] - previous[0], current[2] - previous[2]),
    );
  }
  const planarLength = planarDistances.at(-1)!;

  // Tie descent to distance travelled along the curve. The old linear-t
  // descent became steep around the turn apex, where horizontal motion per
  // sample is smallest even though t keeps advancing at the same rate.
  return planarRoute.map((point, index): Vector3 => [
    point[0],
    start.y - drop * (planarDistances[index] / planarLength),
    point[2],
  ]);
}

function physicalSegments(
  route: readonly Vector3[],
  railHeight: number,
): readonly ChannelSegment[] {
  const segmentIndices = route.slice(0, -1).map((_, index) => index);
  const overlap = JOINT_OVERLAP;
  return segmentIndices.map((routeIndex, physicalIndex) => {
    const start = new ThreeVector3(...route[routeIndex]);
    const end = new ThreeVector3(...route[routeIndex + 1]);
    const segmentDirection = end.clone().sub(start).normalize();
    if (physicalIndex > 0) {
      start.sub(segmentDirection.clone().multiplyScalar(overlap));
    }
    if (physicalIndex < segmentIndices.length - 1) {
      end.add(segmentDirection.clone().multiplyScalar(overlap));
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

interface ChannelCollider {
  readonly collider: ColliderSpec;
  readonly bounds: { readonly min: Vector3; readonly max: Vector3 };
}

function smoothOpenChannelCollider(
  route: readonly Vector3[],
  start: Anchor,
  end: Anchor,
  railHeight: number,
  id: string,
  material: ColliderSpec["material"] = CONNECTOR_MATERIAL,
  endOverlap: number = JOINT_OVERLAP,
): ChannelCollider {
  const floorRoute: readonly Vector3[] = [
    vector(new ThreeVector3(...route[0]).sub(direction(start).multiplyScalar(JOINT_OVERLAP))),
    ...route.map((point): Vector3 => [...point]),
    vector(new ThreeVector3(...route.at(-1)!).add(direction(end).multiplyScalar(endOverlap))),
  ];

  const vertices: number[] = [];
  const indices: number[] = [];
  floorRoute.forEach((point, index) => {
    const before = new ThreeVector3(...floorRoute[Math.max(0, index - 1)]);
    const after = new ThreeVector3(...floorRoute[Math.min(floorRoute.length - 1, index + 1)]);
    const tangent = after.sub(before).normalize();
    const worldUp = new ThreeVector3(0, 1, 0);
    const up =
      index <= 1
        ? new ThreeVector3(...start.up).normalize()
        : index >= floorRoute.length - 2
          ? new ThreeVector3(...end.up).normalize()
          : worldUp
              .clone()
              .sub(tangent.clone().multiplyScalar(worldUp.dot(tangent)))
              .normalize();
    const lateral = up.clone().cross(tangent).normalize();
    const center = new ThreeVector3(...point).add(up.clone().multiplyScalar(FLOOR_THICKNESS / 2));
    const floorLeft = center.clone().sub(lateral.clone().multiplyScalar(SCALE.channelWidth / 2));
    const floorRight = center.clone().add(lateral.multiplyScalar(SCALE.channelWidth / 2));
    const wallOffset = up.clone().multiplyScalar(railHeight);
    const wallLeftTop = floorLeft.clone().add(wallOffset);
    const wallRightTop = floorRight.clone().add(wallOffset);
    [floorLeft, floorRight, wallLeftTop, wallRightTop].forEach((vertex) =>
      vertices.push(vertex.x, vertex.y, vertex.z),
    );
  });

  const addQuad = (a: number, b: number, nextA: number, nextB: number) => {
    indices.push(nextA, b, a, nextA, nextB, b);
  };
  for (let index = 0; index < floorRoute.length - 1; index += 1) {
    const current = index * 4;
    const next = current + 4;
    addQuad(current, current + 1, next, next + 1);
    addQuad(current + 1, current + 3, next + 1, next + 3);
    addQuad(current + 2, current, next + 2, next);
  }
  const coordinates = (axis: 0 | 1 | 2) => vertices.filter((_, index) => index % 3 === axis);
  return {
    collider: {
      id,
      shape: { kind: "trimesh", vertices, indices },
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      material,
    },
    bounds: {
      min: [Math.min(...coordinates(0)), Math.min(...coordinates(1)), Math.min(...coordinates(2))],
      max: [Math.max(...coordinates(0)), Math.max(...coordinates(1)), Math.max(...coordinates(2))],
    },
  };
}

export function buildCourseConnector(request: ConnectorRequest): CourseConnector {
  validateRequest(request);
  const route = routePoints(request);
  const isHairpin = direction(request.start).dot(direction(request.end)) < 0;
  const railHeight = Math.max(
    isHairpin ? Math.max(GOVERNOR_CLEARANCE + FLOOR_THICKNESS, RAIL_HEIGHT) : RAIL_HEIGHT,
    (request.incomingSpeed * request.incomingSpeed) / (2 * GRAVITY_MAGNITUDE) +
      SCALE.marbleRadius * 2,
  );
  const channel = buildChannel(
    physicalSegments(route, railHeight),
    isHairpin ? HAIRPIN_MATERIAL : CONNECTOR_MATERIAL,
    request.id,
  );
  // Use one open swept contact mesh for both links and row turns. The old
  // closed hairpin tunnel gave fast marbles a roof to ricochet between while
  // its coarse outer wall changed collision normal at every facet.
  const smoothChannel = smoothOpenChannelCollider(
    route,
    request.start,
    request.end,
    railHeight,
    `${request.id}-continuous-channel`,
    isHairpin ? HAIRPIN_MATERIAL : CONNECTOR_MATERIAL,
    isHairpin ? SCALE.marbleRadius * 4 : JOINT_OVERLAP,
  );
  const extraBounds = [smoothChannel.bounds];
  const bounds = extraBounds.reduce(
    (current, partBounds) => ({
      min: current.min.map((value, axis) =>
        Math.min(value, partBounds.min[axis]),
      ) as unknown as Vector3,
      max: current.max.map((value, axis) =>
        Math.max(value, partBounds.max[axis]),
      ) as unknown as Vector3,
    }),
    channel.bounds,
  );
  const spec: Spec = {
    colliders: [smoothChannel.collider],
    visuals: channel.visuals,
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
