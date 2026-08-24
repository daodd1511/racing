import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { SCALE } from "../../race/scale";
import type { Quaternion, Vector3 } from "../../race/types";
import { FLOOR_THICKNESS, buildChannel } from "../geometry/channel";
import type {
  ColliderSpec,
  KinematicRotationMotion,
  ModuleDefinition,
  NumberParamField,
  ParamSchema,
  Spec,
  VisualSpec,
} from "../types";

// A cross-channel paddle axle meters a continuously arriving field into
// batches. Every blade carries the motion data needed by `step`, so the
// Validator and renderer can evaluate the exact same pure function from the
// same Spec.

export interface WindmillParams {
  readonly bladeCount: number;
  /** Hub-to-tip blade length, in meters. */
  readonly bladeLength: number;
  readonly bladeThickness: number;
  /** Radians per second around the cross-channel axle. */
  readonly angularVelocity: number;
  /** Perpendicular distance from the floor surface to the hub centre. */
  readonly hubHeight: number;
  /** Course-only placement grade; the Showcase keeps its isolated tuning. */
  readonly courseGrade?: number;
}

const CHANNEL_LENGTH = 1.2;
// A held pack needs enough downhill force to resume visibly as the paddle
// clears. The queue guardrail below rejects a grade that merely avoids a
// formal stall while allowing marbles to creep between blade passes.
const FLOOR_GRADE = 0.6;
const HUB_DISTANCE_FRACTION = 0.52;
const HUB_RADIUS = SCALE.marbleRadius * 1.25;
const HUB_HALF_AXLE_LENGTH = SCALE.channelWidth / 2 - 0.01;
const BLADE_LENGTH_MAX = 0.22;
const DEFAULT_BLADE_LENGTH = BLADE_LENGTH_MAX;
const DEFAULT_BLADE_THICKNESS = SCALE.marbleRadius * 0.85;
const MAX_BLADE_THICKNESS = SCALE.marbleRadius * 1.15;
// Keep the downward tip within one marble radius of the floor without
// penetrating it. A resting marble's centre sits one radius above the floor,
// so this gives the full-width paddle positive contact margin at bed level.
const FLOOR_GATE_CLEARANCE = SCALE.marbleRadius * 0.9;
// The default uses the maximum length so the paddle meters the Queue at the
// floor. The two parameters are pinned together below because ParamSchema
// cannot express this relationship for independently ranged fields.
const MINIMUM_HUB_HEIGHT = BLADE_LENGTH_MAX + FLOOR_GATE_CLEARANCE;
const DEFAULT_HUB_HEIGHT = MINIMUM_HUB_HEIGHT;
const MARBLE_DIAMETER = SCALE.marbleRadius * 2;
const FIXED_STEP_SECONDS = 1 / 60;
const TIP_STEP_SAFETY_FRACTION = 0.9;
// A blade tip travels `angularVelocity * bladeLength * dt`. Size the schema
// cap from the longest legal blade, leaving a 10% margin below one marble
// diameter per fixed step; dynamic marbles have CCD, but kinematic blades do
// not and cannot safely cross a marble in one solver update.
const MAX_ANGULAR_VELOCITY =
  (MARBLE_DIAMETER * TIP_STEP_SAFETY_FRACTION) / (BLADE_LENGTH_MAX * FIXED_STEP_SECONDS);

const CHANNEL_MATERIAL = { restitution: SCALE.defaultRestitution, friction: SCALE.defaultFriction };
const BLADE_MATERIAL = { restitution: 0.12, friction: 0.55 };
const HUB_MATERIAL = { restitution: 0.1, friction: 0.35 };
const BLADE_VISUAL_MATERIAL = { color: "#ee5d5d", metalness: 0.55, roughness: 0.28 };
const HUB_VISUAL_MATERIAL = { color: "#323b55", metalness: 0.7, roughness: 0.2 };

