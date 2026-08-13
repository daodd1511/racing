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
  return bounded - left.distance <= right.distance - bounded ? left : right;
}
