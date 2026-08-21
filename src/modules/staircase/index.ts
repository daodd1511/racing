import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { SCALE } from "../../race/scale";
import type { Quaternion, Vector3 } from "../../race/types";
import { buildChannel, RAIL_THICKNESS } from "../geometry/channel";
import type { ChannelSegment } from "../geometry/channel";
import type {
  Anchor,
  ColliderSpec,
  ModuleDefinition,
  NumberParamField,
  ParamSchema,
  Spec,
  VisualSpec,
} from "../types";

// Full-width treads with a riser per step, per OBSTACLE-IDEAS.md -> "6.
// Staircase drop". `role: "sort"`: unlike the pin field's random scatter,
// a staircase re-sorts by *speed* -- a fast marble carries its own momentum
// across a tread and lands past the next riser, skipping treads a slow
// marble drops into one at a time.
//
// Built as chained `buildChannel` segments (one per tread) plus a separate
// riser wall per step, not by displacing a mesh -- there is no bed trimesh
// left to displace (per PLAN.md -> "What Spec 1 settled", item 2, this
// codebase never emits a concave collider anyway). Each tread is nearly
// flat: the sort effect comes from momentum carrying a marble across the
// gap a riser drop opens, not from the tread's own slope, so the tread only
// needs a small residual grade to keep a marble moving at all -- without it
// the very first tread (nothing yet dropped a marble onto it with speed;
// the Feeder spawns at rest) would have no way to start moving.

export interface StaircaseParams {
  readonly stepCount: number;
  /** Horizontal run of one tread, meters. */
  readonly tread: number;
  /** Vertical drop of one riser, meters. */
  readonly riseHeight: number;
  readonly width: number;
}

const DEFAULT_PARAMS: StaircaseParams = Object.freeze({
  stepCount: 5,
  tread: 0.12,
  riseHeight: 0.03,
  width: SCALE.channelWidth,
});

const PARAM_SCHEMA: ParamSchema = Object.freeze({
  fields: [
    {
      kind: "number",
      key: "stepCount",
      label: "Step count",
      min: 3,
      max: 8,
      step: 1,
      default: DEFAULT_PARAMS.stepCount,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "tread",
      label: "Tread length (m)",
      min: 0.08,
      max: 0.2,
      step: 0.005,
      default: DEFAULT_PARAMS.tread,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "riseHeight",
      label: "Rise height (m)",
      min: SCALE.marbleRadius * 1.2,
      max: SCALE.marbleRadius * 3,
      step: 0.002,
      default: DEFAULT_PARAMS.riseHeight,
    } satisfies NumberParamField,
    {
      // Pinned to SCALE.channelWidth, same reasoning as steepZigzag's
      // `width` field: the Validator's multi-marble spawn spread
      // (validateModule.ts's spawnMarbles) is hardcoded to SCALE.channelWidth
      // regardless of a Module's own width, so a narrower value spreads
      // marbles outside this Module's own rails from spawn.
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

// Small residual slope along each tread -- see the module comment. Far
// gentler than the riser drops that do the actual sorting.
const TREAD_GRADE = 0.08;
const RISER_THICKNESS = 0.008;
const RISER_MATERIAL_COLOR = "#8c7a6b";

function toVector(v: ThreeVector3): Vector3 {
  return [v.x, v.y, v.z];
}

function toQuaternion(q: ThreeQuaternion): Quaternion {
  return [q.x, q.y, q.z, q.w];
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

function buildSpec(params: StaircaseParams): Spec {
  const { stepCount, tread, riseHeight, width } = params;
  const treadDrop = tread * TREAD_GRADE;
  const channelMaterial = {
    restitution: SCALE.defaultRestitution,
    friction: SCALE.defaultFriction,
  };
  const riserMaterial = {
    restitution: SCALE.defaultRestitution * 0.6,
    friction: SCALE.defaultFriction,
  };

  // Each tread is its own flat-ish segment; the riser drop between one
  // tread's end and the next tread's start is a deliberate discontinuity
  // (buildChannel builds every segment independently -- it never requires
  // segment[i].end === segment[i+1].start), filled below by a riser wall
  // rather than by channel floor/rails.
  const segments: ChannelSegment[] = [];
  let cursor = new ThreeVector3(0, 0, 0);
  const risers: { position: ThreeVector3; height: number }[] = [];

  for (let step = 0; step < stepCount; step += 1) {
    const treadEnd = cursor.clone().add(new ThreeVector3(0, -treadDrop, tread));
    segments.push({ start: toVector(cursor), end: toVector(treadEnd), width });

    const riserBottom = treadEnd.clone().add(new ThreeVector3(0, -riseHeight, 0));
    risers.push({
      position: treadEnd.clone().add(riserBottom).multiplyScalar(0.5),
      height: riseHeight,
    });
    cursor = riserBottom;
  }

  const channel = buildChannel(segments, channelMaterial, "tread");
  const colliders: ColliderSpec[] = [...channel.colliders];
  const visuals: VisualSpec[] = [...channel.visuals];

  const min: [number, number, number] = [...channel.bounds.min];
  const max: [number, number, number] = [...channel.bounds.max];
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

  // Treads run parallel to +Z the whole way (TREAD_GRADE only touches Y, not
  // X), so an identity-ish rotation about X is all a riser needs -- derived
  // the same way channel.ts derives every other segment's pitch, not
  // assumed, so a future change to TREAD_GRADE's direction can't silently
  // desync the riser's own orientation from the treads it connects.
  const riserHalfExtents = (height: number): Vector3 => [
    width / 2 + RAIL_THICKNESS,
    height / 2,
    RISER_THICKNESS / 2,
  ];
  const identity = new ThreeQuaternion();

  risers.forEach((riser, index) => {
    const halfExtents = riserHalfExtents(riser.height);
    const shape = { kind: "cuboid" as const, halfExtents };
    const id = `riser-${index}`;

    colliders.push({
      id,
      shape,
      position: toVector(riser.position),
      rotation: toQuaternion(identity),
      material: riserMaterial,
    });
    visuals.push({
      id,
      shape,
      material: { color: RISER_MATERIAL_COLOR, metalness: 0.1, roughness: 0.6 },
      position: toVector(riser.position),
      rotation: toQuaternion(identity),
    });
    accumulate(cuboidCorners(halfExtents, riser.position, identity));
  });

  // The true exit is past the last riser's drop, not at the last tread's
  // own end (buildChannel's own `exit` anchor) -- `cursor` already tracks
  // that bottom point after the loop above.
  const exit: Anchor = {
    position: toVector(cursor),
    tangent: channel.exit.tangent,
    up: channel.exit.up,
  };

  return {
    colliders,
    visuals,
    footprint: {
      // No Board exists yet to occupy Cells on -- see SCALE.cellPitch's
      // comment. Real occupancy is Spec 3's job.
      cells: [],
      entry: channel.entry,
      exit,
      bounds: { min, max },
    },
  };
}

export const staircase: ModuleDefinition<StaircaseParams> = {
  id: "staircase",
  role: "sort",
  meta: { name: "Staircase", tags: ["sort", "steps"], params: PARAM_SCHEMA },
  buildSpec,
  // Static: nothing on the staircase moves after it's built.
  step: () => [],
};
