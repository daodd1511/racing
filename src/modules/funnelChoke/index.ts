import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { SCALE } from "../../race/scale";
import type { Quaternion, Vector3 } from "../../race/types";
import { FLOOR_THICKNESS, RAIL_THICKNESS, buildChannel } from "../geometry/channel";
import type {
  ColliderSpec,
  ModuleDefinition,
  NumberParamField,
  ParamSchema,
  Spec,
  VisualSpec,
} from "../types";

// Two walls squeeze a spread-out pack into a Queue before flaring out again,
// per OBSTACLE-IDEAS.md -> "Funnel choke". The wall material is deliberately
// slippery: a choke should bunch marbles through contact, not strand them on
// a high-friction side face.

export interface FunnelChokeParams {
  /** Clear gap between the inner faces at the throat, in meters. */
  readonly throatWidth: number;
  /** Angle each approach wall makes from +Z, in radians. */
  readonly approachAngle: number;
  readonly wallFriction: number;
  readonly wallRestitution: number;
  /** Total length of the approach, throat, and flare, in meters. */
  readonly length: number;
}

const MARBLE_DIAMETER = SCALE.marbleRadius * 2;
// OBSTACLE-IDEAS' prose says a choke needs at least six marble diameters to
// clear a 15-marble pack, while its old-build note pairs a 2.2 m throat with
// a 4.2 m floor -- only about 3.1 diameters. The ratio is the design rule;
// the old absolute number belongs to the deleted 11 m-bed implementation.
const MINIMUM_THROAT_WIDTH = MARBLE_DIAMETER * 6;
// Six diameters is the hard clearance floor from the obstacle brief. The
// schema begins one diameter wider: the validator feeds fifteen marbles at
// once, and this buffer avoids a borderline arch at the physical limit while
// retaining the brief's minimum as an explicit invariant.
const SAFE_THROAT_WIDTH = MINIMUM_THROAT_WIDTH + MARBLE_DIAMETER;
const WALL_THICKNESS = 0.01;
const WALL_HEIGHT = SCALE.marbleRadius * 5;
const FLOOR_GRADE = 0.65;
const MINIMUM_FLARE_RUN = MARBLE_DIAMETER * 3;
const ENTRY_RUN_FRACTION = 0.6;
const WALL_VISUAL_MATERIAL = { color: "#27d7e8", metalness: 0.15, roughness: 0.2 };

const DEFAULT_PARAMS: FunnelChokeParams = Object.freeze({
  throatWidth: MARBLE_DIAMETER * 8,
  approachAngle: 0.48,
  wallFriction: 0.04,
  wallRestitution: 0.04,
  length: 1.2,
});

const PARAM_SCHEMA: ParamSchema = Object.freeze({
  fields: [
    {
      kind: "number",
      key: "throatWidth",
      label: "Throat width (m)",
      min: SAFE_THROAT_WIDTH,
      max: MARBLE_DIAMETER * 10,
      step: MARBLE_DIAMETER / 2,
      default: DEFAULT_PARAMS.throatWidth,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "approachAngle",
      label: "Approach angle (rad)",
      min: 0.35,
      max: 0.7,
      step: 0.01,
      default: DEFAULT_PARAMS.approachAngle,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "wallFriction",
      label: "Wall friction",
      min: 0.02,
      max: 0.08,
      step: 0.01,
      default: DEFAULT_PARAMS.wallFriction,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "wallRestitution",
      label: "Wall restitution",
      min: 0.01,
      max: 0.1,
      step: 0.01,
      default: DEFAULT_PARAMS.wallRestitution,
    } satisfies NumberParamField,
    {
      // At the widest legal channel-to-throat delta and shallowest legal
      // angle, each side needs ~0.41 m before the throat. This minimum then
      // leaves three marble diameters for the flare, rather than allowing a
      // parameter combination with no room to release the Queue after it
      // passes the pinch point.
      kind: "number",
      key: "length",
      label: "Length (m)",
      min: 0.95,
      max: 1.8,
      step: 0.05,
      default: DEFAULT_PARAMS.length,
    } satisfies NumberParamField,
  ],
});

interface WallPath {
  readonly id: string;
  readonly start: ThreeVector3;
  readonly end: ThreeVector3;
}

function toVector(vector: ThreeVector3): Vector3 {
  return [vector.x, vector.y, vector.z];
}

function toQuaternion(quaternion: ThreeQuaternion): Quaternion {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function cuboidCorners(
  halfExtents: Vector3,
  position: ThreeVector3,
  rotation: ThreeQuaternion,
): ThreeVector3[] {
  const corners: ThreeVector3[] = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        corners.push(
          new ThreeVector3(x * halfExtents[0], y * halfExtents[1], z * halfExtents[2])
            .applyQuaternion(rotation)
            .add(position),
        );
      }
    }
  }
  return corners;
}