const DEFAULT_PARAMS: WindmillParams = Object.freeze({
  bladeCount: 4,
  bladeLength: DEFAULT_BLADE_LENGTH,
  bladeThickness: DEFAULT_BLADE_THICKNESS,
  angularVelocity: 1.1,
  hubHeight: DEFAULT_HUB_HEIGHT,
});

const PARAM_SCHEMA: ParamSchema = Object.freeze({
  fields: [
    {
      kind: "number",
      key: "bladeCount",
      label: "Blade count",
      min: 4,
      max: 8,
      step: 1,
      default: DEFAULT_PARAMS.bladeCount,
    } satisfies NumberParamField,
    {
      // `ParamSchema` has no cross-field constraints. A shorter blade cannot
      // share this floor-contact hub height, so keep this pair fixed until the
      // Showcase can express `hubHeight = bladeLength + clearance` directly.
      kind: "number",
      key: "bladeLength",
      label: "Blade length (m)",
      min: BLADE_LENGTH_MAX,
      max: BLADE_LENGTH_MAX,
      step: 0.01,
      default: DEFAULT_PARAMS.bladeLength,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "bladeThickness",
      label: "Blade thickness (m)",
      min: SCALE.marbleRadius * 0.65,
      max: MAX_BLADE_THICKNESS,
      step: 0.001,
      default: DEFAULT_PARAMS.bladeThickness,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "angularVelocity",
      label: "Angular velocity (rad/s)",
      min: 0.8,
      max: MAX_ANGULAR_VELOCITY,
      step: 0.1,
      default: DEFAULT_PARAMS.angularVelocity,
    } satisfies NumberParamField,
    {
      kind: "number",
      key: "hubHeight",
      label: "Hub height (m)",
      min: MINIMUM_HUB_HEIGHT,
      max: MINIMUM_HUB_HEIGHT,
      step: 0.005,
      default: DEFAULT_PARAMS.hubHeight,
    } satisfies NumberParamField,
  ],
});

function toVector(vector: ThreeVector3): Vector3 {
  return [vector.x, vector.y, vector.z];
}

