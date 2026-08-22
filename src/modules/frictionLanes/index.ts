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

// Parallel lanes down one channel, each carrying its own floor friction, per
// OBSTACLE-IDEAS.md -> "3. Friction patches". `role: "sort"`: marbles have
// no agency about which lane they land in -- that's the point, and the
// whole reason this Module sorts rather than scatters. Lanes alternate
// `fastFriction`/`slowFriction`; per PLAN.md -> "Art direction", the two get
// distinct `VisualMaterial` colors, but lane identity is also readable from
// lane *position* (the fast lanes are always the same lanes every build),
// so color alone is never the only cue.
//
// `buildChannel` gives one shared floor material per call, not a per-lane
// override -- this Module calls it once for its outer rails and entry/exit
// framing, then discards its single floor collider/visual and builds one
// floor per lane directly, each with its own `ColliderMaterial`.

export interface FrictionLanesParams {
  readonly laneCount: number;
  readonly length: number;
  readonly slowFriction: number;
  readonly fastFriction: number;
  readonly dividerHeight: number;
}

const DEFAULT_PARAMS: FrictionLanesParams = Object.freeze({
  laneCount: 2,
  length: 0.35,
  slowFriction: 0.4,
  fastFriction: 0.02,
  dividerHeight: SCALE.marbleRadius * 0.8,
});

const PARAM_SCHEMA: ParamSchema = Object.freeze({
  fields: [
    {
      kind: "number",
      key: "laneCount",
      label: "Lane count",
      min: 2,
      max: 4,
      step: 1,
      default: DEFAULT_PARAMS.laneCount,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "length",
      label: "Length (m)",
      min: 0.2,
      max: 0.6,
      step: 0.01,
      default: DEFAULT_PARAMS.length,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "slowFriction",
      label: "Slow-lane friction",
      min: 0.2,
      max: 0.6,
      step: 0.01,
      default: DEFAULT_PARAMS.slowFriction,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "fastFriction",
      label: "Fast-lane friction",
      min: 0.01,
      max: 0.08,
      step: 0.005,
      default: DEFAULT_PARAMS.fastFriction,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "dividerHeight",
      label: "Divider height (m)",
      min: SCALE.marbleRadius * 0.4,
      max: SCALE.marbleRadius * 1.2,
      step: 0.001,
      default: DEFAULT_PARAMS.dividerHeight,
    } satisfies NumberParamField,
  ],
});

// A mild descending grade, internal rather than exposed -- this Module's
// character is the lane split, not its slope. Same convention as
// pinField/rumbleStrip: the Feeder always spawns a marble at rest, so some
// grade is what keeps it from stalling.
const FLOOR_GRADE = 0.3;
const DIVIDER_THICKNESS = 0.005;

// Fast lane reads cool/icy, slow lane reads warm/muddy -- distinct beyond
// just friction, matching OBSTACLE-IDEAS' own ice/mud framing.
const FAST_LANE_VISUAL = { color: "#bfe6ff", metalness: 0.1, roughness: 0.15 };
const SLOW_LANE_VISUAL = { color: "#8a5a34", metalness: 0.02, roughness: 0.9 };
const DIVIDER_VISUAL = { color: "#3a3a3a", metalness: 0.1, roughness: 0.5 };

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

function buildSpec(params: FrictionLanesParams): Spec {
  const { laneCount, length, slowFriction, fastFriction, dividerHeight } = params;
  const drop = length * FLOOR_GRADE;
  const shellMaterial = { restitution: SCALE.defaultRestitution, friction: SCALE.defaultFriction };

  const channel = buildChannel(
    [{ start: [0, 0, 0], end: [0, -drop, length], width: SCALE.channelWidth }],
    shellMaterial,
    "",
  );
  // Keep only the outer rails from the shell call -- the shared floor is
  // replaced below by one floor per lane, each with its own material.
  const colliders: ColliderSpec[] = channel.colliders.filter((c) => c.id !== "floor");
  const visuals: VisualSpec[] = channel.visuals.filter((v) => v.id !== "floor");
  const { entry, exit } = channel;

  const startVector = new ThreeVector3(0, 0, 0);
  const endVector = new ThreeVector3(0, -drop, length);
  const pitch = new ThreeQuaternion().setFromUnitVectors(
    new ThreeVector3(0, 0, 1),
    endVector.clone().sub(startVector).normalize(),
  );
  const up = new ThreeVector3(0, 1, 0).applyQuaternion(pitch).normalize();
  const floorCenter = startVector.clone().add(endVector).multiplyScalar(0.5);
  const segmentLength = endVector.clone().sub(startVector).length();

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

  const laneWidth = SCALE.channelWidth / laneCount;
  for (let lane = 0; lane < laneCount; lane += 1) {
    const laneCenter = -SCALE.channelWidth / 2 + laneWidth * (lane + 0.5);
    const isFast = lane % 2 === 0;
    const floorHalfExtents: Vector3 = [laneWidth / 2, FLOOR_THICKNESS / 2, segmentLength / 2];
    const floorShape = { kind: "cuboid" as const, halfExtents: floorHalfExtents };
    const floorPosition = floorCenter
      .clone()
      .add(new ThreeVector3(laneCenter, 0, 0).applyQuaternion(pitch));
    const id = `lane-floor-${lane}`;
    const material = {
      restitution: SCALE.defaultRestitution,
      friction: isFast ? fastFriction : slowFriction,
    };

    colliders.push({
      id,
      shape: floorShape,
      position: toVector(floorPosition),
      rotation: toQuaternion(pitch),
      material,
    });
    visuals.push({
      id,
      shape: floorShape,
      material: isFast ? FAST_LANE_VISUAL : SLOW_LANE_VISUAL,
      position: toVector(floorPosition),
      rotation: toQuaternion(pitch),
    });
    accumulate(cuboidCorners(floorHalfExtents, floorPosition, pitch));
  }

  // laneCount - 1 dividers, one at each interior lane boundary.
  for (let divider = 1; divider < laneCount; divider += 1) {
    const dividerLateral = -SCALE.channelWidth / 2 + laneWidth * divider;
    const dividerHalfExtents: Vector3 = [
      DIVIDER_THICKNESS / 2,
      dividerHeight / 2,
      segmentLength / 2,
    ];
    const dividerShape = { kind: "cuboid" as const, halfExtents: dividerHalfExtents };
    const dividerPosition = floorCenter
      .clone()
      .add(new ThreeVector3(dividerLateral, 0, 0).applyQuaternion(pitch))
      .add(up.clone().multiplyScalar(dividerHeight / 2));
    const id = `divider-${divider}`;

    colliders.push({
      id,
      shape: dividerShape,
      position: toVector(dividerPosition),
      rotation: toQuaternion(pitch),
      material: shellMaterial,
    });
    visuals.push({
      id,
      shape: dividerShape,
      material: DIVIDER_VISUAL,
      position: toVector(dividerPosition),
      rotation: toQuaternion(pitch),
    });
    accumulate(cuboidCorners(dividerHalfExtents, dividerPosition, pitch));
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
      route: channel.route,
      bounds: { min, max },
    },
  };
}

export const frictionLanes: ModuleDefinition<FrictionLanesParams> = {
  id: "friction-lanes",
  role: "sort",
  meta: { name: "Friction lanes", tags: ["sort", "friction"], params: PARAM_SCHEMA },
  buildSpec,
  // Static: nothing on the friction lanes moves after it's built.
  step: () => [],
};
