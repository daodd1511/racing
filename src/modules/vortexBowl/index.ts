import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { revolveProfile, revolveProfileToPlates, type ProfileRing } from "../geometry/revolve";
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

// The roulette-wheel bowl -- see PLAN.md -> "The vortex bowl". A marble
// enters tangentially at the rim with real speed (built by the entry
// ramp's own drop, since the Feeder always spawns from rest -- see
// Feeder.tsx), orbits a tilted, banked basin, and drains through a hole at
// the shallow floor's inner end. The floor's radius-and-height both
// decrease together from rim to drain (see `buildBasinProfile`), so a
// marble losing speed necessarily drifts inward and down and MUST
// eventually pass the drain -- the Dwell bound PLAN.md calls for is this
// geometry, not a timer, and `step` stays `() => []` like the chute.
//
// Local space, pre-tilt: +Y up, the basin's revolution axis. `boardTilt`
// (one rotation about local +X, applied to every collider/visual/anchor as
// the very last step in `buildSpec`) is what gives gravity a persistent
// component *within* the basin plane -- without it, a marble orbiting an
// upright axisymmetric bowl has no preferred "downhill" side and just
// coasts at whatever speed friction leaves it, never producing PLAN.md's
// "accelerates down one side of the rim and decelerates up the other".
//
// Entry point (pre-tilt): angle 0 on the rim, i.e. world +Z tangent -- the
// ramp approaches from -Z and hands the marble off already moving in the
// direction the rim's own revolution increases angle.

export interface VortexBowlParams {
  readonly basinRadius: number;
  /** From vertical, radians -- 0 is a plain cylinder wall, larger banks the
   * wall outward as it rises (steeper for fast marbles to ride). */
  readonly rimBankAngle: number;
  /** Radians, about local +X -- see the module comment. */
  readonly boardTilt: number;
  /** Meters, the drain hole's diameter. */
  readonly exitGapWidth: number;
  readonly wallFriction: number;
  /** Dimensionless grade: |dHeight/dRadius| on the shallow floor, i.e. how
   * many meters the floor drops per meter of radius lost drifting inward. */
  readonly spiralPitch: number;
}

const DEFAULT_PARAMS: VortexBowlParams = Object.freeze({
  basinRadius: 0.22,
  rimBankAngle: 0.61, // ~35 deg
  boardTilt: 0.35, // ~20 deg
  exitGapWidth: 0.08,
  wallFriction: 0.12,
  spiralPitch: 0.25,
});

const PARAM_SCHEMA: ParamSchema = Object.freeze({
  fields: [
    {
      kind: "number",
      key: "basinRadius",
      label: "Basin radius (m)",
      min: 0.14,
      max: 0.3,
      step: 0.01,
      default: DEFAULT_PARAMS.basinRadius,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "rimBankAngle",
      label: "Rim bank angle (rad)",
      min: 0.3,
      max: 0.9,
      step: 0.02,
      default: DEFAULT_PARAMS.rimBankAngle,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "boardTilt",
      label: "Board tilt (rad)",
      min: 0.12,
      max: 0.6,
      step: 0.02,
      default: DEFAULT_PARAMS.boardTilt,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "exitGapWidth",
      label: "Exit gap width (m)",
      min: 0.05,
      max: 0.15,
      step: 0.005,
      default: DEFAULT_PARAMS.exitGapWidth,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "wallFriction",
      label: "Wall friction",
      min: 0.02,
      max: 0.4,
      step: 0.01,
      default: DEFAULT_PARAMS.wallFriction,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "spiralPitch",
      label: "Spiral pitch (grade)",
      min: 0.08,
      max: 0.6,
      step: 0.01,
      default: DEFAULT_PARAMS.spiralPitch,
    } satisfies NumberParamField,
  ],
});

