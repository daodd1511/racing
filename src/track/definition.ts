import type { Quaternion, Vector3 } from "../race/types";

export interface TrackMaterial {
  readonly restitution: number;
  readonly friction: number;
}

export type TrackBoxKind = "side-rail" | "gate" | "splitter" | "chicane" | "deflector";
export interface TrackBox {
  readonly kind: TrackBoxKind;
  readonly center: Vector3;
  readonly rotation: Quaternion;
  readonly halfExtents: Vector3;
  readonly material: TrackMaterial;
}

export interface TrackSurface {
  readonly vertices: readonly number[];
  readonly indices: readonly number[];
  readonly material: TrackMaterial;
}

export interface TrackPathSample {
  readonly position: Vector3;
  readonly tangent: Vector3;
  readonly side: Vector3;
  readonly up: Vector3;
  readonly distance: number;
}

export interface TrackFinishLine {
  readonly center: Vector3;
  readonly tangent: Vector3;
  readonly side: Vector3;
  readonly up: Vector3;
  readonly halfWidth: number;
}

export interface TrackConfig {
  readonly trackHalfWidth: number;
  readonly trackThickness: number;
  readonly railHeight: number;
  readonly railThickness: number;
  readonly samplesPerSpan: number;
  readonly maximumBankRadians: number;
  readonly marbleRadius: number;
  readonly startSlotCount: number;
}

export interface TrackDefinition {
  readonly config: TrackConfig;
  readonly boxes: readonly TrackBox[];
  readonly surface: TrackSurface;
  readonly path: readonly TrackPathSample[];
  readonly startSlots: readonly Vector3[];
  readonly finishProgress: number;
  readonly finishLine: TrackFinishLine;
}

export const DEFAULT_TRACK_CONFIG: TrackConfig = Object.freeze({
  trackHalfWidth: 5.5,
  trackThickness: 0.38,
  railHeight: 1.35,
  railThickness: 0.2,
  samplesPerSpan: 32,
  maximumBankRadians: 0.08,
  marbleRadius: 0.35,
  startSlotCount: 15,
});

const TRACK_MATERIAL: TrackMaterial = Object.freeze({ restitution: 0, friction: 0.1 });
const RAIL_MATERIAL: TrackMaterial = Object.freeze({ restitution: 0.03, friction: 0.11 });
const BUMPER_MATERIAL: TrackMaterial = Object.freeze({ restitution: 0, friction: 0.04 });
const WORLD_UP: Vector3 = [0, 1, 0];

const COURSE_WAYPOINTS: readonly Vector3[] = Object.freeze([
  [0, 30, -8],
  [0, 26, 8],
  [9, 20, 24],
  [-8, 15.5, 42],
  [-5, 11.5, 58],
  [8, 7, 76],
  [-6, 2.5, 94],
  [0, -3, 116],
  [10, -8, 136],
  [-5, -11.5, 150],
  [4, -16.5, 170],
  [1, -21.5, 190],
  [0, -26.5, 210],
]);

function add(left: Vector3, right: Vector3): Vector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(vector: Vector3, factor: number): Vector3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function dot(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function length(vector: Vector3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: Vector3): Vector3 {
  const vectorLength = length(vector);
  if (vectorLength === 0) {
    throw new Error("Cannot normalize a zero-length vector");
  }
  return scale(vector, 1 / vectorLength);
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function rotateAroundAxis(vector: Vector3, axis: Vector3, radians: number): Vector3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const axisProjection = scale(
    axis,
    axis[0] * vector[0] + axis[1] * vector[1] + axis[2] * vector[2],
  );
  return add(
    add(scale(vector, cosine), scale(cross(axis, vector), sine)),
    scale(axisProjection, 1 - cosine),
  );
}

function quaternionFromBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): Quaternion {
  const m00 = xAxis[0];
  const m01 = yAxis[0];
  const m02 = zAxis[0];
  const m10 = xAxis[1];
  const m11 = yAxis[1];
  const m12 = zAxis[1];
  const m20 = xAxis[2];
  const m21 = yAxis[2];
  const m22 = zAxis[2];
  const trace = m00 + m11 + m22;

  if (trace > 0) {
    const root = Math.sqrt(trace + 1) * 2;
    return [(m21 - m12) / root, (m02 - m20) / root, (m10 - m01) / root, root / 4];
  }
  if (m00 > m11 && m00 > m22) {
    const root = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return [root / 4, (m01 + m10) / root, (m02 + m20) / root, (m21 - m12) / root];
  }
  if (m11 > m22) {
    const root = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return [(m01 + m10) / root, root / 4, (m12 + m21) / root, (m02 - m20) / root];
  }
  const root = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return [(m02 + m20) / root, (m12 + m21) / root, root / 4, (m10 - m01) / root];
}

