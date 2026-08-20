import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { SCALE } from "../../race/scale";
import type { Quaternion, Vector3 } from "../../race/types";
import { buildChannel, FLOOR_THICKNESS } from "../geometry/channel";
import type {
  ColliderSpec,
  ModuleDefinition,
  NumberParamField,
  ParamSchema,
  Spec,
  VisualSpec,
} from "../types";

// The Galton-board / Plinko field -- OBSTACLE-IDEAS.md -> "2. Diamond pin
// field". Staggered rows of posts, each turned 45 degrees about `up` so it
// presents an edge (not a flat face) to an oncoming marble, splitting the
// field left and right row by row. `role: "scatter"`.
//
// OBSTACLE-IDEAS' own numbers target the deleted 11 m bed (trackHalfWidth
// 5.5 m, marbleRadius 0.35 m); this Module converts by *ratio* against toy
// scale (SCALE.marbleRadius 0.016 m), per PLAN.md -> "Converting
// OBSTACLE-IDEAS dimensions", rather than dividing its raw meters by the
// ~22:1 factor -- the ratios are what its clog/clearance warnings actually
// describe.

export interface PinFieldParams {
  readonly rowCount: number;
  /** Center-to-center lateral pitch between posts in one row, meters. */
  readonly postSpacing: number;
  readonly postHeight: number;
  /** Full width of a post's square cross-section (pre-rotation), meters. */
  readonly postWidth: number;
  /** Longitudinal pitch between rows, meters. */
  readonly rowPitch: number;
}

// OBSTACLE-IDEAS' own build note: post half-extents [0.25, 0.45, 0.25] at
// its 0.35 m marbleRadius, i.e. postWidth/postHeight (full) of
// 0.5 m / 0.9 m against a 0.7 m marble diameter -- ratios ~0.71 and ~1.29
// diameters. Applied to SCALE.marbleRadius's 0.032 m diameter:
const MARBLE_DIAMETER = SCALE.marbleRadius * 2;
const DEFAULT_POST_WIDTH = MARBLE_DIAMETER * 0.71;
const DEFAULT_POST_HEIGHT = MARBLE_DIAMETER * 1.29;

// "Keep the gap between posts >= 1.2 m so a 15-marble pack drains instead of
// clogging" -- 1.2 m against OBSTACLE-IDEAS' own 0.7 m marble diameter, i.e.
// this ratio, applied here instead of the raw 1.2 m (PLAN.md -> "Prefer the
// ratios"). `postSpacing`'s schema minimum is set from this against the
// schema's own `postWidth` maximum, so no legal combination of the two
// sliders can violate it -- not just the defaults.
const MIN_GAP_DIAMETERS = 1.2 / 0.7;
const MIN_POST_GAP = MIN_GAP_DIAMETERS * MARBLE_DIAMETER;
const POST_WIDTH_MAX = MARBLE_DIAMETER * 1.1;
// A post's real lateral reach, once turned 45 degrees, is its *diagonal*
// (postWidth * sqrt(2)), not postWidth -- a square's corner sticks out
// further than its own flat side. Sizing the gap off postWidth alone
// under-counted that reach and packed two diamonds closer than the gap
// ratio actually allows, wedging a marble in the resulting throat (measured
// directly: seeds 4 and 5 at this Module's prior spacing, before this fix).
const POST_DIAGONAL_MAX = POST_WIDTH_MAX * Math.SQRT2;
const POST_SPACING_MIN = POST_DIAGONAL_MAX + MIN_POST_GAP;

const DEFAULT_PARAMS: PinFieldParams = Object.freeze({
  rowCount: 5,
  postSpacing: POST_SPACING_MIN * 1.3,
  postHeight: DEFAULT_POST_HEIGHT,
  postWidth: DEFAULT_POST_WIDTH,
  rowPitch: MARBLE_DIAMETER * 5,
});