// Raised from 6 (the trimesh attempt's value) to 30 -- with cuboid
// colliders, a marble genuinely orbits now instead of ejecting on contact
// (see docs/adr/0003-cuboid-colliders-under-revolved-visuals.md), but at 6
// marble radii the rim was too short to contain it: real toy-scale physics
// (a marble converts v^2/(2g) of its speed into climb height on the bank)
// lets a 2-3 m/s entry climb well over a 96 mm wall. Measured directly: at
// height-6, faster entries escaped over the rim in roughly half of the
// friction/speed combinations tried (exit radius far past the basin, not
// near the drain); at height-30, 12/12 combinations (friction 0.04-0.12,
// speed 1.5-3 m/s) drained within 3 cm of the drain radius every time --
// containment is solved. Orbit count is not: it lands around 1-2 (peak
// ~2.4), short of PLAN.md's guardrail of >=3. That is genuine remaining
// tuning, not a structural defect -- see EXECUTION.md's Phase 4 checklist.
const RIM_WALL_HEIGHT_RADII = 30;
const PROFILE_STEP_COUNT = 32;
const REVOLVE_SEGMENTS = 48; // Visual only -- smooth appearance, not collision safety.
// Collider plates don't need to look round; they need to keep a marble
// from catching a seam, which `revolveProfileToPlates` already guarantees
// on its own via the same marble-radius sagitta margin `revolveProfile`
// uses (see revolve.ts). Requesting the true floor (1) rather than
// reusing REVOLVE_SEGMENTS cuts the plate count by more than half for no
// loss of safety -- measured at this Module's defaults: 48 circumferential
// segments (the visual's count) would produce 1584 plates; the
// margin-derived minimum produces 693.
const COLLIDER_SEGMENTS_REQUEST = 1;
const BOWL_RESTITUTION = 0.05; // Low: a bouncy basin flings marbles out of orbit rather than settling them into it.

const ENTRY_APPROACH_LENGTH = 0.34;
const ENTRY_APPROACH_DROP = 0.18;
const ENTRY_INWARD_LEAN_RADIANS = 0.35; // ~20 deg off pure tangent -- see buildSpec's comment.
const ENTRY_CHANNEL_WIDTH = SCALE.marbleRadius * 4;
const ENTRY_FLOOR_THICKNESS = 0.01;
const ENTRY_RAIL_THICKNESS = 0.006;
const ENTRY_RAIL_HEIGHT = 0.03;
const ROUTE_ORBITS = 3;

function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/** The basin's cross-section, outer/top to inner/bottom, per
 * `revolveProfile`'s required ring order. Blends the local |dHeight/dRadius|
 * from the rim wall's steep slope to the floor's shallow `spiralPitch`
 * grade across a band straddling `basinRadius` -- an angle blend, not a
 * position lerp, so there is no slope discontinuity at the wall/floor
 * junction for a marble to catch or settle on. A position lerp there was
 * exactly the old vanilla bowl's funnel-geometry failure. */
export interface BasinProfile {
  readonly rings: readonly ProfileRing[];
  /** Where the entry ramp hands a marble off -- one ring INSIDE the mesh's
   * outer edge (`rings[1]`, not `rings[0]`). A marble spawned exactly on
   * `rings[0]` sits precisely on the trimesh's outer boundary vertex, and
   * measured out (see the sweep behind this file's other comments) to a
   * ball in total, permanent freefall from frame one -- zero collision
   * response, not a weak or late one -- while a ball spawned a few
   * centimeters further in, safely inside a triangle rather than on its
   * boundary, collides normally. This is the exact failure
   * `validateModule.ts` already documents for the chute's entry anchor
   * (spawning exactly on a collider's geometric edge instead of a margin
   * inside it), showing up again here because a revolved mesh's own edge
   * is where the natural entry point sits. The fix there was a spawn
   * margin the Feeder adds at runtime; here the mesh itself carries the
   * margin, because the entry ramp's collider -- not a runtime offset --
   * is what actually has to land inside the basin's covered area. */
  readonly entryRing: ProfileRing;
}

const RIM_OUTER_MARGIN_RADII = 4;