function catmullRom(
  before: Vector3,
  start: Vector3,
  end: Vector3,
  after: Vector3,
  t: number,
): Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const coordinate = (axis: 0 | 1 | 2): number =>
    0.5 *
    (2 * start[axis] +
      (-before[axis] + end[axis]) * t +
      (2 * before[axis] - 5 * start[axis] + 4 * end[axis] - after[axis]) * t2 +
      (-before[axis] + 3 * start[axis] - 3 * end[axis] + after[axis]) * t3);
  return [coordinate(0), coordinate(1), coordinate(2)];
}

function createPath(config: TrackConfig): TrackPathSample[] {
  const positions: Vector3[] = [];
  for (let span = 0; span < COURSE_WAYPOINTS.length - 1; span += 1) {
    const before = COURSE_WAYPOINTS[Math.max(0, span - 1)];
    const start = COURSE_WAYPOINTS[span];
    const end = COURSE_WAYPOINTS[span + 1];
    const after = COURSE_WAYPOINTS[Math.min(COURSE_WAYPOINTS.length - 1, span + 2)];
    for (let step = 0; step < config.samplesPerSpan; step += 1) {
      positions.push(catmullRom(before, start, end, after, step / config.samplesPerSpan));
    }
  }
  positions.push(COURSE_WAYPOINTS.at(-1) as Vector3);

  let cumulativeDistance = 0;
  return positions.map((position, index) => {
    if (index > 0) {
      cumulativeDistance += length(subtract(position, positions[index - 1]));
    }
    const previous = positions[Math.max(0, index - 1)];
    const next = positions[Math.min(positions.length - 1, index + 1)];
    const tangent = normalize(subtract(next, previous));
    const baseSide = normalize(cross(WORLD_UP, tangent));
    const previousTangent =
      index > 0 ? normalize(subtract(position, positions[index - 1])) : tangent;
    const nextTangent =
      index < positions.length - 1 ? normalize(subtract(positions[index + 1], position)) : tangent;
    const turn = previousTangent[0] * nextTangent[2] - previousTangent[2] * nextTangent[0];
    const bank = Math.max(
      -config.maximumBankRadians,
      Math.min(config.maximumBankRadians, turn * 2.8),
    );
    const side = normalize(rotateAroundAxis(baseSide, tangent, bank));
    const up = normalize(cross(tangent, side));
    return Object.freeze({ position, tangent, side, up, distance: cumulativeDistance });
  });
}

function interpolatePathSample(
  path: readonly TrackPathSample[],
  distance: number,
): TrackPathSample {
  const bounded = Math.max(0, Math.min(path.at(-1)?.distance ?? 0, distance));
  let upperIndex = path.findIndex((sample) => sample.distance >= bounded);
  if (upperIndex <= 0) {
    return path[0];
  }
  if (upperIndex < 0) {
    upperIndex = path.length - 1;
  }
  const left = path[upperIndex - 1];
  const right = path[upperIndex];
  const span = right.distance - left.distance;
  const fraction = span === 0 ? 0 : (bounded - left.distance) / span;
  const tangent = normalize(
    add(left.tangent, scale(subtract(right.tangent, left.tangent), fraction)),
  );
  const blendedSide = add(left.side, scale(subtract(right.side, left.side), fraction));
  const side = normalize(subtract(blendedSide, scale(tangent, dot(blendedSide, tangent))));
  return {
    position: add(left.position, scale(subtract(right.position, left.position), fraction)),
    tangent,
    side,
    up: normalize(cross(tangent, side)),
    distance: bounded,
  };
}

function trackHalfWidthAtDistance(config: TrackConfig, distance: number): number {
  const apronFraction = Math.max(0, Math.min(1, (36 - distance) / 24));
  return config.trackHalfWidth + apronFraction * 0.9;
}

function assertTrackConfig(config: TrackConfig): void {
  if (Object.values(config).some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError("Track configuration values must be positive finite numbers");
  }
  if (
    !Number.isSafeInteger(config.samplesPerSpan) ||
    !Number.isSafeInteger(config.startSlotCount)
  ) {
    throw new RangeError("Track sample and slot counts must be safe integers");
  }
  if (config.maximumBankRadians >= Math.PI / 4) {
    throw new RangeError("Track bank setting is outside supported bounds");
  }
}

