import type { Vector3 } from "../race/types";
import type { TrackDefinition, TrackPathSample } from "./definition";

function subtract(left: Vector3, right: Vector3): Vector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function add(left: Vector3, right: Vector3): Vector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function scale(vector: Vector3, factor: number): Vector3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function dot(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function hasCrossedFinish(track: TrackDefinition, position: Vector3): boolean {
  const offset = subtract(position, track.finishLine.center);
  const forward = dot(offset, track.finishLine.tangent);
  const lateral = Math.abs(dot(offset, track.finishLine.side));
  const vertical = dot(offset, track.finishLine.up);

  return (
    forward >= 0 &&
    lateral <= track.finishLine.halfWidth &&
    vertical >= -track.config.trackThickness &&
    vertical <= track.config.railHeight * 1.5
  );
}

function lengthSquared(vector: Vector3): number {
  return dot(vector, vector);
}

function normalize(vector: Vector3): Vector3 {
  const vectorLength = Math.sqrt(lengthSquared(vector));
  if (vectorLength === 0) {
    return vector;
  }
  return scale(vector, 1 / vectorLength);
}

export function measureTrackProgress(track: TrackDefinition, position: Vector3): number {
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  let nearestProgress = 0;

  for (let index = 0; index < track.path.length - 1; index += 1) {
    const start = track.path[index];
    const end = track.path[index + 1];
    const segment = subtract(end.position, start.position);
    const segmentLengthSquared = lengthSquared(segment);
    const fraction =
      segmentLengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, dot(subtract(position, start.position), segment) / segmentLengthSquared),
          );
    const projection = add(start.position, scale(segment, fraction));
    const distanceSquared = lengthSquared(subtract(position, projection));

    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      nearestProgress = start.distance + (end.distance - start.distance) * fraction;
    }
  }

  return nearestProgress;
}

export interface ProgressTracker {
  /** Records a freshly measured progress reading and returns the clamped
   * (non-decreasing) value: `max(previousProgress, rawProgress)`. */
  update(marbleIndex: number, rawProgress: number): number;
  /** The most recent clamped value for a marble, without taking a new
   * reading. Returns 0 for a marble that has never been updated. */
  currentProgress(marbleIndex: number): number;
}

// Tight radii make small projection errors
// in `measureTrackProgress` read as backward movement — a marble that hasn't
// actually reversed can measure a lower progress on one frame than the last.
// A leaderboard, camera target, or finish ranking built on raw readings would
// flicker backwards. This clamp is the general safety net PLAN.md calls for:
// callers needing a monotone reading track it themselves via a
// `ProgressTracker`, one per race, keyed by marble index — `measureTrackProgress`
// itself stays pure. Safe only for callers that visit frames in non-decreasing
// order (true of both the live simulation loop and forward-only replay
// playback; neither supports scrubbing backward).
export function createProgressTracker(marbleCount: number): ProgressTracker {
  const maxProgressByMarble = new Array<number>(marbleCount).fill(0);
  return {
    update(marbleIndex, rawProgress) {
      const clamped = Math.max(maxProgressByMarble[marbleIndex] ?? 0, rawProgress);
      maxProgressByMarble[marbleIndex] = clamped;
      return clamped;
    },
    currentProgress(marbleIndex) {
      return maxProgressByMarble[marbleIndex] ?? 0;
    },
  };
}

export function sampleTrackPath(track: TrackDefinition, progress: number): TrackPathSample {
  const bounded = Math.max(0, Math.min(track.path.at(-1)?.distance ?? 0, progress));
  let upperIndex = track.path.findIndex((sample) => sample.distance >= bounded);
  if (upperIndex <= 0) {
    return track.path[0];
  }
  if (upperIndex < 0) {
    upperIndex = track.path.length - 1;
  }
  const left = track.path[upperIndex - 1];
  const right = track.path[upperIndex];
  const span = right.distance - left.distance;
  const fraction = span === 0 ? 0 : (bounded - left.distance) / span;
  const tangent = normalize(
    add(left.tangent, scale(subtract(right.tangent, left.tangent), fraction)),
  );
  const blendedSide = add(left.side, scale(subtract(right.side, left.side), fraction));
  const side = normalize(subtract(blendedSide, scale(tangent, dot(blendedSide, tangent))));
  return {
    position: add(left.position, scale(subtract(right.position, left.position), fraction)),
    tangent,
    side,
    up: normalize(cross(tangent, side)),
    distance: bounded,
  };
}
