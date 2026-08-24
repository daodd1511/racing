import { SCALE } from "../../race/scale";
import { buildChannel } from "../geometry/channel";
import type { ModuleDefinition, NumberParamField, ParamSchema, Spec } from "../types";

// A straight, banked chute -- the simplest `accel` Module, and the one that
// proves toy scale actually looks fast in the Showcase (Phase 3). Local
// space: +Y is up (gravity's axis, matching SCALE.gravity), +Z is the
// direction of travel, +X is lateral (rail-to-rail). This is a Module's own
// authoring frame, not the Board's -- placing a Module onto the Board's 2D
// face is the Assembler's job (Spec 3), not decided here.
//
// The floor-plus-rails geometry itself is `buildChannel`'s job (Phase 1 of
// Spec 2, `../geometry/channel.ts`) -- this file only describes the single
// straight segment a chute is. `buildChannel` is where three.js's
// Vector3/Quaternion live as internal math scratch space and get converted
// to plain tuples, so this file stays a legitimate input to the Validator,
// which never depends on `three`.

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

function buildSpec(params: ChuteParams): Spec {
  const { length, grade, width } = params;
  const drop = length * grade;
  const material = { restitution: 0, friction: SCALE.defaultFriction };

  // Empty `idPrefix`: a chute is always a single segment, and `buildChannel`
  // then emits bare ids ("floor", "rail-left", "rail-right") matching this
  // Module's own pre-`buildChannel` output exactly.
  const { colliders, visuals, entry, exit, route, bounds } = buildChannel(
    [{ start: [0, 0, 0], end: [0, -drop, length], width }],
    material,
    "",
    { openContactSurfaces: true },
  );

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
      bounds,
    },
  };
}

export const chute: ModuleDefinition<ChuteParams> = {
  id: "chute",
  role: "accel",
  meta: { name: "Chute", tags: ["accel", "straight"], params: PARAM_SCHEMA },
  buildSpec,
  // Static: nothing on a chute moves after it's built.
  step: () => [],
};