export function createTrackDefinition(config: TrackConfig): TrackDefinition {
  assertTrackConfig(config);
  const path = createPath(config);
  const boxes: TrackBox[] = [];

  const surfaceVertices: number[] = [];
  const surfaceIndices: number[] = [];
  for (const sample of path) {
    const halfWidth = trackHalfWidthAtDistance(config, sample.distance);
    const right = add(sample.position, scale(sample.side, halfWidth));
    const left = add(sample.position, scale(sample.side, -halfWidth));
    surfaceVertices.push(...right, ...left);
  }
  for (let index = 0; index < path.length - 1; index += 1) {
    const right = index * 2;
    const left = right + 1;
    const nextRight = right + 2;
    const nextLeft = right + 3;
    surfaceIndices.push(right, left, nextRight, left, nextLeft, nextRight);
  }

  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const centerSample = interpolatePathSample(path, (start.distance + end.distance) / 2);
    const segmentLength = end.distance - start.distance;
    const halfWidth = trackHalfWidthAtDistance(config, centerSample.distance);
    const rotation = quaternionFromBasis(centerSample.side, centerSample.up, centerSample.tangent);
    for (const direction of [-1, 1]) {
      boxes.push({
        kind: "side-rail",
        center: add(
          add(
            centerSample.position,
            scale(centerSample.side, direction * (halfWidth - config.railThickness / 2)),
          ),
          scale(centerSample.up, config.railHeight / 2),
        ),
        rotation,
        halfExtents: [config.railThickness / 2, config.railHeight / 2, segmentLength / 2 + 0.35],
        material: RAIL_MATERIAL,
      });
    }
  }

  const totalDistance = path.at(-1)?.distance ?? 0;
  const addBarrier = (
    kind: Exclude<TrackBoxKind, "side-rail">,
    fraction: number,
    direction: -1 | 1,
    halfWidth: number,
    lateralOffset: number,
    angle: number,
  ): void => {
    const sample = interpolatePathSample(path, totalDistance * fraction);
    const barrierAxis = normalize(add(sample.side, scale(sample.tangent, direction * angle)));
    const barrierForward = normalize(cross(barrierAxis, sample.up));
    boxes.push({
      kind,
      center: add(
        add(sample.position, scale(sample.side, lateralOffset)),
        scale(sample.up, config.railHeight * 0.52),
      ),
      rotation: quaternionFromBasis(barrierAxis, sample.up, barrierForward),
      halfExtents: [halfWidth, config.railHeight * 0.52, config.railThickness],
      material: BUMPER_MATERIAL,
    });
  };

  const gateLayout: readonly [number, -1 | 1][] = [
    [0.18, -1],
    [0.25, 1],
    [0.32, -1],
    [0.47, 1],
    [0.54, -1],
    [0.68, 1],
    [0.76, -1],
  ];
  for (const [fraction, direction] of gateLayout) {
    addBarrier("gate", fraction, direction, 0.95, direction * 2, 10);
  }

  for (const direction of [-1, 1] as const) {
    addBarrier(
      "deflector",
      0.92,
      direction,
      0.32,
      direction * (config.trackHalfWidth - 0.32),
      0.55,
    );
  }

  const startSlots: Vector3[] = [];
  const startSample = interpolatePathSample(path, 1.5);
  const availableHalfWidth =
    trackHalfWidthAtDistance(config, startSample.distance) -
    config.railThickness -
    config.marbleRadius;
  const slotGap = Math.min(0.66, (availableHalfWidth * 2) / (config.startSlotCount - 1));
  for (let slot = 0; slot < config.startSlotCount; slot += 1) {
    const lateral = (slot - (config.startSlotCount - 1) / 2) * slotGap;
    startSlots.push(
      add(
        add(startSample.position, scale(startSample.side, lateral)),
        scale(startSample.up, config.marbleRadius + 0.005),
      ),
    );
  }

  const finishProgress = totalDistance - 4;
  const finishSample = interpolatePathSample(path, finishProgress);
  return Object.freeze({
    config,
    boxes: Object.freeze(boxes),
    surface: Object.freeze({
      vertices: Object.freeze(surfaceVertices),
      indices: Object.freeze(surfaceIndices),
      material: TRACK_MATERIAL,
    }),
    path: Object.freeze(path),
    startSlots: Object.freeze(startSlots),
    finishProgress,
    finishLine: Object.freeze({
      center: finishSample.position,
      tangent: finishSample.tangent,
      side: finishSample.side,
      up: finishSample.up,
      halfWidth: config.trackHalfWidth,
    }),
  });
}
