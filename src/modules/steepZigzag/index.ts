import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { SCALE } from "../../race/scale";
import type { Quaternion, Vector3 } from "../../race/types";
import { buildChannel, RAIL_HEIGHT, RAIL_THICKNESS } from "../geometry/channel";
import type { ChannelSegment } from "../geometry/channel";
import type {
  ColliderSpec,
  ModuleDefinition,
  NumberParamField,
  ParamSchema,
  Spec,
  VisualSpec,
} from "../types";

// The simplest `accel` Module beyond the chute: a switchback down a steep
// grade, alternating lateral direction every leg so a compact footprint
// covers a long descent -- see PLAN.md's Scope table (this Module has no
// OBSTACLE-IDEAS entry; it comes from marble-race-rebuild/PLAN.md's Arc
// table). Local space matches every other Module: +Y up, +Z the nominal
// direction of travel, +X lateral.

export interface SteepZigzagParams {
  /** Horizontal run of one leg, meters -- along that leg's own heading, not
   * the overall +Z axis (a leg's heading is rotated by `turnAngle`). */
  readonly legLength: number;
  /** Drop per leg as a fraction of `legLength`, same convention as the
   * chute's own `grade`. */
  readonly grade: number;
  readonly legCount: number;
  /** Radians off the centreline each leg's heading turns, alternating sign
   * leg to leg -- the zigzag's sharpness. */
  readonly turnAngle: number;
  readonly width: number;
}

const DEFAULT_PARAMS: SteepZigzagParams = Object.freeze({
  legLength: 0.3,
  grade: 0.62,
  legCount: 5,
  turnAngle: 0.2,
  // Matches SCALE.channelWidth, not narrower: the Validator's own multi-
  // marble spawn spread (`spawnMarbles` in validateModule.ts) is fixed to
  // SCALE.channelWidth regardless of what a Module's own Footprint reports
  // -- Anchor carries no width, so it has no other source. A narrower
  // default here spread marbles outside this Module's own rails from
  // spawn, which read as stalls (they fell off the side, never crossing
  // the exit plane) rather than a geometry defect in the zigzag itself.
  width: SCALE.channelWidth,
});

const PARAM_SCHEMA: ParamSchema = Object.freeze({
  fields: [
    {
      kind: "number",
      key: "legLength",
      label: "Leg length (m)",
      min: 0.15,
      max: 0.5,
      step: 0.01,
      default: DEFAULT_PARAMS.legLength,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "grade",
      label: "Grade",
      min: 0.3,
      max: 0.8,
      step: 0.01,
      default: DEFAULT_PARAMS.grade,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "legCount",
      label: "Leg count",
      min: 2,
      max: 8,
      step: 1,
      default: DEFAULT_PARAMS.legCount,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "turnAngle",
      label: "Turn angle (rad)",
      min: 0.2,
      max: 0.9,
      step: 0.02,
      default: DEFAULT_PARAMS.turnAngle,
    } satisfies NumberParamField,
    {
      // (amended 2026-08-20) `min` pinned to `SCALE.channelWidth`, not a
      // real range down to 0.3: the spawn-spread bug this default fixed
      // (see `DEFAULT_PARAMS.width`'s comment) is reachable from the
      // Showcase too -- `Feeder.tsx`'s continuous spawn, not only
      // `validateModule.ts`'s sweep, hardcodes its lateral spread to
      // `SCALE.channelWidth` regardless of a Module's own width. Fixing
      // that at the source is shared Spec-1 infrastructure, out of this
      // phase's scope; pinning the slider is the safe fix available here.
      kind: "number",
      key: "width",
      label: "Width (m)",
      min: SCALE.channelWidth,
      max: SCALE.channelWidth,
      step: 0.02,
      default: DEFAULT_PARAMS.width,
    } satisfies NumberParamField,
  ],
});

const GRAVITY_MAGNITUDE = Math.hypot(SCALE.gravity[0], SCALE.gravity[1], SCALE.gravity[2]);
const GUARD_MATERIAL = { color: "#d8ff42", metalness: 0.05, roughness: 0.2 };

