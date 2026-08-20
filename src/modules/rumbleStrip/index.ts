import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { SCALE } from "../../race/scale";
import type { Quaternion, Vector3 } from "../../race/types";
import { buildChannel, FLOOR_THICKNESS, RAIL_THICKNESS } from "../geometry/channel";
import type {
  ColliderSpec,
  ModuleDefinition,
  NumberParamField,
  ParamSchema,
  Spec,
  VisualSpec,
} from "../types";

// Low transverse bars spanning the channel, per OBSTACLE-IDEAS.md -> "4.
// Rumble strip". `role: "scatter"`: each bar throws a marble a few
// millimeters, breaking up clean rolling lines rather than holding the
// field -- this Module's whole job happens in a fraction of a second (see
// its own test's Dwell comment), unlike the pin field's multi-row spread.

export interface RumbleStripParams {
  readonly barCount: number;
  /** Longitudinal pitch between bars, meters. */
  readonly barSpacing: number;
  readonly barHeight: number;
  /** Tunable per OBSTACLE-IDEAS' own build note -- this is the one
   * Module-specific material property exposed; friction stays fixed
   * internally (see `BAR_FRICTION`), since the disruption is about bounce,
   * not grip. */
  readonly restitution: number;
}

const MARBLE_DIAMETER = SCALE.marbleRadius * 2;
// OBSTACLE-IDEAS gives 1.1 m spacing against its 0.7 m marble diameter (a
// ~1.57 diameter pitch), applied by ratio per PLAN.md -> "Prefer the
// ratios" -- but that ratio, measured directly at toy scale, chips enough
// speed off a marble crossing 9-10 closely spaced bars in a row that later
// bars stall it outright (see the LEAD_IN comment below for the same class
// of failure). 3 diameters gives each bar room to re-accelerate the field
// before the next one; see rumbleStrip.test.ts's zero-stall sweep.
const DEFAULT_BAR_SPACING = MARBLE_DIAMETER * 3;
const DEFAULT_BAR_HEIGHT = SCALE.marbleRadius * 0.3;
const BAR_THICKNESS = SCALE.marbleRadius; // Along the direction of travel.
const BAR_FRICTION = 0.1; // Low: the disruption is meant to come from bounce, not grip.

const DEFAULT_PARAMS: RumbleStripParams = Object.freeze({
  barCount: 10,
  barSpacing: DEFAULT_BAR_SPACING,
  barHeight: DEFAULT_BAR_HEIGHT,
  restitution: 0.38,
});

const PARAM_SCHEMA: ParamSchema = Object.freeze({
  fields: [
    {
      kind: "number",
      key: "barCount",
      label: "Bar count",
      min: 4,
      max: 16,
      step: 1,
      default: DEFAULT_PARAMS.barCount,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "barSpacing",
      label: "Bar spacing (m)",
      min: MARBLE_DIAMETER,
      max: MARBLE_DIAMETER * 3,
      step: 0.002,
      default: DEFAULT_PARAMS.barSpacing,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "barHeight",
      label: "Bar height (m)",
      min: SCALE.marbleRadius * 0.2,
      max: SCALE.marbleRadius * 1.5,
      step: 0.001,
      default: DEFAULT_PARAMS.barHeight,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "restitution",
      label: "Restitution",
      min: 0.05,
      max: 0.5,
      step: 0.01,
      default: DEFAULT_PARAMS.restitution,
    } satisfies NumberParamField,
  ],
});

// Steeper than the pin field: a rumble strip is meant to be a brief 2-3 m
// approach section (OBSTACLE-IDEAS' own description), not a Module a marble
// lingers in, so it needs enough grade to keep displacement comfortably
// above the visible-motion floor over that short a run.
const FLOOR_GRADE = 0.42;
// Long enough that a marble spawned at rest (the Feeder's own convention --
// see chute/index.ts) has picked up real speed before reaching the first
// bar: a marble arriving at a raised bar's vertical leading face with
// near-zero horizontal speed sees a genuine step, not a bump, and a bump
// this Module's own floor grade can't yet supply enough kinetic energy to
// climb is a stall regardless of friction. Measured directly: at
// `MARBLE_DIAMETER * 3` the very first bar stopped every marble outright;
// at this length none do (see rumbleStrip.test.ts's zero-stall sweep).
const LEAD_IN = MARBLE_DIAMETER * 18;
const LEAD_OUT = MARBLE_DIAMETER * 3;

