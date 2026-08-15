import type { Quaternion, Vector3 } from "../race/types";

export interface TrackMaterial {
  readonly restitution: number;
  readonly friction: number;
}

export type TrackBoxKind = "side-rail" | "pin" | "rumble";

export type TrackShape =
  | { readonly kind: "cuboid"; readonly halfExtents: Vector3 }
  | { readonly kind: "cylinder"; readonly radius: number; readonly halfHeight: number }
  | { readonly kind: "ball"; readonly radius: number };

export interface TrackBox {
  readonly kind: TrackBoxKind;
  readonly center: Vector3;
  readonly rotation: Quaternion;
  readonly shape: TrackShape;
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
const PIN_MATERIAL: TrackMaterial = Object.freeze({ restitution: 0.3, friction: 0.06 });
const RUMBLE_MATERIAL: TrackMaterial = Object.freeze({ restitution: 0.1, friction: 0.3 });
const WORLD_UP: Vector3 = [0, 1, 0];

const PRE_BOWL_WAYPOINTS: readonly Vector3[] = Object.freeze([
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
]);

interface SpiralWaypoints {
  readonly points: readonly Vector3[];
  readonly exitHeadingXZ: readonly [number, number];
  // A synthetic point one step *before* `entry`, continuing the spiral's own
  // circular rhythm backward rather than reusing whatever preceded `entry` in
  // the outer course. Needed as the Catmull-Rom "before" reference for the
  // spiral's own first span — see the comment at its use site for why.
  readonly virtualPointBeforeEntry: Vector3;
}

// Generates `sampleCount` new waypoints spiralling `turns` revolutions
// around a circle of the given `radius`, descending `totalDrop` in total,
// starting from `entry` with initial tangent `entryHeadingXZ` (a unit
// vector in the XZ plane) so the spiral's own tangent continues whatever
// segment feeds into it, rather than kinking at the join. The circle's
// centre is placed so `entry` itself lies exactly on it — `entry` is not
// included in the returned points, only what comes after it.
function generateSpiralWaypoints(
  entry: Vector3,
  entryHeadingXZ: readonly [number, number],
  radius: number,
  turns: number,
  totalDrop: number,
  sampleCount: number,
): SpiralWaypoints {
  const entryAngle = Math.atan2(entryHeadingXZ[1], entryHeadingXZ[0]) - Math.PI / 2;
  const centerX = entry[0] - radius * Math.cos(entryAngle);
  const centerZ = entry[2] - radius * Math.sin(entryAngle);
  const points: Vector3[] = [];
  for (let step = 1; step <= sampleCount; step += 1) {
    const angle = entryAngle + step * ((turns * 2 * Math.PI) / sampleCount);
    points.push([
      centerX + radius * Math.cos(angle),
      entry[1] - (step / sampleCount) * totalDrop,
      centerZ + radius * Math.sin(angle),
    ]);
  }
  const exitAngle = entryAngle + turns * 2 * Math.PI + Math.PI / 2;
  const stepAngle = (turns * 2 * Math.PI) / sampleCount;
  const beforeAngle = entryAngle - stepAngle;
  const virtualPointBeforeEntry: Vector3 = [
    centerX + radius * Math.cos(beforeAngle),
    entry[1] + (totalDrop / sampleCount),
    centerZ + radius * Math.sin(beforeAngle),
  ];
  return {
    points,
    exitHeadingXZ: [Math.cos(exitAngle), Math.sin(exitAngle)],
    virtualPointBeforeEntry,
  };
}

// Vortex bowl (OBSTACLE-IDEAS.md module 9): a descending spiral routed
// through the centreline itself, not a second mesh source (PLAN.md → "The
// bowl is a spiral centreline, not an exception to the centreline" —
// rejected a revolved-trimesh build for exactly this reason). 2.5 turns is
// deliberate, not arbitrary: a half-integer turn count lands the exit
// diametrically opposite the entry ("a drain on the far side",
// OBSTACLE-IDEAS module 9), which necessarily *reverses* the direction of
// travel (tangent at exit = tangent at entry + 180°, an inherent property
// of a half-turn offset). The return loop immediately after undoes that
// reversal — a second, smaller half-turn spiral — so the course can still
// reach the finish heading the way the rest of it does.
//
// Radius/width note: "8 m across" (module 9) describes the bowl's overall
// footprint; a literal 8 m outer diameter conflicts with the ≥6-marble-
// diameter (2.1 m half-width) drain-width floor below once a bed of that
// width is wound around it — the two numbers describe different things
// (visual scale vs. a pinch-safety minimum) and can't both be hit exactly.
// Weighted the safety number: outer edge runs closer to 12 m than 8 m.
const BOWL_RADIUS = 4;
const BOWL_TURNS = 2.5;
const BOWL_SAMPLES_PER_TURN = 8;
const BOWL_DROP = 22;
const RETURN_LOOP_RADIUS = 6;
const RETURN_LOOP_TURNS = 0.5;
const RETURN_LOOP_SAMPLES_PER_TURN = 16;
const RETURN_LOOP_DROP = 3;
const FINISH_STRAIGHT_SEGMENT_LENGTH = 15;
const FINISH_STRAIGHT_SEGMENT_DROP = 1;
const FINISH_STRAIGHT_SEGMENT_COUNT = 2;

function headingXZ(from: Vector3, to: Vector3): readonly [number, number] {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const planarLength = Math.hypot(dx, dz);
  return [dx / planarLength, dz / planarLength];
}

// Buffer span between the outer course and the spiral, not a direct join:
// four independent fixes at a direct wp10->spiral join (curvature sampling,
// a Catmull-Rom "before"-reference mismatch, a banking-ceiling
// discontinuity, and the fraction-drift this file's other comments
// describe) still left one marble per race settling into a genuine
// oscillating pothole right at the join, verified by position/velocity
// trace, not assumed. A straight, gently-graded buffer gives the geometry
// physical room to settle before the tight curvature starts, rather than
// patching parameters at an instantaneous transition. The buffer continues
// the pre-bowl approach's own heading exactly (zero net turn at wp10
// itself), so it introduces no new curvature of its own.
const BUFFER_LENGTH_METERS = 12;
const BUFFER_GRADE = 0.28;

const bowlApproach = PRE_BOWL_WAYPOINTS.at(-1) as Vector3;
const bowlApproachHeading = headingXZ(PRE_BOWL_WAYPOINTS.at(-2) as Vector3, bowlApproach);
const bufferPoint: Vector3 = [
  bowlApproach[0] + bowlApproachHeading[0] * BUFFER_LENGTH_METERS,
  bowlApproach[1] - BUFFER_LENGTH_METERS * BUFFER_GRADE,
  bowlApproach[2] + bowlApproachHeading[1] * BUFFER_LENGTH_METERS,
];

const bowlEntry = bufferPoint;
const bowlEntryHeading = bowlApproachHeading;
const bowlLoop = generateSpiralWaypoints(
  bowlEntry,
  bowlEntryHeading,
  BOWL_RADIUS,
  BOWL_TURNS,
  BOWL_DROP,
  Math.round(BOWL_TURNS * BOWL_SAMPLES_PER_TURN),
);
const returnLoop = generateSpiralWaypoints(
  bowlLoop.points.at(-1) as Vector3,
  bowlLoop.exitHeadingXZ,
  RETURN_LOOP_RADIUS,
  RETURN_LOOP_TURNS,
  RETURN_LOOP_DROP,
  Math.round(RETURN_LOOP_TURNS * RETURN_LOOP_SAMPLES_PER_TURN),
);
const finishStraightWaypoints: Vector3[] = [];
{
  let cursor = returnLoop.points.at(-1) as Vector3;
  for (let segment = 0; segment < FINISH_STRAIGHT_SEGMENT_COUNT; segment += 1) {
    cursor = [
      cursor[0] + returnLoop.exitHeadingXZ[0] * FINISH_STRAIGHT_SEGMENT_LENGTH,
      cursor[1] - FINISH_STRAIGHT_SEGMENT_DROP,
      cursor[2] + returnLoop.exitHeadingXZ[1] * FINISH_STRAIGHT_SEGMENT_LENGTH,
    ];
    finishStraightWaypoints.push(cursor);
  }
}

const COURSE_WAYPOINTS: readonly Vector3[] = Object.freeze([
  ...PRE_BOWL_WAYPOINTS,
  bufferPoint,
  ...bowlLoop.points,
  ...returnLoop.points,
  ...finishStraightWaypoints,
]);

// Span indices (not sample indices) covering the bowl and return loop, used
// to raise sampling density and the banking ceiling only across the tight
// section — never the global `DEFAULT_TRACK_CONFIG` values (per PLAN.md →
// "Progress hardening and the vortex bowl").
// +1 for the buffer point inserted above: the span needing elevated
// sampling/banking is buffer -> first spiral waypoint, not wp10 -> buffer
// (that span is a normal, low-curvature continuation of the approach
// heading and doesn't need either).
const BOWL_FIRST_SPAN_INDEX = PRE_BOWL_WAYPOINTS.length;
const BOWL_LAST_SPAN_INDEX =
  BOWL_FIRST_SPAN_INDEX + bowlLoop.points.length + returnLoop.points.length - 1;
const BOWL_SAMPLES_PER_SPAN = 96;
const BOWL_MAXIMUM_BANK_RADIANS = 0.35;
const BANK_CEILING_TRANSITION_SAMPLES = 30;

function isBowlSpan(span: number): boolean {
  return span >= BOWL_FIRST_SPAN_INDEX && span <= BOWL_LAST_SPAN_INDEX;
}

function samplesForSpan(config: TrackConfig, span: number): number {
  return isBowlSpan(span) ? BOWL_SAMPLES_PER_SPAN : config.samplesPerSpan;
}

// Cumulative sample count reached by the start of the given span — the
// inverse of `samplesForSpan`'s per-span counts, used to translate a span
// index into a sample/path index once path samples exist.
function sampleIndexAtSpanStart(config: TrackConfig, span: number): number {
  let index = 0;
  for (let candidate = 0; candidate < span; candidate += 1) {
    index += samplesForSpan(config, candidate);
  }
  return index;
}

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
    // The spiral's own first span (wp10 -> its first waypoint) is the one
    // place a Catmull-Rom "before" reference drawn from COURSE_WAYPOINTS
    // would be wp9 — a point from the outer course's completely different
    // rhythm. That mismatch measurably flattens this span's elevation curve
    // (verified: the sampled Y-drop collapses to near zero right after the
    // join, though every control point's own Y value keeps descending
    // normally — a real, if easy to miss, artifact of the cubic blend), so
    // marbles arriving here can lose almost all their downhill momentum in
    // the first couple of metres. A synthetic "before" point continuing the
    // spiral's own circular rhythm backward fixes it. Every other span in
    // the bowl/return-loop/finish-straight already draws `before` from the
    // same family it belongs to, so this is the only span needing it.
    const before =
      span === BOWL_FIRST_SPAN_INDEX
        ? bowlLoop.virtualPointBeforeEntry
        : COURSE_WAYPOINTS[Math.max(0, span - 1)];
    const start = COURSE_WAYPOINTS[span];
    const end = COURSE_WAYPOINTS[span + 1];
    const after = COURSE_WAYPOINTS[Math.min(COURSE_WAYPOINTS.length - 1, span + 2)];
    const spanSampleCount = samplesForSpan(config, span);
    for (let step = 0; step < spanSampleCount; step += 1) {
      positions.push(catmullRom(before, start, end, after, step / spanSampleCount));
    }
  }
  positions.push(COURSE_WAYPOINTS.at(-1) as Vector3);

  const bowlStartSampleIndex = sampleIndexAtSpanStart(config, BOWL_FIRST_SPAN_INDEX);
  const bowlEndSampleIndex = sampleIndexAtSpanStart(config, BOWL_LAST_SPAN_INDEX + 1) - 1;

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
    // Blended, not a hard switch at the bowl boundary: clamping the *same*
    // raw `turn` value against two different ceilings one sample apart can
    // itself force a discontinuous jump in the applied bank angle (up to
    // BOWL_MAXIMUM_BANK_RADIANS - config.maximumBankRadians in a single
    // step), independently of anything about the waypoints — verified this
    // was twisting the surface mesh into a physical pothole right at the
    // join that trapped marbles in a settling oscillation, not just a lack
    // of speed. Blending over BANK_CEILING_TRANSITION_SAMPLES removes the
    // step.
    const samplesOutsideBowl =
      index < bowlStartSampleIndex
        ? bowlStartSampleIndex - index
        : index > bowlEndSampleIndex
          ? index - bowlEndSampleIndex
          : 0;
    const bowlBankBlend = Math.max(0, 1 - samplesOutsideBowl / BANK_CEILING_TRANSITION_SAMPLES);
    const bankCeiling =
      config.maximumBankRadians +
      (BOWL_MAXIMUM_BANK_RADIANS - config.maximumBankRadians) * bowlBankBlend;
    const bank = Math.max(-bankCeiling, Math.min(bankCeiling, turn * 2.8));
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

