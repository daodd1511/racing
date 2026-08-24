import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { SCALE } from "../../race/scale";
import type { Quaternion, Vector3 } from "../../race/types";
import { buildChannel, FLOOR_THICKNESS } from "../geometry/channel";
import type {
  ColliderSpec,
  ModuleDefinition,
  NumberParamField,
  ParamSchema,
  Shape,
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
  /** Course-only placement grade; the Showcase keeps its isolated tuning. */
  readonly courseGrade?: number;
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
// (amended 2026-08-20) The same gap floor, applied to the *longitudinal*
// axis: `rowPitch` had no floor tied to `postWidth` at all, so a
// schema-legal combination (`rowPitch` at its old minimum with `postWidth`
// at its maximum) left less than one marble diameter of raw clearance
// between staggered rows -- the exact clog `postSpacing`'s own floor exists
// to prevent, just on the other axis. A post's diagonal reach is the same
// in both directions (it's a square), so the same `POST_DIAGONAL_MAX` term
// applies.
const ROW_PITCH_MIN = POST_DIAGONAL_MAX + MIN_POST_GAP;

const DEFAULT_PARAMS: PinFieldParams = Object.freeze({
  rowCount: 10,
  postSpacing: POST_SPACING_MIN,
  postHeight: DEFAULT_POST_HEIGHT * 1.24,
  postWidth: DEFAULT_POST_WIDTH * 1.2,
  rowPitch: ROW_PITCH_MIN * 1.15,
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
      min: ROW_PITCH_MIN,
      max: ROW_PITCH_MIN * 2.5,
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
// row: a marble arriving at an obstacle with near-zero speed sees a
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
const RAIL_BUMPER_RADIUS = MARBLE_DIAMETER * 1.5;
const RAIL_BUMPER_SEGMENTS = 16;

function toVector(v: ThreeVector3): Vector3 {
  return [v.x, v.y, v.z];
}

function toQuaternion(q: ThreeQuaternion): Quaternion {
  return [q.x, q.y, q.z, q.w];
}

/** The 8 corners of a cuboid with the given half-extents, position, and
 * rotation to accumulate an axis-aligned `bounds` box that actually accounts for a
 * rotated collider's true extent, rather than a shortcut that only accounts
 * for part of the rotation. */
function cuboidCorners(
  halfExtents: Vector3,
  position: ThreeVector3,
  rotation: ThreeQuaternion,
): ThreeVector3[] {
  const corners: ThreeVector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(
          new ThreeVector3(sx * halfExtents[0], sy * halfExtents[1], sz * halfExtents[2])
            .applyQuaternion(rotation)
            .add(position),
        );
      }
    }
  }
  return corners;
}

/** Builds the visible half of a vertical cylinder. Its flat face sits on the
 * rail's inner plane and `inwardDirection` points the curved face into the
 * channel. Physics uses a full cylinder centered on that plane; the rail
 * makes its hidden outer half unreachable while preserving a smooth contact
 * surface on the racing side. */
function semicylinderShape(radius: number, halfHeight: number, inwardDirection: -1 | 1): Shape {
  const vertices: number[] = [0, -halfHeight, 0, 0, halfHeight, 0];
  const indices: number[] = [];
  const pushTriangle = (a: number, b: number, c: number) => {
    if (inwardDirection > 0) {
      indices.push(a, b, c);
    } else {
      indices.push(a, c, b);
    }
  };

  for (let segment = 0; segment <= RAIL_BUMPER_SEGMENTS; segment += 1) {
    const angle = -Math.PI / 2 + (segment / RAIL_BUMPER_SEGMENTS) * Math.PI;
    const x = inwardDirection * Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    vertices.push(x, -halfHeight, z, x, halfHeight, z);
  }

  for (let segment = 0; segment < RAIL_BUMPER_SEGMENTS; segment += 1) {
    const bottom = 2 + segment * 2;
    const top = bottom + 1;
    const nextBottom = bottom + 2;
    const nextTop = bottom + 3;

    pushTriangle(bottom, top, nextBottom);
    pushTriangle(nextBottom, top, nextTop);
    pushTriangle(0, bottom, nextBottom);
    pushTriangle(1, nextTop, top);
  }

  const firstBottom = 2;
  const firstTop = 3;
  const lastBottom = 2 + RAIL_BUMPER_SEGMENTS * 2;
  const lastTop = lastBottom + 1;
  pushTriangle(firstBottom, lastBottom, firstTop);
  pushTriangle(lastBottom, lastTop, firstTop);

  return { kind: "trimesh", vertices, indices };
}

/** Alternates four-post rows toward opposite rails. Every row leaves safe
 * rail clearance, while the next row blocks the prior row's side corridor so
 * no straight lateral bypass remains open through the whole field. */
