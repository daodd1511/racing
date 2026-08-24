import { FLOOR_THICKNESS } from "../../modules/geometry/channel";
import type { Shape, Spec, VisualMaterial, VisualSpec } from "../../modules/types";
import { SCALE } from "../../race/scale";
import type { Vector3 } from "../../race/types";

const CONNECTOR_PREFIX = /^(connector-\d+-\d+)-/;
const RAW_CONNECTOR_CHANNEL_VISUAL =
  /^connector-\d+-\d+-(?:floor|rail-(?:left|right)|entrance-rail-(?:left|right))(?:-\d+)?$/;
const OCCLUDING_CONNECTOR_VISUAL = /^connector-\d+-\d+-(?:roof|governor-ceiling)(?:-\d+)?$/;
const EPSILON = 1e-9;
const JOINT_OVERLAP = SCALE.marbleRadius * 4;
const FLOOR_MATERIAL: VisualMaterial = Object.freeze({
  color: "#d8d3c8",
  metalness: 0.04,
  roughness: 0.58,
});
const RAIL_MATERIAL: VisualMaterial = Object.freeze({
  color: "#d8ff42",
  metalness: 0.05,
  roughness: 0.2,
});

function subtract(left: Vector3, right: Vector3): Vector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(vector: Vector3): Vector3 {
  const magnitude = Math.hypot(...vector);
  if (magnitude <= EPSILON) throw new Error("Race connector needs non-zero route segments");
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
}

interface RouteFrame {
  readonly lateral: Vector3;
  readonly up: Vector3;
}

function routeFrames(route: readonly Vector3[]): readonly RouteFrame[] {
  let previousLateral: Vector3 | null = null;
  return route.map((point, index) => {
    const before = route[Math.max(0, index - 1)];
    const after = route[Math.min(route.length - 1, index + 1)];
    const tangent = normalize(subtract(after, before));
    const gravityUp: Vector3 = [0, 1, 0];
    const tangentUp = dot(gravityUp, tangent);
    let up: Vector3 = [
      gravityUp[0] - tangent[0] * tangentUp,
      gravityUp[1] - tangent[1] * tangentUp,
      gravityUp[2] - tangent[2] * tangentUp,
    ];
    if (Math.hypot(...up) <= EPSILON) {
      const boardNormal: Vector3 = [0, 0, 1];
      const tangentNormal = dot(boardNormal, tangent);
      up = [
        boardNormal[0] - tangent[0] * tangentNormal,
        boardNormal[1] - tangent[1] * tangentNormal,
        boardNormal[2] - tangent[2] * tangentNormal,
      ];
    }
    up = normalize(up);
    let lateral = normalize(cross(up, tangent));
    if (previousLateral !== null && dot(previousLateral, lateral) < 0) {
      lateral = [-lateral[0], -lateral[1], -lateral[2]];
    }
    previousLateral = lateral;
    return { lateral, up };
  });
}

function sweptRibbon(
  route: readonly Vector3[],
  width: number,
  lateralOffset: number,
  upOffset: number,
): Shape {
  if (route.length < 2) throw new Error("Race connector needs at least two route points");
  const frames = routeFrames(route);
  const vertices: number[] = [];
  const indices: number[] = [];

  route.forEach((point, index) => {
    const { lateral, up } = frames[index];
    const center: Vector3 = [
      point[0] + lateral[0] * lateralOffset + up[0] * upOffset,
      point[1] + lateral[1] * lateralOffset + up[1] * upOffset,
      point[2] + lateral[2] * lateralOffset + up[2] * upOffset,
    ];
    const halfWidth = width / 2;
    vertices.push(
      center[0] - lateral[0] * halfWidth,
      center[1] - lateral[1] * halfWidth,
      center[2] - lateral[2] * halfWidth,
      center[0] + lateral[0] * halfWidth,
      center[1] + lateral[1] * halfWidth,
      center[2] + lateral[2] * halfWidth,
    );
  });

  for (let index = 0; index < route.length - 1; index += 1) {
    const current = index * 2;
    const next = current + 2;
    indices.push(current, next, current + 1, current + 1, next, next + 1);
  }
  return { kind: "trimesh", vertices, indices };
}