// Bowl bed width, not the catalogue's implied "8 m across" scale: half-width
// 2.25 m (4.5 m total) clears the >=6-marble-diameter (4.2 m) drain-safety
// floor PLAN.md requires ("The drain must be provably clearable") — the two
// numbers describe different things (visual scale vs. a pinch-safety
// minimum) and the safety one wins. Tapers smoothly to/from the normal bed
// width over `BOWL_WIDTH_TRANSITION_METERS` on each side so there's no seam.
const BOWL_HALF_WIDTH = 2.25;
const BOWL_WIDTH_TRANSITION_METERS = 25;

function trackHalfWidthAtDistance(
  config: TrackConfig,
  distance: number,
  bowlRange: readonly [number, number],
): number {
  const apronFraction = Math.max(0, Math.min(1, (36 - distance) / 24));
  const normalHalfWidth = config.trackHalfWidth + apronFraction * 0.9;

  const [bowlStart, bowlEnd] = bowlRange;
  const distanceOutsideBowl =
    distance < bowlStart ? bowlStart - distance : distance > bowlEnd ? distance - bowlEnd : 0;
  const bowlBlend = Math.max(0, 1 - distanceOutsideBowl / BOWL_WIDTH_TRANSITION_METERS);

  return normalHalfWidth + (BOWL_HALF_WIDTH - normalHalfWidth) * bowlBlend;
}

