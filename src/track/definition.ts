import type { Quaternion, Vector3 } from "../race/types";

export interface TrackMaterial {
  readonly restitution: number;
  readonly friction: number;
}

export type TrackBoxKind =
  | "containment-wall"
  | "helix-ramp"
  | "helix-rail"
  | "funnel-panel"
  | "finish-tube"
  | "finish-basin";

export interface TrackBox {
  readonly kind: TrackBoxKind;
  readonly center: Vector3;
  readonly rotation: Quaternion;
  readonly halfExtents: Vector3;
  readonly material: TrackMaterial;
}

export interface TrackPeg {
  readonly center: Vector3;
  readonly radius: number;
  readonly material: TrackMaterial;
}

export interface TrackConfig {
  readonly containmentRadius: number;
  readonly towerTop: number;
  readonly helixTop: number;
  readonly helixBottom: number;
  readonly helixTurns: number;
  readonly helixSegmentsPerTurn: number;
  readonly rampRadius: number;
  readonly rampHalfWidth: number;
  readonly innerRailRadius: number;
  readonly innerRailHeight: number;
  readonly pegTop: number;
  readonly pegBottom: number;
  readonly pegLayerGap: number;
  readonly pegRadius: number;
  readonly pegFieldRadius: number;
  readonly funnelTop: number;
  readonly funnelBottom: number;
  readonly funnelMouthRadius: number;
  readonly funnelThroatRadius: number;
  readonly funnelPanelCount: number;
  readonly finishTubeBottom: number;
  readonly finishTubeRadius: number;
  readonly finishY: number;
  readonly basinY: number;
  readonly marbleRadius: number;
  readonly startSlotCount: number;
  readonly startSlotsPerRow: number;
}

export interface TrackDefinition {
  readonly config: TrackConfig;
  readonly boxes: readonly TrackBox[];
  readonly pegs: readonly TrackPeg[];
  readonly startSlots: readonly Vector3[];
  readonly finishY: number;
}

export const DEFAULT_TRACK_CONFIG: TrackConfig = Object.freeze({
  containmentRadius: 6,
  towerTop: 44,
  helixTop: 40,
  helixBottom: 22,
  helixTurns: 4,
  helixSegmentsPerTurn: 32,
  rampRadius: 4.8,
  rampHalfWidth: 1.2,
  innerRailRadius: 3.6,
  innerRailHeight: 1,
  pegTop: 22,
  pegBottom: 10.5,
  pegLayerGap: 1.45,
  pegRadius: 0.42,
  pegFieldRadius: 5,
  funnelTop: 10.5,
  funnelBottom: 3.4,
  funnelMouthRadius: 6,
  funnelThroatRadius: 1.35,
  funnelPanelCount: 32,
  finishTubeBottom: 1.6,
  finishTubeRadius: 1.5,
  finishY: 1.1,
  basinY: 0,
  marbleRadius: 0.35,
  startSlotCount: 15,
  startSlotsPerRow: 3,
});

const CONTAINMENT_MATERIAL: TrackMaterial = Object.freeze({
  restitution: 0.1,
  friction: 0.3,
});
const TRACK_MATERIAL: TrackMaterial = Object.freeze({
  restitution: 0.18,
  friction: 0.45,
});
const RAIL_MATERIAL: TrackMaterial = Object.freeze({
  restitution: 0.12,
  friction: 0.3,
});
const PEG_MATERIAL: TrackMaterial = Object.freeze({
  restitution: 0.42,
  friction: 0.2,
});
const FUNNEL_MATERIAL: TrackMaterial = Object.freeze({
  restitution: 0.12,
  friction: 0.28,
});

function add(left: Vector3, right: Vector3): Vector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(vector: Vector3, factor: number): Vector3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function midpoint(left: Vector3, right: Vector3): Vector3 {
  return scale(add(left, right), 0.5);
}

function length(vector: Vector3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: Vector3): Vector3 {
  const vectorLength = length(vector);

  if (vectorLength === 0) {
    throw new Error("Cannot normalize a zero-length vector");
  }

  return scale(vector, 1 / vectorLength);
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function rotateAroundY(radians: number): Quaternion {
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}

function quaternionFromBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): Quaternion {
  const m00 = xAxis[0];
  const m01 = yAxis[0];
  const m02 = zAxis[0];
  const m10 = xAxis[1];
  const m11 = yAxis[1];
  const m12 = zAxis[1];
  const m20 = xAxis[2];
  const m21 = yAxis[2];
  const m22 = zAxis[2];
  const trace = m00 + m11 + m22;

  if (trace > 0) {
    const root = Math.sqrt(trace + 1) * 2;
    return [(m21 - m12) / root, (m02 - m20) / root, (m10 - m01) / root, root / 4];
  }

  if (m00 > m11 && m00 > m22) {
    const root = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return [root / 4, (m01 + m10) / root, (m02 + m20) / root, (m21 - m12) / root];
  }

  if (m11 > m22) {
    const root = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return [(m01 + m10) / root, root / 4, (m12 + m21) / root, (m02 - m20) / root];
  }

  const root = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return [(m02 + m20) / root, (m12 + m21) / root, root / 4, (m10 - m01) / root];
}