// Exported so tests (this module's guardrail test and the tuning probe
// behind the comments below) can read the profile's actual rings directly
// instead of re-deriving them -- exactly that kind of independent
// re-derivation previously drifted from what `buildSpec` itself used (see
// the entry-point comment in `buildSpec`).
export function buildBasinProfile(params: VortexBowlParams): BasinProfile {
  const { basinRadius, rimBankAngle, exitGapWidth, spiralPitch } = params;
  const drainRadius = exitGapWidth / 2;
  const rimHeight = SCALE.marbleRadius * RIM_WALL_HEIGHT_RADII;
  const wallSlope = 1 / Math.tan(rimBankAngle);
  const topRadius = basinRadius + rimHeight / wallSlope;
  const entryRing: ProfileRing = { radius: topRadius, height: rimHeight };

  // The margin ring continues the wall's own slope outward (same
  // `wallSlope`, not flat) rather than adding a level ledge -- a flat
  // ledge meeting a steep wall is exactly the sharp angle discontinuity
  // `buildBasinProfile`'s own module comment warns against, and measured
  // out to a marble launching off the wall a few frames after the corner
  // (not settling, not rolling through it) every time, regardless of
  // tilt, bank angle, or entry speed -- the same failure class as the
  // wall/floor junction, just introduced fresh by this margin.
  const marginDistance = SCALE.marbleRadius * RIM_OUTER_MARGIN_RADII;
  const rings: ProfileRing[] = [
    { radius: topRadius + marginDistance, height: rimHeight + marginDistance * wallSlope },
    entryRing,
  ];

  const floorRun = basinRadius - drainRadius;
  // Wide on purpose, not a narrow band right at basinRadius: a transition
  // that bends from the wall's steep slope to the floor's shallow one
  // within a few centimeters has a small local radius of curvature, and a
  // marble following it needs centripetal acceleration (v^2/R) that a
  // narrow bend can't supply from gravity alone at any real orbiting
  // speed -- it launches off the surface instead of following it, exactly
  // like a skateboarder going too fast over a ramp that flattens out too
  // quickly. Measured directly: a narrow band (~4 cm) launched a 1.5 m/s
  // marble into unbroken freefall about 0.3 s after entry, well inside
  // the wall region, every time, regardless of tilt, bank angle, or entry
  // speed tried. Spreading the bend across nearly the whole floor gives
  // it a radius of curvature an orbiting marble can actually follow.
  const transitionHalfWidth = floorRun * 0.65;
  const step = (topRadius - drainRadius) / PROFILE_STEP_COUNT;

  let height = rimHeight;
  for (let i = 1; i <= PROFILE_STEP_COUNT; i += 1) {
    const radius = topRadius - step * i;
    const distanceFromJunction = radius - basinRadius;
    const blend = smoothstep(0.5 - distanceFromJunction / (2 * transitionHalfWidth));
    // The floor's own target slope grows as 1/radius, not a constant --
    // `spiralPitch` is its value at `basinRadius` specifically. A constant
    // slope (a true cone) pulls a marble inward just as hard near the rim
    // as near the drain, which measured out (see the sweep behind this
    // comment) to under 1.5 orbits before either escaping or getting
    // captured, regardless of tilt/friction/entry speed -- nothing like
    // PLAN.md's "orbit several times before draining". A gravity-well
    // shape -- gentle where the marble spends most of its time orbiting,
    // steep only once it has actually decayed close to the drain -- is
    // what lets speed matter more than position, which is what produces
    // the orbit count.
    const targetFloorSlope = (spiralPitch * basinRadius) / Math.max(radius, drainRadius);
    const slope = wallSlope + (targetFloorSlope - wallSlope) * blend;
    height -= step * slope;
    rings.push({ radius, height });
  }

  return { rings, entryRing };
}

function toVector(v: ThreeVector3): Vector3 {
  return [v.x, v.y, v.z];
}

