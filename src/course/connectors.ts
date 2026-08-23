import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import {
  FLOOR_THICKNESS,
  RAIL_HEIGHT,
  RAIL_THICKNESS,
  buildChannel,
  type ChannelSegment,
} from "../modules/geometry/channel";
import type { Anchor, ColliderSpec, Spec, VisualSpec } from "../modules/types";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";
import type { CourseConnector } from "./types";

const GRAVITY_MAGNITUDE = Math.hypot(...SCALE.gravity);
const JOINT_OVERLAP = SCALE.marbleRadius;
const MINIMUM_HAIRPIN_REACH = SCALE.channelWidth / 2 + SCALE.marbleRadius * 4;
export const HAIRPIN_REACH_PER_DROP = 1.5;
const LINK_SAMPLES = 3;
const HAIRPIN_SAMPLES = 32;
export const CONNECTOR_EDGE_CLEARANCE =
  MINIMUM_HAIRPIN_REACH + SCALE.channelWidth / 2 + RAIL_THICKNESS;
const CONNECTOR_MATERIAL = Object.freeze({
  restitution: SCALE.defaultRestitution,
  friction: SCALE.defaultFriction,
});
const HAIRPIN_MATERIAL = Object.freeze({ restitution: 0, friction: 0.3 });
const WALL_MATERIAL = Object.freeze({ color: "#d8ff42", metalness: 0.05, roughness: 0.2 });
const GOVERNOR_CLEARANCE = SCALE.marbleRadius * 6;
const GOVERNOR_MATERIAL = Object.freeze({ restitution: 0, friction: 0.02 });
const GOVERNOR_VISUAL = Object.freeze({ color: "#343b46", metalness: 0.1, roughness: 0.55 });
const GOVERNOR_PADDLE_RADIUS = SCALE.marbleRadius * 2.5;
const GOVERNOR_PADDLE_THICKNESS = SCALE.marbleRadius / 3;
const GOVERNOR_ANGULAR_VELOCITY = -0.5;

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
  return Array.from({ length: HAIRPIN_SAMPLES + 1 }, (_, index): Vector3 => {
    const t = index / HAIRPIN_SAMPLES;
    return [
      start.x + (end.x - start.x) * t + outwardSign * turnReach * Math.sin(Math.PI * t),
      start.y + (end.y - start.y) * t,
      start.z +
        (end.z - start.z) * t +
        depthReach * Math.sin(2 * Math.PI * t) * Math.sin(Math.PI * t) ** 2,
    ];
  });
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

interface ShaftPart {
  readonly collider: ColliderSpec;
  readonly visual: VisualSpec;
  readonly bounds: { readonly min: Vector3; readonly max: Vector3 };
}

interface TunnelCollider {
  readonly collider: ColliderSpec;
  readonly bounds: ShaftPart["bounds"];
}

function hairpinTunnel(route: readonly Vector3[], id: string): TunnelCollider {
  const tunnelRoute = route.map((point): Vector3 => [...point]);
  const entryDirection = new ThreeVector3(...route[1])
    .sub(new ThreeVector3(...route[0]))
    .normalize();
  const exitDirection = new ThreeVector3(...route.at(-1)!)
    .sub(new ThreeVector3(...route.at(-2)!))
    .normalize();
  tunnelRoute[0] = vector(
    new ThreeVector3(...tunnelRoute[0]).sub(entryDirection.multiplyScalar(JOINT_OVERLAP)),
  );
  tunnelRoute[tunnelRoute.length - 1] = vector(
    new ThreeVector3(...tunnelRoute.at(-1)!).add(
      exitDirection.multiplyScalar(SCALE.marbleRadius * 4),
    ),
  );
  const vertices: number[] = [];
  const indices: number[] = [];

  tunnelRoute.forEach((point, index) => {
    const tangent =
      index === 0
        ? new ThreeVector3(...tunnelRoute[1]).sub(new ThreeVector3(...point)).normalize()
        : index === tunnelRoute.length - 1
          ? new ThreeVector3(...point)
              .sub(new ThreeVector3(...tunnelRoute[index - 1]))
              .normalize()
          : new ThreeVector3(...tunnelRoute[index + 1])
              .sub(new ThreeVector3(...tunnelRoute[index - 1]))
              .normalize();
    const worldUp = new ThreeVector3(0, 1, 0);
    const up = worldUp
      .clone()
      .sub(tangent.clone().multiplyScalar(worldUp.dot(tangent)))
      .normalize();
    const lateral = up.clone().cross(tangent).normalize();
    const center = new ThreeVector3(...point).add(
      up.clone().multiplyScalar(FLOOR_THICKNESS / 2),
    );
    const floorLeft = center.clone().sub(lateral.clone().multiplyScalar(SCALE.channelWidth / 2));
    const floorRight = center.clone().add(lateral.clone().multiplyScalar(SCALE.channelWidth / 2));
    const roofOffset = up.clone().multiplyScalar(GOVERNOR_CLEARANCE);
    const ring = [
      floorLeft,
      floorRight,
      floorLeft.clone().add(roofOffset),
      floorRight.clone().add(roofOffset),
    ];
    ring.forEach((vertex) => vertices.push(vertex.x, vertex.y, vertex.z));
  });

  const addQuad = (a: number, b: number, nextA: number, nextB: number) => {
    indices.push(nextA, b, a, nextA, nextB, b);
  };
  for (let index = 0; index < tunnelRoute.length - 1; index += 1) {
    const current = index * 4;
    const next = (index + 1) * 4;
    addQuad(current, current + 1, next, next + 1);
    addQuad(current + 1, current + 3, next + 1, next + 3);
    addQuad(current + 3, current + 2, next + 3, next + 2);
    addQuad(current + 2, current, next + 2, next);
  }
  const coordinates = (axis: 0 | 1 | 2) =>
    vertices.filter((_, index) => index % 3 === axis);
  return {
    collider: {
      id,
      shape: { kind: "trimesh", vertices, indices },
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      material: HAIRPIN_MATERIAL,
    },
    bounds: {
      min: [Math.min(...coordinates(0)), Math.min(...coordinates(1)), Math.min(...coordinates(2))],
      max: [Math.max(...coordinates(0)), Math.max(...coordinates(1)), Math.max(...coordinates(2))],
    },
  };
}

