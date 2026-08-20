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
      // (amended 2026-08-20, twice) `max` lowered from `marbleRadius * 1.5`
      // to `marbleRadius * 0.5`, then to `marbleRadius * 0.4`: a resting
      // marble's own center sits one radius above the floor, so a bar
      // approaching that height puts its top at or above the marble's
      // center -- past the point where rolling can carry it over, a
      // geometric climbability limit no amount of grade or speed
      // compensates for. `marbleRadius * 0.8` alone (every other param at
      // its default) stalled 98/100 marbles regardless of the grade-scaling
      // compensation below. The first correction to `marbleRadius * 0.5`
      // was verified against a stale `barSpacing` value that didn't match
      // this Module's real default and still stalled 4/100 at the true
      // default spacing (`MARBLE_DIAMETER * 3`) -- caught by this phase's
      // fresh review, not by the sweep that was supposed to catch it.
      // `marbleRadius * 0.4` cleared zero-stall, real-margin
      // `minDisplacementPerSecond` across every single- and paired-extreme
      // combination re-verified against the actual default `barSpacing`.
      kind: "number",
      key: "barHeight",
      label: "Bar height (m)",
      min: SCALE.marbleRadius * 0.2,
      max: SCALE.marbleRadius * 0.4,
      step: 0.001,
      default: DEFAULT_PARAMS.barHeight,
    } satisfies NumberParamField,
    {
      // (amended 2026-08-20) `min` raised from 0.05: combined with a tall
      // bar, a near-zero restitution absorbs essentially all of a marble's
      // energy on every contact -- closer to "the bar is inelastic clay"
      // than a rigid rumble strip, and no grade this Module's schema keeps
      // legible compensates for that repeated `barCount` times over. A real
      // rumble strip is rigid; 0.15 keeps a genuine low-bounce feel without
      // the degenerate case.
      kind: "number",
      key: "restitution",
      label: "Restitution",
      min: 0.15,
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
const BASE_FLOOR_GRADE = 0.42;
// (amended 2026-08-20) `FLOOR_GRADE` alone was tuned against this Module's
// *default* `barHeight`; at the schema's own maximum (5x the default) with
// `restitution` at its own schema minimum, every marble stalled outright at
// the base grade -- a taller bar costs more energy to clear every single
// time, `barCount` times over, and a low-restitution material returns less
// of that energy on each contact. Scaling the grade by both ratios keeps
// the per-bar energy margin roughly constant across the full param range,
// rather than only at the one combination this Module happened to ship
// tuned against.
// Capped at steepZigzag's own schema maximum grade (0.8, the steepest grade
// this codebase's Modules use anywhere -- chute's own grade schema tops out
// at 0.6): an uncapped scale
// factor against both ratios at once (schema-max barHeight combined with
// schema-min restitution) produces a grade over 15 -- a near-vertical drop
// whose own geometry stops being a legible "rumble strip" long before the
// stall question even matters. The cap keeps the compensation meaningful
// across realistic single-slider extremes while refusing to chase the one
// combined edge case into an absurd shape.
const MAX_FLOOR_GRADE = 0.8;

function effectiveFloorGrade(barHeight: number, restitution: number): number {
  const heightRatio = barHeight / DEFAULT_BAR_HEIGHT;
  const restitutionRatio = DEFAULT_PARAMS.restitution / Math.max(restitution, 0.01);
  return Math.min(MAX_FLOOR_GRADE, BASE_FLOOR_GRADE * heightRatio * restitutionRatio);
}
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

/** The 8 corners of a cuboid with the given half-extents, position, and
 * rotation -- the same helper `channel.ts` and `steepZigzag/index.ts` use to
 * accumulate an axis-aligned `bounds` box that actually accounts for a
 * rotated collider's true extent. */
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

function buildSpec(params: RumbleStripParams): Spec {
  const { barCount, barSpacing, barHeight, restitution } = params;
  const totalRun = LEAD_IN + Math.max(0, barCount - 1) * barSpacing + LEAD_OUT;
  const drop = totalRun * effectiveFloorGrade(barHeight, restitution);
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

    // (amended 2026-08-20) Full 8-corner transform under the channel's
    // pitch, not a plain-vertical-Y shortcut: the channel's own slope tilt
    // mixes Y and Z for every bar once graded at all, the same way it does
    // for `buildChannel`'s own floor and rails.
    accumulate(cuboidCorners(barHalfExtents, position, pitch));
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