function toQuaternion(q: ThreeQuaternion): Quaternion {
  return [q.x, q.y, q.z, q.w];
}

function fromVector(v: Vector3): ThreeVector3 {
  return new ThreeVector3(v[0], v[1], v[2]);
}

function fromQuaternion(q: Quaternion): ThreeQuaternion {
  return new ThreeQuaternion(q[0], q[1], q[2], q[3]);
}

interface LocalPart {
  readonly id: string;
  readonly shape: ColliderSpec["shape"];
  readonly position: ThreeVector3;
  readonly rotation: ThreeQuaternion;
  readonly visualColor: string;
  readonly metalness: number;
  readonly roughness: number;
}

interface EntryRamp {
  readonly parts: readonly LocalPart[];
  readonly entryPosition: ThreeVector3;
  readonly entryTangent: ThreeVector3;
  readonly entryUp: ThreeVector3;
}

/** Builds the straight entry ramp (floor + two rails, same construction as
 * the chute) ending exactly at the rim's entry point with a matching
 * tangent, so a marble handed off from the ramp continues in the
 * direction the basin's own rotation increases angle, plus the Footprint
 * entry anchor at the ramp's own start -- computed once here rather than
 * separately in `buildSpec`, so the anchor can never drift from the
 * geometry it describes. Its own drop is fixed, not one of the six exposed
 * params: the Feeder always spawns a marble at rest (see Feeder.tsx), so
 * this is the only place the marble's initial orbital speed comes from. */
function buildEntryRamp(rimEntryPosition: ThreeVector3, rimTangent: ThreeVector3): EntryRamp {
  const horizontalRun = Math.sqrt(
    Math.max(0, ENTRY_APPROACH_LENGTH ** 2 - ENTRY_APPROACH_DROP ** 2),
  );
  const entryPosition = rimEntryPosition
    .clone()
    .add(new ThreeVector3(0, ENTRY_APPROACH_DROP, 0))
    .sub(rimTangent.clone().multiplyScalar(horizontalRun));

  const pitch = new ThreeQuaternion().setFromUnitVectors(
    new ThreeVector3(0, 0, 1),
    rimEntryPosition.clone().sub(entryPosition).normalize(),
  );
  const up = new ThreeVector3(0, 1, 0).applyQuaternion(pitch).normalize();
  const tangent = new ThreeVector3(0, 0, 1).applyQuaternion(pitch).normalize();

  const floorCenter = entryPosition.clone().add(rimEntryPosition).multiplyScalar(0.5);
  const parts: LocalPart[] = [
    {
      id: "entry-floor",
      shape: {
        kind: "cuboid",
        halfExtents: [
          ENTRY_CHANNEL_WIDTH / 2,
          ENTRY_FLOOR_THICKNESS / 2,
          ENTRY_APPROACH_LENGTH / 2,
        ],
      },
      position: floorCenter,
      rotation: pitch,
      visualColor: "#e8e2d0",
      metalness: 0.05,
      roughness: 0.25,
    },
  ];

  for (const side of [-1, 1] as const) {
    const lateral = ENTRY_CHANNEL_WIDTH / 2 + ENTRY_RAIL_THICKNESS / 2;
    const railCenter = floorCenter
      .clone()
      .add(new ThreeVector3(side * lateral, 0, 0))
      .add(up.clone().multiplyScalar(ENTRY_RAIL_HEIGHT / 2));
    parts.push({
      id: side < 0 ? "entry-rail-left" : "entry-rail-right",
      shape: {
        kind: "cuboid",
        halfExtents: [ENTRY_RAIL_THICKNESS / 2, ENTRY_RAIL_HEIGHT / 2, ENTRY_APPROACH_LENGTH / 2],
      },
      position: railCenter,
      rotation: pitch,
      visualColor: "#d8ff42",
      metalness: 0.05,
      roughness: 0.2,
    });
  }

  return { parts, entryPosition, entryTangent: tangent, entryUp: up };
}