// Wave section (OBSTACLE-IDEAS.md module 8): the bed rolls in three sine
// humps over a 20 m stretch. Placed at distance 100 m — well past the pin
// field (ends ~67 m) and well before where Phase 3 plans the vortex bowl
// (late in the course, before the finish straight). Exactly 3 full periods
// over the stretch means the displacement is zero at both boundaries, so
// there's no seam/kink where the wave section meets flat bed on either side.
const WAVE_START_DISTANCE = 100;
const WAVE_LENGTH_METERS = 20;
const WAVE_AMPLITUDE = 0.3;
const WAVE_HUMP_COUNT = 3;

function waveDisplacement(distance: number): number {
  const offset = distance - WAVE_START_DISTANCE;
  if (offset < 0 || offset > WAVE_LENGTH_METERS) {
    return 0;
  }
  return WAVE_AMPLITUDE * Math.sin((2 * Math.PI * WAVE_HUMP_COUNT * offset) / WAVE_LENGTH_METERS);
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

  const bowlStartSampleIndex = sampleIndexAtSpanStart(config, BOWL_FIRST_SPAN_INDEX);
  const bowlEndSampleIndex = sampleIndexAtSpanStart(config, BOWL_LAST_SPAN_INDEX + 1) - 1;
  const bowlRange: readonly [number, number] = [
    path[bowlStartSampleIndex].distance,
    path[bowlEndSampleIndex].distance,
  ];

  const wavedPosition = (sample: TrackPathSample): Vector3 =>
    add(sample.position, scale(sample.up, waveDisplacement(sample.distance)));

  const surfaceVertices: number[] = [];
  const surfaceIndices: number[] = [];
  for (const sample of path) {
    const halfWidth = trackHalfWidthAtDistance(config, sample.distance, bowlRange);
    const basePosition = wavedPosition(sample);
    const right = add(basePosition, scale(sample.side, halfWidth));
    const left = add(basePosition, scale(sample.side, -halfWidth));
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
    const halfWidth = trackHalfWidthAtDistance(config, centerSample.distance, bowlRange);
    const rotation = quaternionFromBasis(centerSample.side, centerSample.up, centerSample.tangent);
    const railBasePosition = wavedPosition(centerSample);
    for (const direction of [-1, 1]) {
      boxes.push({
        kind: "side-rail",
        center: add(
          add(
            railBasePosition,
            scale(centerSample.side, direction * (halfWidth - config.railThickness / 2)),
          ),
          scale(centerSample.up, config.railHeight / 2),
        ),
        rotation,
        shape: {
          kind: "cuboid",
          halfExtents: [config.railThickness / 2, config.railHeight / 2, segmentLength / 2 + 0.35],
        },
        material: RAIL_MATERIAL,
      });
    }
  }

  const totalDistance = path.at(-1)?.distance ?? 0;

  // Cylinder pin field (OBSTACLE-IDEAS.md module 7): staggered rows of
  // round posts — replaces Phase 1's diamond box posts now that the shape
  // union makes a round collider available. Deflection now varies
  // continuously with impact parameter instead of splitting two ways.
  // Fractions 0.20–0.26 sit well past the start apron (which tapers out by
  // distance 36 of ~255 total), so the full `config.trackHalfWidth` is
  // available at every row.
  //
  // Radius is 0.25*sqrt(2) ≈ 0.354 m, not the catalogue's 0.4 m: matching
  // the diamond box footprint it replaces (rather than a larger circle)
  // keeps the lateral spacing below at its proven-safe value. Measured,
  // not assumed: a 0.4 m radius at the same 2.0 m spacing (this file's
  // history, since reverted) drove `last`-mode completion to 0/10 across
  // both roster sizes tested, for reasons unrelated to direct pin contact
  // — the failing marble in the traced case never got within 0.76 m of a
  // pin.
  //
  // `PIN_MATERIAL` restitution is 0.3, not 0.25: a fresh-review finding
  // caught that this radius/spacing at 0.25 measured 6/20 (30%) `last`-mode
  // completion for the 15-marble roster across a real 20-seed scan, well
  // below the 8/10 first claimed here — that number came from a truncated
  // 10-seed sample this file's own author misread. 0.3 restores completion
  // to 18/20 (5-marble) and 10/20 (15-marble), matching Phase 1's own
  // box-post baseline (20/20, 11/20) within normal seed-to-seed variance.
  // Still comfortably under the 0.35 restitution ceiling where the launch
  // bug returns. See specs/raceway-obstacles/EXECUTION.md Phase 2 for the
  // full investigation, including the correction.
  const addPinPost = (distance: number, lateralOffset: number): void => {
    const sample = interpolatePathSample(path, distance);
    const radius = 0.25 * Math.SQRT2;
    const halfHeight = 0.45;
    boxes.push({
      kind: "pin",
      center: add(
        add(sample.position, scale(sample.side, lateralOffset)),
        scale(sample.up, halfHeight),
      ),
      rotation: quaternionFromBasis(sample.side, sample.up, sample.tangent),
      shape: { kind: "cylinder", radius, halfHeight },
      material: PIN_MATERIAL,
    });
  };

  // 2.0 m lateral spacing (unchanged from Phase 1's box posts): the
  // cylinder's footprint (0.708 m, matched to the box it replaces — see
  // above) leaves a 1.293 m gap, already past the ≥1.2 m a 15-marble pack
  // needs to drain instead of clogging.
  //
  // Fixed distances (51.74–67.27 m), not fractions of `totalDistance`: the
  // bowl (Phase 3) made the course ~27% longer, and a fraction-based
  // placement would have silently dragged this obstacle ~15 m further down
  // the course into untested geometry every time `totalDistance` changed —
  // exactly what happened here, and what stalled every single race (traced
  // directly: distance ≈79 m, squarely inside the shifted field) before this
  // was caught. These are the original fractions (0.20–0.26) times the
  // pre-bowl course length (258.72 m), anchoring the field to the physical
  // location it was actually tuned and proven at.
  const evenRowOffsets: readonly number[] = [-4, -2, 0, 2, 4];
  const oddRowOffsets: readonly number[] = [-3, -1, 1, 3];
  const pinFieldRows: readonly [number, readonly number[]][] = [
    [51.74, evenRowOffsets],
    [56.92, oddRowOffsets],
    [62.09, evenRowOffsets],
    [67.27, oddRowOffsets],
  ];
  for (const [distance, lateralOffsets] of pinFieldRows) {
    for (const lateralOffset of lateralOffsets) {
      addPinPost(distance, lateralOffset);
    }
  }

  // Rumble strip (OBSTACLE-IDEAS.md module 4): full-width transverse bars,
  // placed as a short approach immediately before the pin field. Fixed
  // distances for the same reason as the pin field above.
  const addRumbleBar = (distance: number): void => {
    const sample = interpolatePathSample(path, distance);
    const halfWidth = trackHalfWidthAtDistance(config, sample.distance, bowlRange) - config.railThickness;
    const halfExtents: Vector3 = [halfWidth, 0.05, 0.12];
    boxes.push({
      kind: "rumble",
      center: add(sample.position, scale(sample.up, halfExtents[1])),
      rotation: quaternionFromBasis(sample.side, sample.up, sample.tangent),
      shape: { kind: "cuboid", halfExtents },
      material: RUMBLE_MATERIAL,
    });
  };

  const rumbleDistances: readonly number[] = [47.86, 49.16, 50.45];
  for (const distance of rumbleDistances) {
    addRumbleBar(distance);
  }

  const startSlots: Vector3[] = [];
  const startSample = interpolatePathSample(path, 1.5);
  const availableHalfWidth =
    trackHalfWidthAtDistance(config, startSample.distance, bowlRange) -
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