function postLateralOffsets(
  rowIsOffset: boolean,
  postSpacing: number,
  postWidth: number,
  channelWidth: number,
): number[] {
  const rotatedHalfWidth = (postWidth * Math.SQRT2) / 2;
  const count = 4;
  const span = (count - 1) * postSpacing;
  const railClearance = SCALE.marbleRadius * 2.5;
  const availableShift = Math.max(
    0,
    channelWidth / 2 - rotatedHalfWidth - railClearance - span / 2,
  );
  const rowShift = rowIsOffset ? availableShift : -availableShift;
  const start = -span / 2 + rowShift;
  return Array.from({ length: count }, (_, index) => start + index * postSpacing);
}

function buildSpec(params: PinFieldParams): Spec {
  const { rowCount, postSpacing, postHeight, postWidth, rowPitch } = params;
  const totalRun = LEAD_IN + Math.max(0, rowCount - 1) * rowPitch + LEAD_OUT;
  const drop = totalRun * (params.courseGrade ?? FLOOR_GRADE);
  const channelMaterial = {
    restitution: 0,
    friction: SCALE.defaultFriction,
  };

  const channel = buildChannel(
    [{ start: [0, 0, 0], end: [0, -drop, totalRun], width: SCALE.channelWidth }],
    channelMaterial,
    "",
    { openContactSurfaces: true },
  );
  const colliders: ColliderSpec[] = [...channel.colliders];
  const visuals: VisualSpec[] = [...channel.visuals];
  const { entry, exit, route, bounds } = channel;

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
  const postColliderShape = {
    kind: "cylinder" as const,
    halfHeight: postHeight / 2,
    radius: (postWidth * Math.SQRT2) / 2,
  };

  const min: [number, number, number] = [...bounds.min];
  const max: [number, number, number] = [...bounds.max];
  const accumulate = (corners: readonly ThreeVector3[]) => {
    for (const corner of corners) {
      min[0] = Math.min(min[0], corner.x);
      min[1] = Math.min(min[1], corner.y);
      min[2] = Math.min(min[2], corner.z);
      max[0] = Math.max(max[0], corner.x);
      max[1] = Math.max(max[1], corner.y);
      max[2] = Math.max(max[2], corner.z);
    }
  };

  for (let row = 0; row < rowCount; row += 1) {
    const rowZ = LEAD_IN + row * rowPitch;
    const rowIsOffset = row % 2 === 1;
    const offsets = postLateralOffsets(rowIsOffset, postSpacing, postWidth, SCALE.channelWidth);
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
        shape: postColliderShape,
        position: toVector(position),
        rotation: toQuaternion(pitch),
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

      // (amended 2026-08-20) Full 8-corner transform under the *compound*
      // rotation (channel pitch + 45-degree spin), not a diagonal-reach
      // shortcut against a plain vertical Y and pre-tilt Z: the channel's
      // own slope tilt mixes Y and Z for every post, the same way it does
      // for `buildChannel`'s own floor and rails (see `channel.ts`'s
      // `cuboidCorners`) -- a shortcut that only accounts for the spin
      // undercounts true extent once the channel is graded at all.
      accumulate(cuboidCorners(postHalfExtents, position, postRotation));
    });

    // Each shifted row leaves its widest corridor on the opposite rail.
    // Alternating a bumper into that corridor closes both continuous edge
    // lanes without replacing the central diamond pattern.
    const bumperSide: -1 | 1 = rowIsOffset ? -1 : 1;
    const bumperLocalPoint = new ThreeVector3(
      bumperSide * (SCALE.channelWidth / 2),
      FLOOR_THICKNESS / 2 + postHeight / 2,
      rowZ - totalRun / 2,
    );
    const bumperPosition = floorCenter.clone().add(bumperLocalPoint.clone().applyQuaternion(pitch));
    const bumperId = `rail-bumper-${row}`;
    const bumperInwardDirection: -1 | 1 = bumperSide < 0 ? 1 : -1;
    const bumperColliderShape = {
      kind: "cylinder" as const,
      halfHeight: postHeight / 2,
      radius: RAIL_BUMPER_RADIUS,
    };

    colliders.push({
      id: bumperId,
      shape: bumperColliderShape,
      position: toVector(bumperPosition),
      rotation: toQuaternion(pitch),
      material: POST_MATERIAL,
    });
    visuals.push({
      id: bumperId,
      shape: semicylinderShape(RAIL_BUMPER_RADIUS, postHeight / 2, bumperInwardDirection),
      material: POST_VISUAL_MATERIAL,
      position: toVector(bumperPosition),
      rotation: toQuaternion(pitch),
    });
    accumulate(
      cuboidCorners(
        [RAIL_BUMPER_RADIUS, postHeight / 2, RAIL_BUMPER_RADIUS],
        bumperPosition,
        pitch,
      ),
    );
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
      route,
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