const PARAM_SCHEMA: ParamSchema = Object.freeze({
  fields: [
    {
      kind: "number",
      key: "rowCount",
      label: "Row count",
      min: 3,
      max: 10,
      step: 1,
      default: DEFAULT_PARAMS.rowCount,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "postSpacing",
      label: "Post spacing (m)",
      min: POST_SPACING_MIN,
      max: POST_SPACING_MIN * 2.5,
      step: 0.002,
      default: DEFAULT_PARAMS.postSpacing,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "postHeight",
      label: "Post height (m)",
      min: MARBLE_DIAMETER * 0.8,
      max: MARBLE_DIAMETER * 2,
      step: 0.002,
      default: DEFAULT_PARAMS.postHeight,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "postWidth",
      label: "Post width (m)",
      min: MARBLE_DIAMETER * 0.5,
      max: POST_WIDTH_MAX,
      step: 0.001,
      default: DEFAULT_PARAMS.postWidth,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "rowPitch",
      label: "Row pitch (m)",
      min: MARBLE_DIAMETER * 2,
      max: MARBLE_DIAMETER * 6,
      step: 0.002,
      default: DEFAULT_PARAMS.rowPitch,
    } satisfies NumberParamField,
  ],
});

// Descending grade, internal rather than exposed: this Module's character
// is the posts, not its slope. Steeper than a first guess: even with a
// post never sitting exactly on the spawn centerline (see
// `postLateralOffsets` below) and a long enough `LEAD_IN`, a near-perpendicular
// hit on a diamond post still bleeds a marble's speed toward zero for a
// frame or two -- this grade keeps a large enough margin above
// `MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND` that a run through 5 rows of
// posts never dips under it (see pinField.test.ts's zero-stall sweep).
const FLOOR_GRADE = 0.5;
// Long enough that a marble spawned at rest (the Feeder's own convention --
// see chute/index.ts) has picked up real speed before reaching the first
// row: rumbleStrip's own LEAD_IN hit this exact failure first (see its
// comment) -- a marble arriving at an obstacle with near-zero speed sees a
// genuine wall, not a deflection. Measured directly: at `MARBLE_DIAMETER * 3`
// the first row parked every marble near-motionless for dozens of frames.
const LEAD_IN = MARBLE_DIAMETER * 18;
const LEAD_OUT = MARBLE_DIAMETER * 3;

// Friction is OBSTACLE-IDEAS' own build note for this Module (dimensionless,
// no scale conversion applies). Restitution is tuned well above its 0.18 --
// bouncier posts keep more of a marble's speed through a near-head-on hit,
// the same margin `FLOOR_GRADE`'s comment above explains.
const POST_MATERIAL = { restitution: 0.5, friction: 0.05 };
const POST_VISUAL_MATERIAL = { color: "#f5a623", metalness: 0.05, roughness: 0.4 };

function toVector(v: ThreeVector3): Vector3 {
  return [v.x, v.y, v.z];
}

function toQuaternion(q: ThreeQuaternion): Quaternion {
  return [q.x, q.y, q.z, q.w];
}

/** Evenly spaced lateral offsets spanning `channelWidth`, symmetric about
 * the centerline, alternating rows shifted by half a pitch for the classic
 * Galton-board stagger. `usableWidth` leaves a margin so a post's own
 * half-extent (post-rotation, its footprint reaches out to `postSpacing`'s
 * own scale, not just `postWidth/2`) doesn't collide with the rails. */
function postLateralOffsets(rowIsOffset: boolean, postSpacing: number, channelWidth: number): number[] {
  const usableWidth = Math.max(postSpacing, channelWidth - postSpacing);
  const count = Math.max(1, Math.floor(usableWidth / postSpacing) + 1);
  const span = (count - 1) * postSpacing;
  // The quarter-spacing term keeps X=0 -- the channel's own centerline,
  // which the Validator's spawn spread (validateModule.ts's spawnMarbles)
  // can place a marble arbitrarily close to -- from ever landing exactly on
  // a post center in ANY row, offset or not. A dead-center hit on a
  // diamond's own corner is the one collision angle with no natural
  // left/right bias to deflect off of, and measured directly it parked a
  // marble balanced there, near motionless, for dozens of frames before
  // numerical noise finally tipped it -- a single such frame anywhere in a
  // run is enough to fail minDisplacementPerSecond even though the marble
  // was never truly stalled.
  const start = -span / 2 + postSpacing / 4 + (rowIsOffset ? postSpacing / 2 : 0);
  return Array.from({ length: count }, (_, index) => start + index * postSpacing);
}