const BAR_VISUAL_MATERIAL = { color: "#f7d84a", metalness: 0.05, roughness: 0.35 };

function toVector(v: ThreeVector3): Vector3 {
  return [v.x, v.y, v.z];
}

function toQuaternion(q: ThreeQuaternion): Quaternion {
  return [q.x, q.y, q.z, q.w];
}

function buildSpec(params: RumbleStripParams): Spec {
  const { barCount, barSpacing, barHeight, restitution } = params;
  const totalRun = LEAD_IN + Math.max(0, barCount - 1) * barSpacing + LEAD_OUT;
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

  // Recomputed rather than exposed by `buildChannel` -- see pinField's
  // identical comment on why: bars need the same per-segment frame the
  // floor and rails were placed with.
  const startVector = new ThreeVector3(0, 0, 0);
  const endVector = new ThreeVector3(0, -drop, totalRun);
  const pitch = new ThreeQuaternion().setFromUnitVectors(
    new ThreeVector3(0, 0, 1),
    endVector.clone().sub(startVector).normalize(),
  );
  const floorCenter = startVector.clone().add(endVector).multiplyScalar(0.5);
  const barMaterial = { restitution, friction: BAR_FRICTION };
  // Full width, edge to edge against the rails (per OBSTACLE-IDEAS'
  // "spanning the full bed width"), not stopping a marble radius short:
  // a gap there put a marble spawned near a rail on the bar's own corner
  // instead of its flat middle, and a corner contact snagged a multi-marble
  // sweep even where the same Module cleared every seed at one marble --
  // see rumbleStrip.test.ts's comment on the seed sweep this fixed.
  const barHalfExtents: Vector3 = [
    SCALE.channelWidth / 2 - RAIL_THICKNESS,
    barHeight / 2,
    BAR_THICKNESS / 2,
  ];
  const barShape = { kind: "cuboid" as const, halfExtents: barHalfExtents };

  const min: [number, number, number] = [...bounds.min];
  const max: [number, number, number] = [...bounds.max];

  for (let index = 0; index < barCount; index += 1) {
    const barZ = LEAD_IN + index * barSpacing;
    const localPoint = new ThreeVector3(
      0,
      FLOOR_THICKNESS / 2 + barHeight / 2,
      barZ - totalRun / 2,
    );
    const position = floorCenter.clone().add(localPoint.clone().applyQuaternion(pitch));
    const id = `bar-${index}`;

    const barCollider: ColliderSpec = {
      id,
      shape: barShape,
      position: toVector(position),
      rotation: toQuaternion(pitch),
      material: barMaterial,
    };
    colliders.push(barCollider);
    visuals.push({
      id,
      shape: barShape,
      material: BAR_VISUAL_MATERIAL,
      position: toVector(position),
      rotation: toQuaternion(pitch),
    });

    const barTop = position.y + barHeight / 2 + FLOOR_THICKNESS / 2;
    const barBottom = position.y - barHeight / 2 - FLOOR_THICKNESS / 2;
    min[1] = Math.min(min[1], barBottom);
    max[1] = Math.max(max[1], barTop);
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

export const rumbleStrip: ModuleDefinition<RumbleStripParams> = {
  id: "rumble-strip",
  role: "scatter",
  meta: { name: "Rumble strip", tags: ["scatter", "bumps"], params: PARAM_SCHEMA },
  buildSpec,
  // Static: nothing on the rumble strip moves after it's built.
  step: () => [],
};