function helixPoint(config: TrackConfig, t: number): Vector3 {
  const angle = t * config.helixTurns * Math.PI * 2;
  const y = config.helixTop - t * (config.helixTop - config.helixBottom);

  return [config.rampRadius * Math.cos(angle), y, config.rampRadius * Math.sin(angle)];
}

function assertTrackConfig(config: TrackConfig): void {
  for (const value of Object.values(config)) {
    if (!Number.isFinite(value)) {
      throw new RangeError("Track configuration values must be finite numbers");
    }
  }

  const positiveValues = [
    config.containmentRadius,
    config.towerTop,
    config.helixTop,
    config.helixBottom,
    config.helixTurns,
    config.helixSegmentsPerTurn,
    config.rampRadius,
    config.rampHalfWidth,
    config.innerRailRadius,
    config.innerRailHeight,
    config.pegTop,
    config.pegBottom,
    config.pegLayerGap,
    config.pegRadius,
    config.pegFieldRadius,
    config.funnelTop,
    config.funnelBottom,
    config.funnelMouthRadius,
    config.funnelThroatRadius,
    config.funnelPanelCount,
    config.finishTubeBottom,
    config.finishTubeRadius,
    config.finishY,
    config.marbleRadius,
    config.startSlotCount,
    config.startSlotsPerRow,
  ];

  if (positiveValues.some((value) => value <= 0)) {
    throw new RangeError("Track dimensions and counts must be positive");
  }

  if (
    !Number.isSafeInteger(config.helixTurns) ||
    !Number.isSafeInteger(config.helixSegmentsPerTurn) ||
    !Number.isSafeInteger(config.funnelPanelCount) ||
    !Number.isSafeInteger(config.startSlotCount) ||
    !Number.isSafeInteger(config.startSlotsPerRow)
  ) {
    throw new RangeError("Track segment and slot counts must be safe integers");
  }

  if (
    config.towerTop < config.helixTop ||
    config.helixTop < config.helixBottom ||
    config.helixBottom < config.pegBottom ||
    config.pegTop < config.pegBottom ||
    config.funnelTop < config.funnelBottom ||
    config.funnelBottom < config.finishTubeBottom ||
    config.finishY >= config.finishTubeBottom
  ) {
    throw new RangeError("Track heights must form a descending course above the finish line");
  }

  if (
    config.innerRailRadius >= config.rampRadius ||
    config.funnelThroatRadius >= config.funnelMouthRadius ||
    config.finishTubeRadius >= config.containmentRadius
  ) {
    throw new RangeError("Track radii must preserve the course interior");
  }
}