function buildSpec(params: PinFieldParams): Spec {
  const { rowCount, postSpacing, postHeight, postWidth, rowPitch } = params;
  const totalRun = LEAD_IN + Math.max(0, rowCount - 1) * rowPitch + LEAD_OUT;
  const drop = totalRun * FLOOR_GRADE;
  const channelMaterial = { restitution: SCALE.defaultRestitution, friction: SCALE.defaultFriction };

  const channel = buildChannel(
    [{ start: [0, 0, 0], end: [0, -drop, totalRun], width: SCALE.channelWidth }],
    channelMaterial,
    "",
  );
  const colliders: ColliderSpec[] = [...channel.colliders];
  const visuals: VisualSpec[] = [...channel.visuals];
  const { entry, exit, bounds } = channel;

  // Recomputed rather than exposed by `buildChannel`: posts need the same
  // per-segment pitch/floorCenter frame the floor and rails were placed
  // with, and a single-segment channel's contract only returns the whole
  // chain's entry/exit, not its own intermediate frame.
  const startVector = new ThreeVector3(0, 0, 0);
  const endVector = new ThreeVector3(0, -drop, totalRun);
  const pitch = new ThreeQuaternion().setFromUnitVectors(
    new ThreeVector3(0, 0, 1),
    endVector.clone().sub(startVector).normalize(),
  );
  const floorCenter = startVector.clone().add(endVector).multiplyScalar(0.5);
  const postSpin = new ThreeQuaternion().setFromAxisAngle(new ThreeVector3(0, 1, 0), Math.PI / 4);
  const postRotation = pitch.clone().multiply(postSpin);
  const postHalfExtents: Vector3 = [postWidth / 2, postHeight / 2, postWidth / 2];
  const postShape = { kind: "cuboid" as const, halfExtents: postHalfExtents };

  const min: [number, number, number] = [...bounds.min];
  const max: [number, number, number] = [...bounds.max];

  for (let row = 0; row < rowCount; row += 1) {
    const rowZ = LEAD_IN + row * rowPitch;
    const offsets = postLateralOffsets(row % 2 === 1, postSpacing, SCALE.channelWidth);
    offsets.forEach((lateralOffset, col) => {
      const localPoint = new ThreeVector3(
        lateralOffset,
        FLOOR_THICKNESS / 2 + postHeight / 2,
        rowZ - totalRun / 2,
      );
      const position = floorCenter.clone().add(localPoint.clone().applyQuaternion(pitch));
      const id = `post-${row}-${col}`;

      const postCollider: ColliderSpec = {
        id,
        shape: postShape,
        position: toVector(position),
        rotation: toQuaternion(postRotation),
        material: POST_MATERIAL,
      };
      colliders.push(postCollider);
      visuals.push({
        id,
        shape: postShape,
        material: POST_VISUAL_MATERIAL,
        position: toVector(position),
        rotation: toQuaternion(postRotation),
      });

      // A post's footprint after the 45-degree spin reaches diagonal
      // (halfExtent * sqrt(2)) from its center in every horizontal
      // direction -- widen the accumulated bounds by that reach rather
      // than the pre-rotation half-extent.
      const diagonalReach = (postWidth / 2) * Math.SQRT2;
      const postTop = position.y + postHeight / 2 + FLOOR_THICKNESS / 2;
      const postBottom = position.y - postHeight / 2 - FLOOR_THICKNESS / 2;
      min[0] = Math.min(min[0], position.x - diagonalReach);
      min[1] = Math.min(min[1], postBottom);
      min[2] = Math.min(min[2], position.z - diagonalReach);
      max[0] = Math.max(max[0], position.x + diagonalReach);
      max[1] = Math.max(max[1], postTop);
      max[2] = Math.max(max[2], position.z + diagonalReach);
    });
  }

  return {
    colliders,
    visuals,
    footprint: {
      // No Board exists yet to occupy Cells on -- see SCALE.cellPitch's
      // comment. Real occupancy is Spec 3's job.
      cells: [],
      entry,
      exit,
      bounds: { min, max },
    },
  };
}

export const pinField: ModuleDefinition<PinFieldParams> = {
  id: "pin-field",
  role: "scatter",
  meta: { name: "Pin field", tags: ["scatter", "plinko"], params: PARAM_SCHEMA },
  buildSpec,
  // Static: nothing on the pin field moves after it's built.
  step: () => [],
};
