import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_RACE_CONFIG } from "../race/config";
import type { TransformFrame } from "../race/types";
import { createTrackDefinition, DEFAULT_TRACK_CONFIG } from "../track/definition";
import { measureTrackProgress, sampleTrackPath } from "../track/progress";
import { initializeRapier } from "./initializeRapier";
import { simulateRace } from "./simulateRace";

const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);

function rankingAt(frame: TransformFrame): readonly number[] {
  return frame.transforms
    .map((transform, index) => ({
      index,
      progress: measureTrackProgress(track, transform.position),
    }))
    .sort((left, right) => right.progress - left.progress || left.index - right.index)
    .map(({ index }) => index);
}

function distanceFromTrack(
  frame: TransformFrame,
  finishFrameByMarbleIndex: readonly (number | null)[],
): number {
  const activeTransforms = frame.transforms.filter((_, marbleIndex) => {
    const finishFrame = finishFrameByMarbleIndex[marbleIndex];
    return finishFrame === null || frame.index <= finishFrame;
  });
  if (activeTransforms.length === 0) {
    return 0;
  }
  return Math.max(
    ...activeTransforms.map((transform) => {
      const progress = measureTrackProgress(track, transform.position);
      const centre = sampleTrackPath(track, progress).position;
      return Math.hypot(
        transform.position[0] - centre[0],
        transform.position[1] - centre[1],
        transform.position[2] - centre[2],
      );
    }),
  );
}

type MutableVector3 = [number, number, number];

function subtract(left: readonly number[], right: readonly number[]): MutableVector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: readonly number[], right: readonly number[]): MutableVector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function surfaceVertex(index: number): MutableVector3 {
  const offset = index * 3;
  return [
    track.surface.vertices[offset],
    track.surface.vertices[offset + 1],
    track.surface.vertices[offset + 2],
  ];
}

function distanceToSegment(
  point: readonly number[],
  start: readonly number[],
  end: readonly number[],
): number {
  const segment = subtract(end, start);
  const lengthSquared = dot(segment, segment);
  const fraction =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, dot(subtract(point, start), segment) / lengthSquared));
  return Math.hypot(
    point[0] - (start[0] + segment[0] * fraction),
    point[1] - (start[1] + segment[1] * fraction),
    point[2] - (start[2] + segment[2] * fraction),
  );
}