function buildWallPaths(params: FunnelChokeParams): readonly WallPath[] {
  // The centreline’s own rails sit just outside the wall starts. At the
  // throat, `throatWidth` describes the clear inner-face gap, so each wall
  // centre adds half its own thickness rather than silently reducing the
  // schema's stated clearance.
  const outerWallCentre = SCALE.channelWidth / 2 - RAIL_THICKNESS - WALL_THICKNESS / 2;
  const throatWallCentre = params.throatWidth / 2 + WALL_THICKNESS / 2;
  const lateralRun = outerWallCentre - throatWallCentre;
  const sideRun = lateralRun / Math.tan(params.approachAngle);

  if (params.length - sideRun < MINIMUM_FLARE_RUN) {
    throw new Error("funnelChoke length is too short for its throat and approach angle");
  }

  // Let the pack build downhill momentum before the walls begin converging.
  // A pinch at the entry face made a 15-marble vertical feed form a stable
  // arch, whereas the same two-wall geometry clears once the pack reaches it
  // as a moving field. Reserve the required release distance first, then use
  // the rest mostly as entry run so every legal parameter combination has a
  // positive flare after the throat.
  const entryRun = (params.length - sideRun - MINIMUM_FLARE_RUN) * ENTRY_RUN_FRACTION;
  const throatDistance = entryRun + sideRun;

  const paths: WallPath[] = [];

  for (const side of [-1, 1] as const) {
    paths.push({
      id: `funnel-approach-${side < 0 ? "left" : "right"}`,
      start: new ThreeVector3(side * outerWallCentre, 0, entryRun),
      end: new ThreeVector3(side * throatWallCentre, 0, throatDistance),
    });
    paths.push({
      id: `funnel-flare-${side < 0 ? "left" : "right"}`,
      start: new ThreeVector3(side * throatWallCentre, 0, throatDistance),
      end: new ThreeVector3(side * outerWallCentre, 0, params.length),
    });
  }

  return paths;
}

function buildSpec(params: FunnelChokeParams): Spec {
  const drop = params.length * FLOOR_GRADE;
  const floorMaterial = { restitution: SCALE.defaultRestitution, friction: SCALE.defaultFriction };
  const wallMaterial = { restitution: params.wallRestitution, friction: params.wallFriction };
  const channel = buildChannel(
    [{ start: [0, 0, 0], end: [0, -drop, params.length], width: SCALE.channelWidth }],
    floorMaterial,
    "funnel",
  );
  const colliders: ColliderSpec[] = [...channel.colliders];
  const visuals: VisualSpec[] = [...channel.visuals];
  const min: [number, number, number] = [...channel.bounds.min];
  const max: [number, number, number] = [...channel.bounds.max];
  const start = new ThreeVector3(0, 0, 0);
  const end = new ThreeVector3(0, -drop, params.length);
  const pitch = new ThreeQuaternion().setFromUnitVectors(
    new ThreeVector3(0, 0, 1),
    end.clone().sub(start).normalize(),
  );
  const wallHalfExtents: Vector3 = [WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0];

  for (const path of buildWallPaths(params)) {
    const localDelta = path.end.clone().sub(path.start);
    const localLength = localDelta.length();
    const yaw = Math.atan2(localDelta.x, localDelta.z);
    // `pitch * yaw` first turns local +Z toward the side wall in the
    // channel's frame, then aligns that frame to the descending floor. This
    // preserves a right-handed local X/Y/Z basis and keeps each wall upright
    // relative to the floor instead of world-Y on a slope.
    const rotation = pitch
      .clone()
      .multiply(new ThreeQuaternion().setFromAxisAngle(new ThreeVector3(0, 1, 0), yaw));
    const localCentre = path.start.clone().add(path.end).multiplyScalar(0.5);
    localCentre.y = FLOOR_THICKNESS / 2 + WALL_HEIGHT / 2;
    // Wall paths are expressed from the channel's entry at local origin. The
    // channel centre is itself `+Z * length / 2` under `pitch`, so adding it
    // after transforming this entry-relative position would translate every
    // wall a second half-channel downstream. Rotate only once to produce the
    // same world-space frame used by `buildChannel`.
    const position = localCentre.applyQuaternion(pitch);
    const halfExtents: Vector3 = [wallHalfExtents[0], wallHalfExtents[1], localLength / 2];
    const shape = { kind: "cuboid" as const, halfExtents };

    colliders.push({
      id: path.id,
      shape,
      position: toVector(position),
      rotation: toQuaternion(rotation),
      material: wallMaterial,
    });
    visuals.push({
      id: path.id,
      shape,
      material: WALL_VISUAL_MATERIAL,
      position: toVector(position),
      rotation: toQuaternion(rotation),
    });

    for (const corner of cuboidCorners(halfExtents, position, rotation)) {
      min[0] = Math.min(min[0], corner.x);
      min[1] = Math.min(min[1], corner.y);
      min[2] = Math.min(min[2], corner.z);
      max[0] = Math.max(max[0], corner.x);
      max[1] = Math.max(max[1], corner.y);
      max[2] = Math.max(max[2], corner.z);
    }
  }

  return {
    colliders,
    visuals,
    footprint: {
      cells: [],
      entry: channel.entry,
      exit: channel.exit,
      bounds: { min, max },
    },
  };
}

export const funnelChoke: ModuleDefinition<FunnelChokeParams> = {
  id: "funnel-choke",
  role: "queue",
  meta: { name: "Funnel choke", tags: ["queue", "funnel"], params: PARAM_SCHEMA },
  buildSpec,
  // Static: wall geometry only changes when params build a new Spec.
  step: () => [],
};