export function createTrackDefinition(config: TrackConfig): TrackDefinition {
  assertTrackConfig(config);

  const boxes: TrackBox[] = [];
  const pegs: TrackPeg[] = [];
  const containmentPanels = 48;
  const containmentPanelHalfWidth =
    (Math.PI * 2 * config.containmentRadius * 0.62) / containmentPanels;

  for (let index = 0; index < containmentPanels; index += 1) {
    const angle = (index / containmentPanels) * Math.PI * 2;
    boxes.push({
      kind: "containment-wall",
      center: [
        config.containmentRadius * Math.cos(angle),
        config.towerTop / 2,
        config.containmentRadius * Math.sin(angle),
      ],
      rotation: rotateAroundY(-angle),
      halfExtents: [0.15, config.towerTop / 2, containmentPanelHalfWidth],
      material: CONTAINMENT_MATERIAL,
    });
  }

  const helixSteps = config.helixTurns * config.helixSegmentsPerTurn;

  for (let index = 0; index < helixSteps; index += 1) {
    const start = helixPoint(config, index / helixSteps);
    const end = helixPoint(config, (index + 1) / helixSteps);
    const center = midpoint(start, end);
    const tangent = normalize(subtract(end, start));
    const angle = ((index + 0.5) / helixSteps) * config.helixTurns * Math.PI * 2;
    const radial: Vector3 = [Math.cos(angle), 0, Math.sin(angle)];
    const up = normalize(cross(tangent, radial));
    const side = normalize(cross(up, tangent));
    const rotation = quaternionFromBasis(side, up, tangent);
    const segmentLength = length(subtract(end, start));

    boxes.push({
      kind: "helix-ramp",
      center,
      rotation,
      halfExtents: [config.rampHalfWidth, 0.11, segmentLength / 2 + 0.06],
      material: TRACK_MATERIAL,
    });
    boxes.push({
      kind: "helix-rail",
      center: add(
        add(center, scale(side, -(config.rampRadius - config.innerRailRadius))),
        scale(up, config.innerRailHeight / 2),
      ),
      rotation,
      halfExtents: [0.1, config.innerRailHeight / 2, segmentLength / 2 + 0.06],
      material: RAIL_MATERIAL,
    });
  }

  const pegLayers = Math.floor((config.pegTop - config.pegBottom) / config.pegLayerGap);
  const pegRingFractions = [0.34, 0.62, 0.88];

  for (let layer = 0; layer < pegLayers; layer += 1) {
    const y = config.pegTop - layer * config.pegLayerGap;

    for (let ringIndex = 0; ringIndex < pegRingFractions.length; ringIndex += 1) {
      const count = 4 + ringIndex * 4;
      const radius = config.pegFieldRadius * pegRingFractions[ringIndex];

      for (let index = 0; index < count; index += 1) {
        const angle =
          (index / count) * Math.PI * 2 +
          (layer % 2 === 0 ? 0 : Math.PI / count) +
          ringIndex * 0.31;
        pegs.push({
          center: [radius * Math.cos(angle), y, radius * Math.sin(angle)],
          radius: config.pegRadius,
          material: PEG_MATERIAL,
        });
      }
    }
  }

  const radiusDelta = config.funnelMouthRadius - config.funnelThroatRadius;
  const heightDelta = config.funnelTop - config.funnelBottom;
  const funnelSlantLength = Math.hypot(radiusDelta, heightDelta);
  const funnelTilt = Math.atan2(radiusDelta, heightDelta);
  const funnelMiddleRadius = (config.funnelMouthRadius + config.funnelThroatRadius) / 2;
  const funnelMiddleY = (config.funnelTop + config.funnelBottom) / 2;
  const funnelPanelHalfWidth = (Math.PI * 2 * funnelMiddleRadius * 0.85) / config.funnelPanelCount;

  for (let index = 0; index < config.funnelPanelCount; index += 1) {
    const angle = (index / config.funnelPanelCount) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const up = normalize([
      Math.sin(funnelTilt) * cosine,
      Math.cos(funnelTilt),
      Math.sin(funnelTilt) * sine,
    ]);
    const tangent: Vector3 = [-sine, 0, cosine];
    const normal = normalize(cross(tangent, up));

    boxes.push({
      kind: "funnel-panel",
      center: [funnelMiddleRadius * cosine, funnelMiddleY, funnelMiddleRadius * sine],
      rotation: quaternionFromBasis(tangent, up, normal),
      halfExtents: [funnelPanelHalfWidth, funnelSlantLength / 2, 0.1],
      material: FUNNEL_MATERIAL,
    });
  }

  const tubePanels = 20;
  const tubePanelHalfWidth = (Math.PI * 2 * config.finishTubeRadius * 0.72) / tubePanels;
  const tubeCenterY = (config.funnelBottom + config.finishTubeBottom) / 2;

  for (let index = 0; index < tubePanels; index += 1) {
    const angle = (index / tubePanels) * Math.PI * 2;
    boxes.push({
      kind: "finish-tube",
      center: [
        config.finishTubeRadius * Math.cos(angle),
        tubeCenterY,
        config.finishTubeRadius * Math.sin(angle),
      ],
      rotation: rotateAroundY(-angle),
      halfExtents: [0.12, (config.funnelBottom - config.finishTubeBottom) / 2, tubePanelHalfWidth],
      material: CONTAINMENT_MATERIAL,
    });
  }

  boxes.push({
    kind: "finish-basin",
    center: [0, config.basinY - 0.3, 0],
    rotation: [0, 0, 0, 1],
    halfExtents: [config.containmentRadius, 0.3, config.containmentRadius],
    material: Object.freeze({ restitution: 0, friction: 0.7 }),
  });

  const startSlots: Vector3[] = [];

  for (let slot = 0; slot < config.startSlotCount; slot += 1) {
    const row = Math.floor(slot / config.startSlotsPerRow);
    const column = slot % config.startSlotsPerRow;
    const t = -(0.0022 + row * 0.0075);
    const position = helixPoint(config, t);
    const nextPosition = helixPoint(config, t + 0.001);
    const tangent = normalize(subtract(nextPosition, position));
    const angle = t * config.helixTurns * Math.PI * 2;
    const radial: Vector3 = [Math.cos(angle), 0, Math.sin(angle)];
    const up = normalize(cross(tangent, radial));
    const side = normalize(cross(up, tangent));
    const lateral = (column - (config.startSlotsPerRow - 1) / 2) * config.rampHalfWidth * 1.05;
    startSlots.push(add(add(position, scale(side, lateral)), scale(up, 0.55)));
  }

  return Object.freeze({
    config,
    boxes: Object.freeze(boxes),
    pegs: Object.freeze(pegs),
    startSlots: Object.freeze(startSlots),
    finishY: config.finishY,
  });
}
