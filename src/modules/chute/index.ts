import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { SCALE } from "../../race/scale";
import type { Quaternion, Vector3 } from "../../race/types";
import type {
  ColliderSpec,
  Footprint,
  ModuleDefinition,
  NumberParamField,
  ParamSchema,
  Spec,
  VisualSpec,
} from "../types";

// A straight, banked chute -- the simplest `accel` Module, and the one that
// proves toy scale actually looks fast in the Showcase (Phase 3). Local
// space: +Y is up (gravity's axis, matching SCALE.gravity), +Z is the
// direction of travel, +X is lateral (rail-to-rail). This is a Module's own
// authoring frame, not the Board's -- placing a Module onto the Board's 2D
// face is the Assembler's job (Spec 3), not decided here.
//
// Three.js's Vector3/Quaternion are used only as internal math scratch space
// -- pure, deterministic, no rendering-library coupling -- and converted to
// plain tuples before anything leaves `buildSpec`, so this file stays a
// legitimate input to the Validator, which never depends on `three`.

export interface ChuteParams {
  readonly length: number;
  readonly grade: number;
  readonly width: number;
}

const DEFAULT_PARAMS: ChuteParams = Object.freeze({
  length: 0.6,
  grade: 0.25,
  width: SCALE.channelWidth,
});

const PARAM_SCHEMA: ParamSchema = Object.freeze({
  fields: [
    {
      kind: "number",
      key: "length",
      label: "Length (m)",
      min: 0.2,
      max: 1.5,
      step: 0.05,
      default: DEFAULT_PARAMS.length,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "grade",
      label: "Grade",
      min: 0.05,
      max: 0.6,
      step: 0.01,
      default: DEFAULT_PARAMS.grade,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "width",
      label: "Width (m)",
      min: 0.2,
      max: 0.8,
      step: 0.02,
      default: DEFAULT_PARAMS.width,
    } satisfies NumberParamField,
  ],
});

const FLOOR_THICKNESS = 0.01;
const RAIL_THICKNESS = 0.006;
const RAIL_HEIGHT = 0.03;

function toVector(v: ThreeVector3): Vector3 {
  return [v.x, v.y, v.z];
}

function toQuaternion(q: ThreeQuaternion): Quaternion {
  return [q.x, q.y, q.z, q.w];
}

function buildSpec(params: ChuteParams): Spec {
  const { length, grade, width } = params;
  const drop = length * grade;

  const entryPosition = new ThreeVector3(0, 0, 0);
  const exitPosition = new ThreeVector3(0, -drop, length);
  // Derived directly from entry->exit via `setFromUnitVectors`, not a
  // hand-picked axis-angle sign: a manually guessed sign here previously
  // pointed the rotation uphill instead of down, which is self-consistent
  // enough to typecheck and pass a naive glance but sends every collider's
  // actual world orientation somewhere other than where entry/exit claim it
  // is -- found by a marble free-falling straight through the "floor" in
  // the Validator, not by reading the math.
  const pitch = new ThreeQuaternion().setFromUnitVectors(
    new ThreeVector3(0, 0, 1),
    exitPosition.clone().sub(entryPosition).normalize(),
  );
  const tangent = new ThreeVector3(0, 0, 1).applyQuaternion(pitch).normalize();
  const up = new ThreeVector3(0, 1, 0).applyQuaternion(pitch).normalize();

  const floorCenter = entryPosition.clone().add(exitPosition).multiplyScalar(0.5);
  const material = { restitution: SCALE.defaultRestitution, friction: SCALE.defaultFriction };
  const floorShape = {
    kind: "cuboid" as const,
    halfExtents: [width / 2, FLOOR_THICKNESS / 2, length / 2] as Vector3,
  };

  const colliders: ColliderSpec[] = [
    {
      id: "floor",
      shape: floorShape,
      position: toVector(floorCenter),
      rotation: toQuaternion(pitch),
      material,
    },
  ];
  const visuals: VisualSpec[] = [
    {
      id: "floor",
      shape: floorShape,
      // Glossy injection-moulded plastic, per PLAN.md -> "Art direction" --
      // near-zero metalness (plastic isn't a metal) and low roughness for
      // the sheen. A dark, rough, semi-metallic material here was read as a
      // matte concrete slab, not the toy-real look the direction calls for.
      material: { color: "#e8e2d0", metalness: 0.05, roughness: 0.25 },
      position: toVector(floorCenter),
      rotation: toQuaternion(pitch),
    },
  ];

  for (const side of [-1, 1] as const) {
    const lateral = width / 2 + RAIL_THICKNESS / 2;
    const railCenter = floorCenter
      .clone()
      .add(new ThreeVector3(side * lateral, 0, 0))
      .add(up.clone().multiplyScalar(RAIL_HEIGHT / 2));
    const id = side < 0 ? "rail-left" : "rail-right";
    const shape = {
      kind: "cuboid" as const,
      halfExtents: [RAIL_THICKNESS / 2, RAIL_HEIGHT / 2, length / 2] as Vector3,
    };

    colliders.push({
      id,
      shape,
      position: toVector(railCenter),
      rotation: toQuaternion(pitch),
      material,
    });
    visuals.push({
      id,
      shape,
      material: { color: "#d8ff42", metalness: 0.05, roughness: 0.2 },
      position: toVector(railCenter),
      rotation: toQuaternion(pitch),
    });
  }

  const halfWidth = width / 2 + RAIL_THICKNESS;
  const footprint: Footprint = {
    // No Board exists yet to occupy Cells on -- see SCALE.cellPitch's
    // comment. Real occupancy is Spec 3's job.
    cells: [],
    entry: {
      position: toVector(entryPosition),
      tangent: toVector(tangent),
      up: toVector(up),
    },
    exit: {
      position: toVector(exitPosition),
      tangent: toVector(tangent),
      up: toVector(up),
    },
    bounds: {
      min: [-halfWidth, Math.min(0, -drop) - RAIL_HEIGHT, 0],
      max: [halfWidth, Math.max(0, -drop) + RAIL_HEIGHT, length],
    },
  };

  return { colliders, footprint, visuals };
}

export const chute: ModuleDefinition<ChuteParams> = {
  id: "chute",
  role: "accel",
  meta: { name: "Chute", tags: ["accel", "straight"], params: PARAM_SCHEMA },
  buildSpec,
  // Static: nothing on a chute moves after it's built.
  step: () => [],
};
