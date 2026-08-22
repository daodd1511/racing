import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { SCALE } from "../../race/scale";
import type { Vector3 } from "../../race/types";
import { buildChannel } from "../geometry/channel";
import { sweepProfileToMesh, sweepProfileToPlates } from "../geometry/sweep";
import type {
  ColliderSpec,
  ModuleDefinition,
  NumberParamField,
  ParamSchema,
  Spec,
  VisualSpec,
} from "../types";

// A rolling floor that compresses and stretches the field without a barrier,
// per OBSTACLE-IDEAS.md -> "Wave / whoops section". The surface is curved,
// so ADR 0003 applies: the one smooth trimesh is visual-only and marbles ride
// the fixed cuboid plates emitted from the exact same sampled centreline.

export interface WhoopsParams {
  readonly amplitude: number;
  readonly wavelength: number;
  readonly length: number;
  readonly grade: number;
  readonly width: number;
}

const DEFAULT_PARAMS: WhoopsParams = Object.freeze({
  // The old design's 0.3 m / 20 m dimensions scaled to this project's
  // 22:1 toy scale: a 14 mm wave across four 30 cm humps.
  amplitude: 0.014,
  wavelength: 0.3,
  length: 1.2,
  grade: 0.55,
  width: SCALE.channelWidth,
});