function buildSpec(params: VortexBowlParams): Spec {
  const { boardTilt } = params;

  const basinProfile = buildBasinProfile(params);
  // Two emitters over the identical rings, per
  // docs/adr/0003-cuboid-colliders-under-revolved-visuals.md: the smooth
  // trimesh renders (a concave revolved trimesh collider ejected every
  // marble that reached it with speed -- see EXECUTION.md's Phase 4 note),
  // and a ring of flat cuboid plates -- the chute's own collider shape,
  // already proven at this scale -- carries the marble.
  const basinVisualShape = revolveProfile(basinProfile.rings, REVOLVE_SEGMENTS, SCALE.marbleRadius);
  const basinPlates = revolveProfileToPlates(
    basinProfile.rings,
    COLLIDER_SEGMENTS_REQUEST,
    SCALE.marbleRadius,
  );
  const basinMaterial = { restitution: BOWL_RESTITUTION, friction: params.wallFriction };

  // The entry point is the profile's own `entryRing`, one ring inside the
  // mesh's actual outer edge -- not the edge itself, and not a separately
  // re-derived (basinRadius, rimHeight) guess. Both of those previously
  // put the ramp's endpoint (and every spawned marble) exactly on the
  // trimesh's boundary vertex or outside it entirely, which produced total
  // freefall -- zero collision, not a weak one -- found only by dumping
  // raw per-frame trajectories, not by any test that watches for a
  // specific exception. See `BasinProfile.entryRing`'s comment.
  const rimEntryPosition = new ThreeVector3(
    basinProfile.entryRing.radius,
    basinProfile.entryRing.height,
    0,
  );
  // Aimed mostly along the rim's own circumferential tangent, but leaning
  // inward by ENTRY_INWARD_LEAN_RADIANS -- a marble arriving on a PURE
  // tangent has essentially no velocity component pointed into the wall
  // (the wall's own inward-and-up normal), so it only grazes the surface
  // at the handoff point instead of being caught by it: measured directly,
  // one weak deflection (z-speed barely dented) followed by unbroken
  // ballistic freefall, not an orbit. The lean gives it something to
  // actually push against.
  const entryAim = new ThreeVector3(0, 0, 1)
    .multiplyScalar(Math.cos(ENTRY_INWARD_LEAN_RADIANS))
    .add(new ThreeVector3(-1, 0, 0).multiplyScalar(Math.sin(ENTRY_INWARD_LEAN_RADIANS)))
    .normalize();
  const entryRamp = buildEntryRamp(rimEntryPosition, entryAim);

  // Applied last, to every position and rotation alike -- see the module
  // comment on why board tilt has to reach every collider/visual/anchor
  // uniformly rather than only the basin.
  const tiltQuat = new ThreeQuaternion().setFromAxisAngle(new ThreeVector3(1, 0, 0), boardTilt);
  const tilt = (v: ThreeVector3) => v.clone().applyQuaternion(tiltQuat);
  const tiltRot = (q: ThreeQuaternion) => tiltQuat.clone().multiply(q);

  // One collider per plate, all sharing the same fixed rigid body via
  // <ModuleColliders> (Phase 3) -- Rapier's broad-phase cost for a static
  // collider count like this is negligible, since only the few marbles
  // actually touching the basin at once ever generate a contact.
  const colliders: ColliderSpec[] = basinPlates.map((plate, index) => ({
    id: `basin-plate-${index}`,
    shape: { kind: "cuboid", halfExtents: plate.halfExtents },
    position: toVector(tilt(fromVector(plate.position))),
    rotation: toQuaternion(tiltRot(fromQuaternion(plate.rotation))),
    material: basinMaterial,
  }));
  const visuals: VisualSpec[] = [
    {
      id: "basin",
      shape: basinVisualShape,
      // Glossy toy-red plastic, matching the reference video's bowl.
      material: { color: "#e0293d", metalness: 0.05, roughness: 0.2 },
      position: toVector(tilt(new ThreeVector3(0, 0, 0))),
      rotation: toQuaternion(tiltRot(new ThreeQuaternion())),
    },
  ];

  for (const part of entryRamp.parts) {
    const material = { restitution: SCALE.defaultRestitution, friction: SCALE.defaultFriction };
    colliders.push({
      id: part.id,
      shape: part.shape,
      position: toVector(tilt(part.position)),
      rotation: toQuaternion(tiltRot(part.rotation)),
      material,
    });
    visuals.push({
      id: part.id,
      shape: part.shape,
      material: { color: part.visualColor, metalness: part.metalness, roughness: part.roughness },
      position: toVector(tilt(part.position)),
      rotation: toQuaternion(tiltRot(part.rotation)),
    });
  }

  // The drain: `exitPlaneDistance` (shared with the chute and the Feeder)
  // is a single infinite plane test, `dot(position - exit.position,
  // exit.tangent) >= 0` -- exactly right for a chute, where the rails
  // bound every other direction so nothing exists to false-trigger it.
  // Nothing bounds a bowl that way: a marble still legitimately orbiting
  // at full rim radius is `~topRadius * sin(boardTilt)` lower, in world Y,
  // on the tilted-away side of its own orbit than on the near side, which
  // (measured directly: a marble spawned at the rim crossed the plane in
  // ~13 frames, before completing even a fifth of one orbit) swamps the
  // basin's own shallow drain depth if the tangent is tilted along with
  // every other collider/anchor. `exit.position` still needs the real
  // (tilted) drain location, but `exit.tangent` deliberately stays plain
  // world-down: falling through a hole is a world-gravity event, not a
  // module-local one, and world-down is the one direction the rim's own
  // orbit -- tilted or not -- never crosses on its own.
  const drainHeight = basinProfile.rings[basinProfile.rings.length - 1].height;
  const exitLocalPosition = new ThreeVector3(0, drainHeight, 0);
  const exitWorldTangent = new ThreeVector3(0, -1, 0);
  const exitLocalUp = new ThreeVector3(1, 0, 0);

  const halfSpan = basinProfile.rings[0].radius + ENTRY_APPROACH_LENGTH;
  const route: Vector3[] = [toVector(tilt(entryRamp.entryPosition))];
  const routeRings = basinProfile.rings.slice(1);
  routeRings.forEach((ring, index) => {
    const progress = index / Math.max(1, routeRings.length - 1);
    const angle = progress * ROUTE_ORBITS * Math.PI * 2;
    route.push(
      toVector(
        tilt(
          new ThreeVector3(
            ring.radius * Math.cos(angle),
            ring.height,
            ring.radius * Math.sin(angle),
          ),
        ),
      ),
    );
  });
  route.push(toVector(tilt(exitLocalPosition)));
  const footprint: Footprint = {
    cells: [],
    entry: {
      position: toVector(tilt(entryRamp.entryPosition)),
      tangent: toVector(tilt(entryRamp.entryTangent).normalize()),
      up: toVector(tilt(entryRamp.entryUp).normalize()),
    },
    exit: {
      position: toVector(tilt(exitLocalPosition)),
      tangent: toVector(exitWorldTangent),
      up: toVector(tilt(exitLocalUp).normalize()),
    },
    route,
    bounds: {
      min: [-halfSpan, -halfSpan, -halfSpan],
      max: [halfSpan, halfSpan, halfSpan],
    },
  };

  return { colliders, footprint, visuals };
}

export const vortexBowl: ModuleDefinition<VortexBowlParams> = {
  id: "vortex-bowl",
  role: "shuffle",
  meta: { name: "Vortex bowl", tags: ["shuffle", "roulette"], params: PARAM_SCHEMA },
  buildSpec,
  // Static: the Dwell bound comes from the floor's geometry, not a moving
  // part or a timer -- see the module comment and PLAN.md -> "The vortex
  // bowl".
  step: () => [],
};

export const DEFAULT_VORTEX_BOWL_PARAMS = DEFAULT_PARAMS;