function cuboidBounds(
  halfExtents: Vector3,
  position: Vector3,
  rotation: ColliderSpec["rotation"],
): ShaftPart["bounds"] {
  const orientation = new ThreeQuaternion(...rotation);
  const center = new ThreeVector3(...position);
  const corners = ([-1, 1] as const).flatMap((xSign) =>
    ([-1, 1] as const).flatMap((ySign) =>
      ([-1, 1] as const).map((zSign) =>
        new ThreeVector3(xSign * halfExtents[0], ySign * halfExtents[1], zSign * halfExtents[2])
          .applyQuaternion(orientation)
          .add(center),
      ),
    ),
  );
  const values = (axis: 0 | 1 | 2) => corners.map((corner) => corner.getComponent(axis));
  return {
    min: [Math.min(...values(0)), Math.min(...values(1)), Math.min(...values(2))],
    max: [Math.max(...values(0)), Math.max(...values(1)), Math.max(...values(2))],
  };
}

function shaftPart(
  id: string,
  halfExtents: Vector3,
  position: Vector3,
  rotation: ColliderSpec["rotation"] = [0, 0, 0, 1],
  material: ColliderSpec["material"] = HAIRPIN_MATERIAL,
  visualMaterial: VisualSpec["material"] = WALL_MATERIAL,
): ShaftPart {
  const shape = { kind: "cuboid" as const, halfExtents };
  return {
    collider: { id, shape, position, rotation, material },
    visual: { id, shape, position, rotation, material: visualMaterial },
    bounds: cuboidBounds(halfExtents, position, rotation),
  };
}

function ceilingPart(collider: ColliderSpec, id: string): ShaftPart | null {
  if (collider.shape.kind !== "cuboid") return null;
  const rotation = new ThreeQuaternion(...collider.rotation);
  const up = new ThreeVector3(0, 1, 0).applyQuaternion(rotation).normalize();
  const position = new ThreeVector3(...collider.position).add(
    up.multiplyScalar(GOVERNOR_CLEARANCE + FLOOR_THICKNESS / 2),
  );
  return shaftPart(
    id,
    [collider.shape.halfExtents[0], FLOOR_THICKNESS / 2, collider.shape.halfExtents[2]],
    vector(position),
    collider.rotation,
    GOVERNOR_MATERIAL,
    GOVERNOR_VISUAL,
  );
}

function channelRoof(colliders: readonly ColliderSpec[], idPrefix: string): readonly ShaftPart[] {
  return colliders.flatMap((collider, index) => {
    if (!collider.id.includes("-floor-")) return [];
    const ceiling = ceilingPart(collider, `${idPrefix}-roof-${index}`);
    return ceiling ? [ceiling] : [];
  });
}