const PARAM_SCHEMA: ParamSchema = Object.freeze({
  fields: [
    {
      kind: "number",
      key: "amplitude",
      label: "Amplitude (m)",
      // Kept below `grade * wavelength / (2π)` at every slider extreme,
      // so the entry tangent stays downhill. A stationary marble at the
      // first sine sample otherwise rolls back out of the Module instead of
      // entering the first hump.
      min: 0.006,
      max: 0.016,
      step: 0.001,
      default: DEFAULT_PARAMS.amplitude,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "wavelength",
      label: "Wavelength (m)",
      min: 0.28,
      max: 0.5,
      step: 0.01,
      default: DEFAULT_PARAMS.wavelength,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "length",
      label: "Length (m)",
      min: 0.6,
      max: 1.8,
      step: 0.05,
      default: DEFAULT_PARAMS.length,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "grade",
      label: "Grade",
      min: 0.45,
      max: 0.7,
      step: 0.01,
      default: DEFAULT_PARAMS.grade,
    } satisfies NumberParamField,
    {
      // The Validator and Showcase Feeder both spread a pack across
      // SCALE.channelWidth regardless of a Module's local width. Letting
      // this Module shrink below that would spawn marbles beyond its rails;
      // until the shared Feeder contract gains a width, pin the safe value.
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

const MAX_SAGITTA_FRACTION_OF_MARBLE_RADIUS = 0.25;
// The visual needs no separate high-resolution request: its shared indexed
// mesh is smooth-lit by the renderer, while the collision safety floor below
// resolves the shape far more accurately than a visual-only convenience
// setting would. This mirrors vortexBowl's `COLLIDER_SEGMENTS_REQUEST = 1`:
// do not create collision plates at a visual segment count without a physics
// reason for each one.
const COLLIDER_SEGMENTS_REQUEST = 1;
const FLOOR_MATERIAL = { restitution: 0.1, friction: 0.06 };
const FLOOR_VISUAL_MATERIAL = { color: "#5b8cff", metalness: 0.08, roughness: 0.24 };

function cuboidCorners(collider: ColliderSpec): ThreeVector3[] {
  if (collider.shape.kind !== "cuboid") {
    throw new Error("whoops only builds cuboid colliders");
  }

  const { halfExtents } = collider.shape;
  const position = new ThreeVector3(...collider.position);
  const rotation = new ThreeQuaternion(...collider.rotation);
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

function boundsFor(colliders: readonly ColliderSpec[]): Spec["footprint"]["bounds"] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const collider of colliders) {
    for (const corner of cuboidCorners(collider)) {
      min[0] = Math.min(min[0], corner.x);
      min[1] = Math.min(min[1], corner.y);
      min[2] = Math.min(min[2], corner.z);
      max[0] = Math.max(max[0], corner.x);
      max[1] = Math.max(max[1], corner.y);
      max[2] = Math.max(max[2], corner.z);
    }
  }

  return { min, max };
}

/** Conservative minimum sample count for the sinusoid's highest-curvature
 * point. For y = A sin(kz), its tightest curvature radius is 1 / (A k²).
 * A circular arc of radius r has sagitta r * (1 - cos(s / (2r))); solving
 * that at the marble-radius margin gives the longest safe arc. Dividing once
 * more by the surface's maximum slope converts it to a safe Z-space sample
 * span, which is what the centreline generator uses. */
function centrelineSegmentCount(params: WhoopsParams): number {
  const waveNumber = (Math.PI * 2) / params.wavelength;
  const minimumRadius = 1 / (params.amplitude * waveNumber * waveNumber);
  const maxSagitta = SCALE.marbleRadius * MAX_SAGITTA_FRACTION_OF_MARBLE_RADIUS;
  const maximumArcSpan =
    2 * minimumRadius * Math.acos(Math.max(-1, 1 - Math.min(2, maxSagitta / minimumRadius)));
  const maximumSlope = params.grade + params.amplitude * waveNumber;
  const maximumZSpan = maximumArcSpan / Math.sqrt(1 + maximumSlope * maximumSlope);

  return Math.max(COLLIDER_SEGMENTS_REQUEST, Math.ceil(params.length / maximumZSpan));
}

function buildCentreline(params: WhoopsParams): readonly Vector3[] {
  const segmentCount = centrelineSegmentCount(params);
  const waveNumber = (Math.PI * 2) / params.wavelength;

  return Array.from({ length: segmentCount + 1 }, (_unused, index) => {
    const distance = (params.length * index) / segmentCount;
    return [
      0,
      -params.grade * distance + params.amplitude * Math.sin(waveNumber * distance),
      distance,
    ];
  });
}

function buildSpec(params: WhoopsParams): Spec {
  const centreline = buildCentreline(params);
  // `buildChannel` remains the source for the two rails: passing the same
  // consecutive centreline samples makes their centres follow every crest
  // rather than the undisplaced straight grade (the old design's floating-
  // rail failure). Its floor cuboids are deliberately discarded because the
  // sweep plates, not chords at a separate resolution, are the floor.
  const railChannel = buildChannel(
    centreline
      .slice(0, -1)
      .map((start, index) => ({ start, end: centreline[index + 1], width: params.width })),
    FLOOR_MATERIAL,
    "whoops",
  );
  const rails = railChannel.colliders.filter(
    (collider) => !collider.id.startsWith("whoops-floor-"),
  );
  const railVisuals = railChannel.visuals.filter(
    (visual) => !visual.id.startsWith("whoops-floor-"),
  );
  const plates = sweepProfileToPlates(centreline, params.width, SCALE.marbleRadius, "whoops");
  const plateColliders: ColliderSpec[] = plates.map(({ id, halfExtents, position, rotation }) => ({
    id,
    shape: { kind: "cuboid", halfExtents },
    position,
    rotation,
    material: FLOOR_MATERIAL,
  }));
  const visuals: VisualSpec[] = [
    ...railVisuals,
    {
      id: "whoops-floor",
      shape: sweepProfileToMesh(centreline, params.width),
      material: FLOOR_VISUAL_MATERIAL,
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    },
  ];
  const colliders = [...rails, ...plateColliders];

  return {
    colliders,
    visuals,
    footprint: {
      cells: [],
      entry: railChannel.entry,
      exit: railChannel.exit,
      route: centreline,
      bounds: boundsFor(colliders),
    },
  };
}

export const whoops: ModuleDefinition<WhoopsParams> = {
  id: "whoops",
  role: "shuffle",
  meta: { name: "Whoops", tags: ["shuffle", "waves"], params: PARAM_SCHEMA },
  buildSpec,
  // Static: the floor's shape is fully captured by the pure Spec.
  step: () => [],
};