function distanceToTriangle(
  point: readonly number[],
  first: readonly number[],
  second: readonly number[],
  third: readonly number[],
): number {
  const firstEdge = subtract(second, first);
  const secondEdge = subtract(third, first);
  const normal = cross(firstEdge, secondEdge);
  const normalLength = Math.hypot(...normal);
  if (normalLength === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const unitNormal = normal.map((value) => value / normalLength) as MutableVector3;
  const signedDistance = dot(subtract(point, first), unitNormal);
  const projected = point.map(
    (value, axis) => value - unitNormal[axis] * signedDistance,
  ) as MutableVector3;
  const projectedOffset = subtract(projected, first);
  const firstDot = dot(firstEdge, firstEdge);
  const edgeDot = dot(firstEdge, secondEdge);
  const secondDot = dot(secondEdge, secondEdge);
  const projectedFirstDot = dot(projectedOffset, firstEdge);
  const projectedSecondDot = dot(projectedOffset, secondEdge);
  const denominator = firstDot * secondDot - edgeDot * edgeDot;
  const firstWeight = (secondDot * projectedFirstDot - edgeDot * projectedSecondDot) / denominator;
  const secondWeight = (firstDot * projectedSecondDot - edgeDot * projectedFirstDot) / denominator;
  if (firstWeight >= 0 && secondWeight >= 0 && firstWeight + secondWeight <= 1) {
    return Math.abs(signedDistance);
  }
  return Math.min(
    distanceToSegment(point, first, second),
    distanceToSegment(point, second, third),
    distanceToSegment(point, third, first),
  );
}

function distanceToSurface(point: readonly number[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < track.surface.indices.length; index += 3) {
    nearest = Math.min(
      nearest,
      distanceToTriangle(
        point,
        surfaceVertex(track.surface.indices[index]),
        surfaceVertex(track.surface.indices[index + 1]),
        surfaceVertex(track.surface.indices[index + 2]),
      ),
    );
  }
  return nearest;
}

function maximumClearanceFromTrack(
  frame: TransformFrame,
  finishFrameByMarbleIndex: readonly (number | null)[],
): { readonly clearance: number; readonly marbleIndex: number; readonly progress: number } {
  return frame.transforms.reduce(
    (highest, transform, marbleIndex) => {
      const finishFrame = finishFrameByMarbleIndex[marbleIndex];
      if (finishFrame !== null && frame.index > finishFrame) {
        return highest;
      }
      const progress = measureTrackProgress(track, transform.position);
      const courseLength = track.path.at(-1)?.distance ?? 0;
      if (progress < courseLength * 0.16 || progress > courseLength * 0.94) {
        return highest;
      }
      const surfaceGap = distanceToSurface(transform.position) - DEFAULT_TRACK_CONFIG.marbleRadius;
      return surfaceGap > highest.clearance
        ? { clearance: surfaceGap, marbleIndex, progress }
        : highest;
    },
    { clearance: 0, marbleIndex: -1, progress: 0 },
  );
}

const CASES = [
  { rosterSize: 5, seed: 0, mode: "first" as const },
  { rosterSize: 5, seed: 0, mode: "last" as const },
  { rosterSize: 15, seed: 1, mode: "first" as const },
  { rosterSize: 15, seed: 1, mode: "last" as const },
];

describe("default track completion coverage", () => {
  beforeAll(async () => {
    await initializeRapier();
  });

  it.each(CASES)(
    "completes a $rosterSize-marble $mode race for seed $seed",
    (testCase) => {
      const roster = Array.from(
        { length: testCase.rosterSize },
        (_, index) => `Marble ${index + 1}`,
      );
      const recording = simulateRace(roster, testCase.seed, testCase.mode);

      expect(recording).not.toBeNull();
      expect(recording?.selectedMarbleIndex).toBeGreaterThanOrEqual(0);
      expect(recording?.selectedMarbleIndex).toBeLessThan(testCase.rosterSize);
      expect(recording?.finishOrder).toHaveLength(
        testCase.mode === "last" ? testCase.rosterSize : 1,
      );

      if (recording === null) {
        return;
      }
      expect(recording.simulationDurationSeconds).toBeGreaterThanOrEqual(40);
      expect(recording.simulationDurationSeconds).toBeLessThanOrEqual(
        DEFAULT_RACE_CONFIG.maximumSimulationSeconds,
      );
      const courseFrames = recording.frames.filter((frame, index) => {
        if (index % 90 !== 0) {
          return false;
        }
        const leaderProgress = Math.max(
          ...frame.transforms.map((transform) => measureTrackProgress(track, transform.position)),
        );
        return (
          leaderProgress > track.finishProgress * 0.2 && leaderProgress < track.finishProgress * 0.9
        );
      });
      const rankingSignatures = new Set(courseFrames.map((frame) => rankingAt(frame).join(",")));

      expect(rankingSignatures.size).toBeGreaterThan(1);
      expect(
        Math.max(
          ...recording.frames
            .filter((_, index) => index % 120 === 0)
            .map((frame) => distanceFromTrack(frame, recording.finishFrameByMarbleIndex)),
        ),
      ).toBeLessThan(DEFAULT_TRACK_CONFIG.trackHalfWidth + 1.2);
      const clearanceObservations = recording.frames
        .filter((_, index) => index % 90 === 0)
        .map((frame) => ({
          frame,
          ...maximumClearanceFromTrack(frame, recording.finishFrameByMarbleIndex),
        }));
      const highestClearance = clearanceObservations.reduce((highest, observation) =>
        observation.clearance > highest.clearance ? observation : highest,
      );
      expect(
        highestClearance.clearance,
        `maximum obstacle-section gap at frame ${highestClearance.frame.index}`,
      ).toBeLessThan(0.6);
    },
    15_000,
  );
});
