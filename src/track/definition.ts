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

// The vortex bowl's bounding volume, consumed by `measureTrackProgress`
// (src/track/progress.ts) to give a defined, depth-advancing progress
// reading to any position inside the funnel — see this file's "Vortex bowl"
// section for how `center`/`radius`/`rimY`/`drainY` are derived, and
// PLAN.md -> "Progress while inside the bowl" for why depth, not a flat
// value, is what's returned.
export interface TrackBowl {
  readonly center: Vector3;
  readonly radius: number;
  readonly rimY: number;
  readonly drainY: number;
  readonly entryDistance: number;
  readonly bridgeLength: number;
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
  readonly bowl: TrackBowl;
  readonly bowlExitFraction: number;
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

function headingXZ(from: Vector3, to: Vector3): readonly [number, number] {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const planarLength = Math.hypot(dx, dz);
  return [dx / planarLength, dz / planarLength];
}

// Vortex bowl (OBSTACLE-IDEAS.md module 9): a real, open funnel — a revolved
// cone frustum appended straight into the ribbon's own `TrackSurface`
// trimesh, not a second mesh/collider source, and not routed through the
// centreline as tight-radius ribbon geometry (PLAN.md -> "The bowl is a real
// funnel, bridged out of the centreline" -- supersedes the parked
// spiral-centreline attempt, commit bb66cf9, which could not reliably
// complete a race once narrowed to a safe, meaningfully-banked width; that
// was a structural mismatch between the shape being built and the shape
// being asked for, not a tuning problem).
//
// A marble entering with tangential velocity naturally spirals inward on a
// frictional cone before dropping through the centre hole -- the same
// physics a coin funnel relies on -- so no explicit spiral groove is needed;
// the cone's own geometry produces the "spin around, then slip through"
// behaviour.
// The funnel is ONE continuous surface from its outer top down to the drain,
// not discrete wall/lip/cone stages. That three-stage construction was tried
// first and failed: two rings meeting at a sharp interior angle (vertical
// wall into a sloped lip) forms a physical V-notch a marble can sit
// stationary in, exactly like a ball resting in the corner where a wall
// meets a floor -- found empirically, not assumed (traced directly: all 5
// marbles came to rest exactly at the wall/lip seam, unmoving for 60+s). A
// single smoothstep-based radius profile (`smootherstep`, cubic ease) has a
// continuous tangent everywhere: near-flat-in-radius (wall-like) at the very
// top, near-flat again at the very bottom, steepest in the middle -- the
// same "gentle near the rim, steep near the drain" shape as a real funnel,
// with no ring anywhere where the surface's own angle jumps.
const BOWL_RIM_RADIUS = 7; // radius at the funnel's very top, where the approach ribbon lands
const BOWL_DRAIN_RADIUS = 1.05; // ~3 marble diameters -- see "Drain sizing" below
const BOWL_DROP = 11.5; // total vertical span, top of funnel -> drain
const BOWL_RADIAL_SEGMENTS = 192; // facet chord at the rim: 2*7*sin(pi/192) =~ 0.229 m, well under marbleRadius (0.35 m) itself, not just the diameter
const BOWL_RING_SEGMENTS = 20; // vertical rings sampling the smoothstep profile

// Approach from wp10 to the rim, continuing wp10's own heading exactly (zero
// net turn), so -- unlike the parked spiral -- this needs no buffer span to
// avoid a curvature discontinuity: there isn't one.
const BOWL_APPROACH_LENGTH = 10;
const BOWL_APPROACH_GRADE = 0.2; // clears the 0.15 floor (PLAN.md -> "No section of track may fall below a 0.15 grade") with margin

// The approach ribbon meets the rim *tangentially* -- bowlEntryPoint is the
// one point on that straight strip exactly on the BOWL_RIM_RADIUS circle,
// but every other point across the ribbon's width is strictly farther out
// (the tangent-line property: at BOWL_SAFE_HALF_WIDTH off centre, distance
// from the bowl centre is sqrt(7^2 + 3.3^2) =~ 7.74 m, a 0.74 m excess no
// amount of narrowing eliminates). BOWL_RIM_RADIUS is sized generously
// enough that this excess lands well inside the funnel's own near-flat cap
// near the top of the smoothstep profile, rather than needing a separate
// wall (found empirically -- see the note above on why a separate wall
// creates its own notch problem).
const BOWL_APPROACH_TAPER_METERS = 15;
const BOWL_SAFE_HALF_WIDTH = 3.3;

// Widens the exit-chute ribbon right under the drain, tapering back to
// normal width over BOWL_CATCH_TAPER_METERS. See trackHalfWidthAtDistance.
const BOWL_CATCH_TAPER_METERS = 20;
const BOWL_CATCH_HALF_WIDTH = 6.5;
// Radius of the circular catch disc under the drain (see its construction
// site in createTrackDefinition) -- comfortably beyond BOWL_RIM_RADIUS so a
// marble exiting in any direction, not just along the approach heading,
// still lands on solid geometry. Tilted, not flat, at BOWL_CATCH_DISC_GRADE
// along the approach heading -- see the construction site for why.
const BOWL_CATCH_DISC_RADIUS = 10;
const BOWL_CATCH_DISC_GRADE = 0.3;

// The virtual bridge span's distance cost (PLAN.md -> "Progress while inside
// the bowl"): not the straight-line distance between the entry and exit
// waypoints, but an approximation of what a marble actually travels --
// several shrinking orbits between the rim (BOWL_RIM_RADIUS) and drain
// (BOWL_DRAIN_RADIUS) plus the BOWL_DROP descent. Sized so the bowl reads as
// the course's longest, slowest module without dominating total race
// duration.
const BOWL_BRIDGE_DISTANCE_METERS = 45;
const BOWL_EXIT_NUDGE_METERS = 0.6; // small forward offset so the exit waypoint's heading isn't degenerate directly under the drain
// Vertical gap between the drain hole and the ribbon that catches a falling
// marble (found empirically, not assumed): an earlier version placed the
// exit waypoint at the *same* elevation as the drain, so the catch ribbon
// was coplanar with the hole -- a single degenerate point of contact, not a
// surface a falling marble could actually land on. Every marble free-fell
// forever (traced directly: Y still descending past -14,000 at the 120 s
// cap). This drop puts real, unambiguous distance between the hole and the
// catch surface so gravity has time to carry the marble onto it.
//
// Kept small deliberately, not generous: a 5 m version of this gap let
// marbles reach ~10 m/s of pure free-fall before ever touching the catch
// ribbon, on top of whatever speed the funnel itself had already built up --
// fast and steep enough that they tunnelled straight through the thin
// catch trimesh without registering a collision at all (found empirically:
// widening the catch ribbon's width had zero effect on the failure, and a
// bit-identical trajectory before and after that change is itself the
// evidence -- the marble was never touching the ribbon's plane long enough
// to be affected by its width). A short gap still resolves the coplanar
// degenerate case above without building dangerous velocity first.
const BOWL_EXIT_CATCH_DROP_METERS = 1.5;

// Continues past the drain to the finish line. Both segments hold a 0.2
// grade -- not the 0.067 the parked WIP's finish straight used, which sat
// below the 0.1/0.12 friction coefficients and visibly decelerated marbles
// into the line (PLAN.md -> "No section of track may fall below a 0.15
// grade").
const FINISH_STRETCH_SEGMENT_LENGTH = 15;
const FINISH_STRETCH_SEGMENT_GRADE = 0.2;
const FINISH_STRETCH_SEGMENT_COUNT = 2;

const bowlApproachOrigin = PRE_BOWL_WAYPOINTS.at(-1) as Vector3;
const bowlApproachHeading = headingXZ(PRE_BOWL_WAYPOINTS.at(-2) as Vector3, bowlApproachOrigin);

const bowlCenter: Vector3 = [
  bowlApproachOrigin[0] + bowlApproachHeading[0] * BOWL_APPROACH_LENGTH,
  bowlApproachOrigin[1] - BOWL_APPROACH_LENGTH * BOWL_APPROACH_GRADE,
  bowlApproachOrigin[2] + bowlApproachHeading[1] * BOWL_APPROACH_LENGTH,
];
const bowlRimY = bowlCenter[1];
const bowlDrainY = bowlRimY - BOWL_DROP;

// Where the ribbon ends -- on the rim, on the near side facing the incoming
// approach.
const bowlEntryPoint: Vector3 = [
  bowlCenter[0] - bowlApproachHeading[0] * BOWL_RIM_RADIUS,
  bowlRimY,
  bowlCenter[2] - bowlApproachHeading[1] * BOWL_RIM_RADIUS,
];
// Where the ribbon resumes -- genuinely below the drain, not coplanar with
// it (see BOWL_EXIT_CATCH_DROP_METERS).
const bowlExitPoint: Vector3 = [
  bowlCenter[0] + bowlApproachHeading[0] * BOWL_EXIT_NUDGE_METERS,
  bowlDrainY - BOWL_EXIT_CATCH_DROP_METERS,
  bowlCenter[2] + bowlApproachHeading[1] * BOWL_EXIT_NUDGE_METERS,
];

const finishStretchWaypoints: Vector3[] = [];
{
  let cursor = bowlExitPoint;
  for (let segment = 0; segment < FINISH_STRETCH_SEGMENT_COUNT; segment += 1) {
    cursor = [
      cursor[0] + bowlApproachHeading[0] * FINISH_STRETCH_SEGMENT_LENGTH,
      cursor[1] - FINISH_STRETCH_SEGMENT_LENGTH * FINISH_STRETCH_SEGMENT_GRADE,
      cursor[2] + bowlApproachHeading[1] * FINISH_STRETCH_SEGMENT_LENGTH,
    ];
    finishStretchWaypoints.push(cursor);
  }
}

// Found empirically, not assumed: `createPath`'s generic before/after
// indexing (span +-1/+-2 into COURSE_WAYPOINTS) reaches straight across the
// single-sample bridge span for the spans immediately adjacent to it. Span
// 10 (wp10 -> entry)'s "after" reference becomes `bowlExitPoint` -- a point
// ~35 m down on the far side of the funnel -- and span 12 (exit -> finish1)'s
// "before" reference becomes `bowlEntryPoint`, equally displaced the other
// way. Both distort that span's Catmull-Rom curve badly (traced directly:
// marbles arriving at the approach span stall and settle at rest near wp10's
// own height, never reaching the rim). Both approach and exit-chute segments
// are meant to be straight lines (constant heading and grade), so the fix is
// a synthetic reference that continues each one collinearly -- reflecting
// the segment's own other endpoint across the point adjacent to the bridge,
// the same technique (a synthetic "before"/"after" drawn from the local
// family, not the far side of the bridge) the parked spiral used for this
// exact class of bug, generalized to both sides of the gap.
const bowlApproachVirtualAfter: Vector3 = [
  2 * bowlEntryPoint[0] - bowlApproachOrigin[0],
  2 * bowlEntryPoint[1] - bowlApproachOrigin[1],
  2 * bowlEntryPoint[2] - bowlApproachOrigin[2],
];
const bowlExitVirtualBefore: Vector3 = [
  2 * bowlExitPoint[0] - finishStretchWaypoints[0][0],
  2 * bowlExitPoint[1] - finishStretchWaypoints[0][1],
  2 * bowlExitPoint[2] - finishStretchWaypoints[0][2],
];

const COURSE_WAYPOINTS: readonly Vector3[] = Object.freeze([
  ...PRE_BOWL_WAYPOINTS,
  bowlEntryPoint,
  bowlExitPoint,
  ...finishStretchWaypoints,
]);

// The span connecting the entry waypoint to the exit waypoint -- the
// "virtual bridge span" with no ribbon geometry and no interpolated path
// samples between its two endpoints (see `samplesForSpan` below).
const BRIDGE_SPAN_INDEX = PRE_BOWL_WAYPOINTS.length;

// Every span samples `config.samplesPerSpan` points as usual, except the
// bridge span, which samples exactly 1 -- the entry waypoint itself at
// t=0 (the Catmull-Rom formula reduces to `start` exactly at t=0
// regardless of `before`/`after`, so the bridge needs no special-cased
// control points the way the parked spiral's first span did). The next
// span's own t=0 sample is the exit waypoint, so the two land as adjacent
// entries in the flattened `path` array with nothing interpolated between
// them.
function samplesForSpan(config: TrackConfig, span: number): number {
  return span === BRIDGE_SPAN_INDEX ? 1 : config.samplesPerSpan;
}

// Cumulative sample count reached by the start of the given span -- the
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
    // Spans immediately adjacent to the bridge get a synthetic before/after
    // reference instead of reaching across the gap -- see
    // `bowlApproachVirtualAfter`/`bowlExitVirtualBefore` above.
    const before =
      span === BRIDGE_SPAN_INDEX + 1
        ? bowlExitVirtualBefore
        : COURSE_WAYPOINTS[Math.max(0, span - 1)];
    const start = COURSE_WAYPOINTS[span];
    const end = COURSE_WAYPOINTS[span + 1];
    const after =
      span === BRIDGE_SPAN_INDEX - 1
        ? bowlApproachVirtualAfter
        : COURSE_WAYPOINTS[Math.min(COURSE_WAYPOINTS.length - 1, span + 2)];
    const spanSampleCount = samplesForSpan(config, span);
    for (let step = 0; step < spanSampleCount; step += 1) {
      positions.push(catmullRom(before, start, end, after, step / spanSampleCount));
    }
  }
  positions.push(COURSE_WAYPOINTS.at(-1) as Vector3);

  // The sample immediately after the bridge span's single (entry) sample is
  // the exit waypoint -- its distance-from-previous is overridden below to
  // the bridge's real distance cost rather than the short straight-line gap
  // between the two points.
  const bridgeExitSampleIndex = sampleIndexAtSpanStart(config, BRIDGE_SPAN_INDEX) + 1;

  let cumulativeDistance = 0;
  return positions.map((position, index) => {
    if (index > 0) {
      cumulativeDistance +=
        index === bridgeExitSampleIndex
          ? BOWL_BRIDGE_DISTANCE_METERS
          : length(subtract(position, positions[index - 1]));
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

function trackHalfWidthAtDistance(
  config: TrackConfig,
  distance: number,
  bowlEntryDistance: number,
  bowlExitDistance: number,
): number {
  const apronFraction = Math.max(0, Math.min(1, (36 - distance) / 24));
  const normalHalfWidth = config.trackHalfWidth + apronFraction * 0.9;

  const distanceBeforeBowl = bowlEntryDistance - distance;
  if (distanceBeforeBowl >= 0 && distanceBeforeBowl <= BOWL_APPROACH_TAPER_METERS) {
    const taperFraction = 1 - distanceBeforeBowl / BOWL_APPROACH_TAPER_METERS;
    return normalHalfWidth + (BOWL_SAFE_HALF_WIDTH - normalHalfWidth) * taperFraction;
  }

  // Widen the catch zone right after the drain, tapering back to normal.
  // Found empirically, not assumed: BOWL_RIM_RADIUS (7 m) is far larger than
  // the original spiral's tight radius, so a marble reaching the drain
  // carries real residual tangential velocity, and a normal-width exit
  // ribbon right underneath the hole can miss it entirely -- traced
  // directly, marbles sailing past the exit ribbon into ballistic free-fall
  // (X drift to 200+, progress pinned at the course's final sample).
  const distanceAfterExit = distance - bowlExitDistance;
  if (distanceAfterExit >= 0 && distanceAfterExit <= BOWL_CATCH_TAPER_METERS) {
    const catchFraction = 1 - distanceAfterExit / BOWL_CATCH_TAPER_METERS;
    return normalHalfWidth + (BOWL_CATCH_HALF_WIDTH - normalHalfWidth) * catchFraction;
  }

  return normalHalfWidth;
}

// Wave section (OBSTACLE-IDEAS.md module 8): the bed rolls in three sine
// humps over a 20 m stretch. Placed at distance 100 m -- well past the pin
// field (ends ~67 m) and well before the vortex bowl. Exactly 3 full periods
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

  // The sample index of the entry waypoint (bridge span's only sample); the
  // exit waypoint is the very next sample. Both geometry loops below skip
  // the pair spanning these two indices -- no ribbon quad, no rail box --
  // since that gap is where the funnel sits instead.
  const bridgeEntrySampleIndex = sampleIndexAtSpanStart(config, BRIDGE_SPAN_INDEX);
  const bowlEntryDistance = path[bridgeEntrySampleIndex].distance;
  const bowlExitDistance = path[bridgeEntrySampleIndex + 1].distance;

  const wavedPosition = (sample: TrackPathSample): Vector3 =>
    add(sample.position, scale(sample.up, waveDisplacement(sample.distance)));

  const surfaceVertices: number[] = [];
  const surfaceIndices: number[] = [];
  for (const sample of path) {
    const halfWidth = trackHalfWidthAtDistance(config, sample.distance, bowlEntryDistance, bowlExitDistance);
    const basePosition = wavedPosition(sample);
    const right = add(basePosition, scale(sample.side, halfWidth));
    const left = add(basePosition, scale(sample.side, -halfWidth));
    surfaceVertices.push(...right, ...left);
  }
  for (let index = 0; index < path.length - 1; index += 1) {
    if (index === bridgeEntrySampleIndex) {
      continue;
    }
    const right = index * 2;
    const left = right + 1;
    const nextRight = right + 2;
    const nextLeft = right + 3;
    surfaceIndices.push(right, left, nextRight, left, nextLeft, nextRight);
  }

  for (let index = 0; index < path.length - 1; index += 1) {
    if (index === bridgeEntrySampleIndex) {
      continue;
    }
    const start = path[index];
    const end = path[index + 1];
    const centerSample = interpolatePathSample(path, (start.distance + end.distance) / 2);
    const segmentLength = end.distance - start.distance;
    const halfWidth = trackHalfWidthAtDistance(config, centerSample.distance, bowlEntryDistance, bowlExitDistance);
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

  // Vortex bowl funnel: a revolved surface appended directly to the ribbon's
  // own surface trimesh (PLAN.md -> "Funnel geometry: revolved triangles in
  // the existing trimesh, not panels"), one continuous smoothstep radius
  // profile from BOWL_RIM_RADIUS down to BOWL_DRAIN_RADIUS -- see the note
  // at BOWL_RIM_RADIUS's declaration for why this replaced a discrete
  // wall/lip/cone construction.
  const smootherstep = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
  const funnelRings: Array<{ readonly radius: number; readonly y: number }> = [];
  for (let ring = 0; ring <= BOWL_RING_SEGMENTS; ring += 1) {
    const t = ring / BOWL_RING_SEGMENTS;
    const eased = smootherstep(t);
    funnelRings.push({
      radius: BOWL_RIM_RADIUS - (BOWL_RIM_RADIUS - BOWL_DRAIN_RADIUS) * eased,
      y: bowlRimY - BOWL_DROP * t,
    });
  }

  const funnelVertexOffset = surfaceVertices.length / 3;
  for (const { radius, y } of funnelRings) {
    for (let segment = 0; segment < BOWL_RADIAL_SEGMENTS; segment += 1) {
      const angle = (segment / BOWL_RADIAL_SEGMENTS) * 2 * Math.PI;
      surfaceVertices.push(
        bowlCenter[0] + radius * Math.cos(angle),
        y,
        bowlCenter[2] + radius * Math.sin(angle),
      );
    }
  }
  for (let ring = 0; ring < funnelRings.length - 1; ring += 1) {
    for (let segment = 0; segment < BOWL_RADIAL_SEGMENTS; segment += 1) {
      const nextSegment = (segment + 1) % BOWL_RADIAL_SEGMENTS;
      const a = funnelVertexOffset + ring * BOWL_RADIAL_SEGMENTS + segment;
      const b = funnelVertexOffset + ring * BOWL_RADIAL_SEGMENTS + nextSegment;
      const c = funnelVertexOffset + (ring + 1) * BOWL_RADIAL_SEGMENTS + segment;
      const d = funnelVertexOffset + (ring + 1) * BOWL_RADIAL_SEGMENTS + nextSegment;
      surfaceIndices.push(a, b, c, b, d, c);
    }
  }

  // Circular catch disc under the drain, not just a widened directional
  // ribbon. Found empirically, not assumed: after an unpredictable number of
  // spiral orbits, a marble's exit velocity points in an essentially random
  // direction -- widening the exit ribbon (a strip fixed to one direction,
  // the approach heading) had zero measurable effect on the failure, because
  // the marble was exiting *sideways* through the strip's edge, not running
  // off its far end. The funnel itself is radially symmetric; its catch
  // surface needs to be too, so it covers every exit direction.
  //
  // The disc is *tilted*, not flat, along bowlApproachHeading -- a flat disc
  // repeats the exact defect the flat lip had earlier: zero grade means
  // nothing guides a marble toward the continuing ribbon, and it just
  // wanders on residual momentum until it happens to cross the disc's own
  // edge into open space again (traced directly: several marbles came to
  // rest at y=-31.2, the disc's own height, for multiple seconds before
  // resuming freefall). Every point on a tilted disc has a real downhill
  // direction toward increasing heading-projected distance, which is also
  // the direction the finish stretch continues in.
  const catchDiscCenter: Vector3 = [bowlExitPoint[0], bowlExitPoint[1], bowlExitPoint[2]];
  const catchDiscVertexOffset = surfaceVertices.length / 3;
  surfaceVertices.push(...catchDiscCenter);
  for (let segment = 0; segment < BOWL_RADIAL_SEGMENTS; segment += 1) {
    const angle = (segment / BOWL_RADIAL_SEGMENTS) * 2 * Math.PI;
    const offsetX = BOWL_CATCH_DISC_RADIUS * Math.cos(angle);
    const offsetZ = BOWL_CATCH_DISC_RADIUS * Math.sin(angle);
    const headingProjection = offsetX * bowlApproachHeading[0] + offsetZ * bowlApproachHeading[1];
    surfaceVertices.push(
      catchDiscCenter[0] + offsetX,
      catchDiscCenter[1] - BOWL_CATCH_DISC_GRADE * headingProjection,
      catchDiscCenter[2] + offsetZ,
    );
  }
  for (let segment = 0; segment < BOWL_RADIAL_SEGMENTS; segment += 1) {
    const nextSegment = (segment + 1) % BOWL_RADIAL_SEGMENTS;
    surfaceIndices.push(
      catchDiscVertexOffset,
      catchDiscVertexOffset + 1 + segment,
      catchDiscVertexOffset + 1 + nextSegment,
    );
  }

  const bowl: TrackBowl = Object.freeze({
    center: bowlCenter,
    radius: BOWL_RIM_RADIUS,
    rimY: bowlRimY,
    drainY: bowlDrainY,
    entryDistance: bowlEntryDistance,
    bridgeLength: bowlExitDistance - bowlEntryDistance,
  });

  const totalDistance = path.at(-1)?.distance ?? 0;
  const bowlExitFraction = totalDistance === 0 ? 0 : bowlExitDistance / totalDistance;

  // Cylinder pin field (OBSTACLE-IDEAS.md module 7): staggered rows of
  // round posts -- replaces Phase 1's diamond box posts now that the shape
  // union makes a round collider available. Deflection now varies
  // continuously with impact parameter instead of splitting two ways.
  // Fractions 0.20-0.26 sit well past the start apron (which tapers out by
  // distance 36 of ~255 total), so the full `config.trackHalfWidth` is
  // available at every row.
  //
  // Radius is 0.25*sqrt(2) =~ 0.354 m, not the catalogue's 0.4 m: matching
  // the diamond box footprint it replaces (rather than a larger circle)
  // keeps the lateral spacing below at its proven-safe value. Measured,
  // not assumed: a 0.4 m radius at the same 2.0 m spacing (this file's
  // history, since reverted) drove `last`-mode completion to 0/10 across
  // both roster sizes tested, for reasons unrelated to direct pin contact
  // -- the failing marble in the traced case never got within 0.76 m of a
  // pin.
  //
  // `PIN_MATERIAL` restitution is 0.3, not 0.25: a fresh-review finding
  // caught that this radius/spacing at 0.25 measured 6/20 (30%) `last`-mode
  // completion for the 15-marble roster across a real 20-seed scan, well
  // below the 8/10 first claimed here -- that number came from a truncated
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
  // cylinder's footprint (0.708 m, matched to the box it replaces -- see
  // above) leaves a 1.293 m gap, already past the >=1.2 m a 15-marble pack
  // needs to drain instead of clogging.
  //
  // Fixed distances (51.74-67.27 m), not fractions of `totalDistance`: a
  // fraction-based placement would silently drag this obstacle to a
  // different physical location every time `totalDistance` changes (the
  // funnel redesign shortened the course again) -- these are the original
  // fractions (0.20-0.26) times the pre-bowl course length (258.72 m),
  // anchoring the field to the physical location it was actually tuned and
  // proven at.
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
    const halfWidth =
      trackHalfWidthAtDistance(config, sample.distance, bowlEntryDistance, bowlExitDistance) - config.railThickness;
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
    trackHalfWidthAtDistance(config, startSample.distance, bowlEntryDistance, bowlExitDistance) -
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
    bowl,
    bowlExitFraction,
  });
}