function toVector(v: ThreeVector3): Vector3 {
  return [v.x, v.y, v.z];
}

function toQuaternion(q: ThreeQuaternion): Quaternion {
  return [q.x, q.y, q.z, q.w];
}

interface SegmentFrame {
  readonly pitch: ThreeQuaternion;
  readonly up: ThreeVector3;
  readonly floorCenter: ThreeVector3;
  readonly segmentLength: number;
}

/** The same per-segment frame `buildChannel` computes internally, recomputed
 * here because this Module needs it a second time -- to place guard-wall
 * extensions `buildChannel`'s own fixed-height rails don't cover -- and
 * `buildChannel`'s contract only returns the whole chain's entry/exit, not
 * every intermediate segment's own frame. */
function segmentFrame(start: ThreeVector3, end: ThreeVector3): SegmentFrame {
  const delta = end.clone().sub(start);
  const segmentLength = delta.length();
  const pitch = new ThreeQuaternion().setFromUnitVectors(
    new ThreeVector3(0, 0, 1),
    delta.clone().normalize(),
  );
  const up = new ThreeVector3(0, 1, 0).applyQuaternion(pitch).normalize();
  const floorCenter = start.clone().add(end).multiplyScalar(0.5);
  return { pitch, up, floorCenter, segmentLength };
}

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