function speedGovernor(
  colliders: readonly ColliderSpec[],
  idPrefix: string,
  isHairpin: boolean,
  includeCeilings: boolean,
): readonly ShaftPart[] {
  const floors = colliders.filter(
    (
      collider,
    ): collider is ColliderSpec & {
      readonly shape: { readonly kind: "cuboid"; readonly halfExtents: Vector3 };
    } => collider.id.includes("-floor-") && collider.shape.kind === "cuboid",
  );
  const axleIndices = new Set(
    isHairpin
      ? [Math.floor(floors.length / 3), Math.floor((floors.length * 2) / 3)]
      : [floors.length - 1],
  );
  return floors.flatMap((collider, index) => {
    const rotation = new ThreeQuaternion(...collider.rotation);
    const up = new ThreeVector3(0, 1, 0).applyQuaternion(rotation).normalize();
    const floorCenter = new ThreeVector3(...collider.position);
    const paddleHalfExtents: Vector3 = [
      isHairpin
        ? collider.shape.halfExtents[0] + SCALE.marbleRadius
        : Math.max(
            SCALE.marbleRadius,
            collider.shape.halfExtents[0] - SCALE.marbleRadius * 3,
          ),
      GOVERNOR_PADDLE_RADIUS,
      GOVERNOR_PADDLE_THICKNESS / 2,
    ];
    const paddlePosition = floorCenter
      .clone()
      .add(up.multiplyScalar(FLOOR_THICKNESS / 2 + SCALE.marbleRadius * 3));
    const ceiling = includeCeilings
      ? ceilingPart(collider, `${idPrefix}-governor-ceiling-${index}`)
      : null;
    if (!axleIndices.has(index)) return ceiling ? [ceiling] : [];
    const paddle = (() => {
      const part = shaftPart(
        `${idPrefix}-governor-axle-${index}`,
        paddleHalfExtents,
        vector(paddlePosition),
        collider.rotation,
        GOVERNOR_MATERIAL,
        GOVERNOR_VISUAL,
      );
      const axis = new ThreeVector3(1, 0, 0).applyQuaternion(rotation).normalize();
      return {
        ...part,
        collider: {
          ...part.collider,
          kinematic: true,
          motion: {
            kind: "rotation" as const,
            axis: vector(axis),
            pivot: vector(paddlePosition),
            angularVelocity: GOVERNOR_ANGULAR_VELOCITY,
          },
        },
      };
    })();
    return ceiling ? [ceiling, paddle] : [paddle];
  });
}

function entranceRailOverlaps(
  colliders: readonly ColliderSpec[],
  idPrefix: string,
): readonly ShaftPart[] {
  return colliders.flatMap((collider) => {
    if (
      collider.shape.kind !== "cuboid" ||
      !/(?:-rail-left|-rail-right)-0$/.test(collider.id)
    ) {
      return [];
    }
    const rotation = new ThreeQuaternion(...collider.rotation);
    const tangent = new ThreeVector3(0, 0, 1).applyQuaternion(rotation).normalize();
    const halfLength = JOINT_OVERLAP;
    const railStart = new ThreeVector3(...collider.position).sub(
      tangent.clone().multiplyScalar(collider.shape.halfExtents[2]),
    );
    const position = railStart.sub(tangent.multiplyScalar(halfLength / 2));
    return [
      shaftPart(
        `${idPrefix}-entrance-${collider.id.endsWith("-rail-left-0") ? "rail-left" : "rail-right"}`,
        [collider.shape.halfExtents[0], collider.shape.halfExtents[1], halfLength],
        vector(position),
        collider.rotation,
        collider.material,
      ),
    ];
  });
}

export function buildCourseConnector(request: ConnectorRequest): CourseConnector {
  validateRequest(request);
  const route = routePoints(request);
  const isHairpin = direction(request.start).dot(direction(request.end)) < 0;
  const railHeight = Math.max(
    isHairpin ? GOVERNOR_CLEARANCE + FLOOR_THICKNESS : RAIL_HEIGHT,
    (request.incomingSpeed * request.incomingSpeed) / (2 * GRAVITY_MAGNITUDE) +
      SCALE.marbleRadius * 2,
  );
  const channel = buildChannel(
    physicalSegments(route, railHeight),
    isHairpin ? HAIRPIN_MATERIAL : CONNECTOR_MATERIAL,
    request.id,
  );
  const governor = request.speedGovernor
    ? speedGovernor(channel.colliders, request.id, isHairpin, !isHairpin)
    : [];
  const entranceGuard = isHairpin ? [] : entranceRailOverlaps(channel.colliders, request.id);
  const roof = isHairpin ? channelRoof(channel.colliders, request.id) : [];
  const tunnel = isHairpin ? hairpinTunnel(route, `${request.id}-tunnel`) : null;
  const extraBounds = [
    ...governor.map(({ bounds }) => bounds),
    ...entranceGuard.map(({ bounds }) => bounds),
    ...roof.map(({ bounds }) => bounds),
    ...(tunnel ? [tunnel.bounds] : []),
  ];
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
    colliders: [
      ...(tunnel ? [tunnel.collider] : channel.colliders),
      ...entranceGuard.map(({ collider }) => collider),
      ...governor.map(({ collider }) => collider),
    ],
    visuals: [
      ...channel.visuals,
      ...entranceGuard.map(({ visual }) => visual),
      ...governor.map(({ visual }) => visual),
      ...roof.map(({ visual }) => visual),
    ],
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