function extendRoute(route: readonly Vector3[]): readonly Vector3[] {
  if (route.length < 2) return route;
  const firstTangent = normalize(subtract(route[1], route[0]));
  const lastTangent = normalize(subtract(route.at(-1)!, route.at(-2)!));
  return route.map((point, index): Vector3 => {
    if (index === 0) {
      return [
        point[0] - firstTangent[0] * JOINT_OVERLAP,
        point[1] - firstTangent[1] * JOINT_OVERLAP,
        point[2] - firstTangent[2] * JOINT_OVERLAP,
      ];
    }
    if (index === route.length - 1) {
      return [
        point[0] + lastTangent[0] * JOINT_OVERLAP,
        point[1] + lastTangent[1] * JOINT_OVERLAP,
        point[2] + lastTangent[2] * JOINT_OVERLAP,
      ];
    }
    return [...point];
  });
}

function sweptWall(
  route: readonly Vector3[],
  lateralOffset: number,
  height: number,
  reverseWinding: boolean,
): Shape {
  const frames = routeFrames(route);
  const vertices: number[] = [];
  const indices: number[] = [];

  route.forEach((point, index) => {
    const { lateral, up } = frames[index];
    const base: Vector3 = [
      point[0] + lateral[0] * lateralOffset,
      point[1] + lateral[1] * lateralOffset,
      point[2] + lateral[2] * lateralOffset,
    ];
    vertices.push(
      ...base,
      base[0] + up[0] * height,
      base[1] + up[1] * height,
      base[2] + up[2] * height,
    );
  });

  for (let index = 0; index < route.length - 1; index += 1) {
    const bottom = index * 2;
    const top = bottom + 1;
    const nextBottom = bottom + 2;
    const nextTop = bottom + 3;
    if (reverseWinding) {
      indices.push(bottom, nextBottom, top, top, nextBottom, nextTop);
    } else {
      indices.push(bottom, top, nextBottom, top, nextTop, nextBottom);
    }
  }
  return { kind: "trimesh", vertices, indices };
}

function smoothConnectorVisuals(prefix: string, route: readonly Vector3[]): readonly VisualSpec[] {
  const overlappedRoute = extendRoute(route);
  const railOffset = SCALE.channelWidth / 2;
  const railHeight = SCALE.marbleRadius * 6;
  return [
    {
      id: `${prefix}-race-floor`,
      shape: sweptRibbon(overlappedRoute, SCALE.channelWidth, 0, FLOOR_THICKNESS / 2),
      material: FLOOR_MATERIAL,
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    },
    ...([-1, 1] as const).map((side): VisualSpec => ({
      id: `${prefix}-race-rail-${side < 0 ? "left" : "right"}`,
      shape: sweptWall(overlappedRoute, railOffset * side, railHeight, side > 0),
      material: RAIL_MATERIAL,
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })),
  ];
}

/** Keeps physical connector walls/covers while replacing their collider tiling with a smooth raceway. */
export function raceVisibleSpec(spec: Spec): Spec {
  const prefix = spec.visuals
    .map(({ id }) => CONNECTOR_PREFIX.exec(id)?.[1])
    .find((candidate): candidate is string => candidate !== undefined);
  const visible = spec.visuals.filter(
    (visual) =>
      !OCCLUDING_CONNECTOR_VISUAL.test(visual.id) && !RAW_CONNECTOR_CHANNEL_VISUAL.test(visual.id),
  );
  const visuals =
    prefix === undefined
      ? visible
      : [...visible, ...smoothConnectorVisuals(prefix, spec.footprint.route)];
  return visuals.length === spec.visuals.length &&
    visuals.every((visual, index) => visual === spec.visuals[index])
    ? spec
    : { ...spec, visuals };
}