function buildSpec(params: SteepZigzagParams): Spec {
  const { legLength, grade, legCount, turnAngle, width } = params;
  const drop = legLength * grade;
  // Higher restitution and lower friction than SCALE's own defaults: a
  // marble that settles for even a moment in the shallow notch a turn's
  // outer corner can form still needs enough bounce to be kicked back into
  // motion by the next contact, rather than a low-restitution surface
  // letting it find a stable local minimum there. Measured directly (see
  // steepZigzag.test.ts's zero-stall sweep).
  const material = { restitution: 0.45, friction: 0.02 };

  const legs: { start: ThreeVector3; end: ThreeVector3; heading: ThreeVector3 }[] = [];
  let cursor = new ThreeVector3(0, 0, 0);
  let cumulativeDrop = 0;
  // Required outer-wall height per leg, from the same v^2/(2g) calculation
  // that fixed the vortex bowl's rim escapes (marble-race-rebuild/
  // EXECUTION.md -> Phase 4 -> "Result, 2026-08-20"): a marble converts
  // v^2/(2g) of its speed into climb height against a wall. `terminalSpeed`
  // is the frictionless-fall speed from the total drop so far -- a
  // deliberate overestimate of the real (friction-slowed) speed, so the
  // wall height computed from it is a safe upper bound, not a tuned guess.
  const requiredGuardHeights: number[] = [];

  for (let index = 0; index < legCount; index += 1) {
    const yaw = (index % 2 === 0 ? 1 : -1) * turnAngle;
    const heading = new ThreeVector3(0, 0, 1).applyAxisAngle(new ThreeVector3(0, 1, 0), yaw);
    const end = cursor
      .clone()
      .add(heading.clone().multiplyScalar(legLength))
      .add(new ThreeVector3(0, -drop, 0));
    legs.push({ start: cursor.clone(), end: end.clone(), heading });

    cumulativeDrop += drop;
    const terminalSpeed = Math.sqrt(2 * GRAVITY_MAGNITUDE * cumulativeDrop);
    requiredGuardHeights.push((terminalSpeed * terminalSpeed) / (2 * GRAVITY_MAGNITUDE));

    cursor = end;
  }

  // Each internal joint gets its two adjoining legs' rails extended past the
  // true corner point, by `heading`, so they physically overlap there
  // instead of meeting edge to edge. Two straight rails meeting at
  // `turnAngle` off from each other leave a V-shaped gap on the turn's
  // outer side when they only touch at a point -- narrow, but real, and a
  // marble settling into it can stick. This overlap alone was not enough at
  // a sharper `turnAngle`; getting to zero stalls across the seed sweep
  // (steepZigzag.test.ts) needed this plus the gentler default `turnAngle`
  // and the bouncier `material` above -- no one change did it alone. The
  // entry and exit anchors stay exact: only the two interior ends of each
  // internal joint are pushed, never the chain's own first start or last
  // end.
  const JOINT_OVERLAP = SCALE.marbleRadius * 1.5;
  const segments: ChannelSegment[] = legs.map((leg, index) => {
    const start =
      index === 0 ? leg.start : leg.start.clone().sub(leg.heading.clone().multiplyScalar(JOINT_OVERLAP));
    const end =
      index === legs.length - 1
        ? leg.end
        : leg.end.clone().add(leg.heading.clone().multiplyScalar(JOINT_OVERLAP));
    return { start: toVector(start), end: toVector(end), width };
  });
  const channel = buildChannel(segments, material, "leg");
  const colliders: ColliderSpec[] = [...channel.colliders];
  const visuals: VisualSpec[] = [...channel.visuals];
  const { entry, exit, bounds } = channel;

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

  // Guard-wall extensions on top of `buildChannel`'s own RAIL_HEIGHT-tall
  // rails, only where a leg's required height exceeds that. Both sides get
  // the extension, not only whichever side a given corner's turn direction
  // makes geometrically "outer": the zigzag alternates which side is outer
  // leg to leg, so a matched pair per leg is simpler than tracking outer/
  // inner per corner and no less safe -- the same "err generous" choice
  // `revolveProfileToPlates` makes over exact plate sizing.
  legs.forEach((leg, index) => {
    const requiredHeight = requiredGuardHeights[index];
    if (requiredHeight <= RAIL_HEIGHT) {
      return;
    }
    // Same joint overlap as the base rails above, and for the same reason:
    // a guard wall that only meets its neighbor at a point leaves the same
    // V-notch one leg height higher up.
    const guardStart =
      index === 0 ? leg.start : leg.start.clone().sub(leg.heading.clone().multiplyScalar(JOINT_OVERLAP));
    const guardEnd =
      index === legs.length - 1
        ? leg.end
        : leg.end.clone().add(leg.heading.clone().multiplyScalar(JOINT_OVERLAP));
    const frame = segmentFrame(guardStart, guardEnd);
    const extensionHeight = requiredHeight - RAIL_HEIGHT;
    const guardHalfExtents: Vector3 = [
      RAIL_THICKNESS / 2,
      extensionHeight / 2,
      frame.segmentLength / 2,
    ];
    const guardShape = { kind: "cuboid" as const, halfExtents: guardHalfExtents };

    for (const side of [-1, 1] as const) {
      const lateral = width / 2 + RAIL_THICKNESS / 2;
      const guardCenter = frame.floorCenter
        .clone()
        .add(new ThreeVector3(side * lateral, 0, 0).applyQuaternion(frame.pitch))
        .add(frame.up.clone().multiplyScalar(RAIL_HEIGHT + extensionHeight / 2));
      const id = `leg-guard-${side < 0 ? "left" : "right"}-${index}`;

      const guardCollider: ColliderSpec = {
        id,
        shape: guardShape,
        position: toVector(guardCenter),
        rotation: toQuaternion(frame.pitch),
        material,
      };
      colliders.push(guardCollider);
      visuals.push({
        id,
        shape: guardShape,
        material: GUARD_MATERIAL,
        position: toVector(guardCenter),
        rotation: toQuaternion(frame.pitch),
      });
      accumulate(cuboidCorners(guardHalfExtents, guardCenter, frame.pitch));
    }
  });

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

export const steepZigzag: ModuleDefinition<SteepZigzagParams> = {
  id: "steep-zigzag",
  role: "accel",
  meta: { name: "Steep zigzag", tags: ["accel", "zigzag"], params: PARAM_SCHEMA },
  buildSpec,
  // Static: nothing on the zigzag moves after it's built.
  step: () => [],
};