function toQuaternion(quaternion: ThreeQuaternion): Quaternion {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function motionForBlade(
  axis: Vector3,
  pivot: Vector3,
  angularVelocity: number,
): KinematicRotationMotion {
  return { kind: "rotation", axis, pivot, angularVelocity };
}

function buildSpec(params: WindmillParams): Spec {
  const drop = CHANNEL_LENGTH * (params.courseGrade ?? FLOOR_GRADE);
  const channel = buildChannel(
    [{ start: [0, 0, 0], end: [0, -drop, CHANNEL_LENGTH], width: SCALE.channelWidth }],
    CHANNEL_MATERIAL,
    "windmill",
  );
  const colliders: ColliderSpec[] = [...channel.colliders];
  const visuals: VisualSpec[] = [...channel.visuals];

  const start = new ThreeVector3(0, 0, 0);
  const end = new ThreeVector3(0, -drop, CHANNEL_LENGTH);
  const pitch = new ThreeQuaternion().setFromUnitVectors(
    new ThreeVector3(0, 0, 1),
    end.clone().sub(start).normalize(),
  );
  const hubPosition = new ThreeVector3(
    0,
    params.hubHeight + FLOOR_THICKNESS / 2,
    CHANNEL_LENGTH * HUB_DISTANCE_FRACTION,
  ).applyQuaternion(pitch);
  const hubRotation = pitch
    .clone()
    .multiply(
      new ThreeQuaternion().setFromUnitVectors(
        new ThreeVector3(0, 1, 0),
        new ThreeVector3(1, 0, 0),
      ),
    );
  const hubShape = {
    kind: "cylinder" as const,
    radius: HUB_RADIUS,
    halfHeight: HUB_HALF_AXLE_LENGTH,
  };
  const hubCollider: ColliderSpec = {
    id: "windmill-hub",
    shape: hubShape,
    position: toVector(hubPosition),
    rotation: toQuaternion(hubRotation),
    material: HUB_MATERIAL,
  };
  colliders.push(hubCollider);
  visuals.push({
    id: hubCollider.id,
    shape: hubShape,
    material: HUB_VISUAL_MATERIAL,
    position: hubCollider.position,
    rotation: hubCollider.rotation,
  });

  const bladeShape = {
    kind: "cuboid" as const,
    halfExtents: [
      SCALE.channelWidth / 2 - 0.01,
      params.bladeThickness / 2,
      params.bladeLength / 2,
    ] as Vector3,
  };
  // The axle crosses the channel, so the broad paddle face sweeps along the
  // flow at bed level. Rotating around `tangent` made a vertical wheel that
  // left most of the channel open; the user chose this flow-gating geometry.
  const axis = toVector(new ThreeVector3(1, 0, 0).applyQuaternion(pitch).normalize());
  const pivot = toVector(hubPosition);

  for (let index = 0; index < params.bladeCount; index += 1) {
    const phase = (Math.PI * 2 * index) / params.bladeCount;
    const spin = new ThreeQuaternion().setFromAxisAngle(new ThreeVector3(1, 0, 0), phase);
    const rotation = pitch.clone().multiply(spin);
    const radialOffset = new ThreeVector3(0, 0, params.bladeLength / 2).applyQuaternion(spin);
    const position = hubPosition.clone().add(radialOffset.applyQuaternion(pitch));
    const id = `windmill-blade-${index}`;
    const collider: ColliderSpec = {
      id,
      kinematic: true,
      motion: motionForBlade(axis, pivot, params.angularVelocity),
      shape: bladeShape,
      position: toVector(position),
      rotation: toQuaternion(rotation),
      material: BLADE_MATERIAL,
    };
    colliders.push(collider);
    visuals.push({
      id,
      shape: bladeShape,
      material: BLADE_VISUAL_MATERIAL,
      position: collider.position,
      rotation: collider.rotation,
    });
  }

  const rotorEnvelopeRadius = params.bladeLength + params.bladeThickness;
  const min: [number, number, number] = [
    Math.min(channel.bounds.min[0], hubPosition.x - rotorEnvelopeRadius),
    Math.min(channel.bounds.min[1], hubPosition.y - rotorEnvelopeRadius),
    Math.min(channel.bounds.min[2], hubPosition.z - rotorEnvelopeRadius),
  ];
  const max: [number, number, number] = [
    Math.max(channel.bounds.max[0], hubPosition.x + rotorEnvelopeRadius),
    Math.max(channel.bounds.max[1], hubPosition.y + rotorEnvelopeRadius),
    Math.max(channel.bounds.max[2], hubPosition.z + rotorEnvelopeRadius),
  ];

  return {
    colliders,
    visuals,
    footprint: {
      cells: [],
      entry: channel.entry,
      exit: channel.exit,
      route: channel.route,
      bounds: { min, max },
    },
  };
}

function rotatingBladeTransforms(spec: Spec, tSeconds: number) {
  return spec.colliders.flatMap((collider) => {
    const motion = collider.motion;
    if (!collider.kinematic || motion?.kind !== "rotation") {
      return [];
    }
    if (tSeconds === 0) {
      return [{ id: collider.id, position: collider.position, rotation: collider.rotation }];
    }

    const rotationDelta = new ThreeQuaternion().setFromAxisAngle(
      new ThreeVector3(...motion.axis),
      motion.angularVelocity * tSeconds,
    );
    const pivot = new ThreeVector3(...motion.pivot);
    const position = new ThreeVector3(...collider.position)
      .sub(pivot)
      .applyQuaternion(rotationDelta)
      .add(pivot);
    const rotation = rotationDelta.multiply(new ThreeQuaternion(...collider.rotation));

    return [{ id: collider.id, position: toVector(position), rotation: toQuaternion(rotation) }];
  });
}

export const windmill: ModuleDefinition<WindmillParams> = {
  id: "windmill",
  role: "queue",
  meta: { name: "Windmill", tags: ["queue", "kinematic", "paddle"], params: PARAM_SCHEMA },
  buildSpec,
  step: rotatingBladeTransforms,
};
