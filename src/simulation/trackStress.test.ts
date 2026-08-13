import { beforeAll, describe, expect, it } from "vitest";

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

  it.each(CASES)("completes a $rosterSize-marble $mode race for seed $seed", (testCase) => {
    const roster = Array.from({ length: testCase.rosterSize }, (_, index) => `Marble ${index + 1}`);
    const recording = simulateRace(roster, testCase.seed, testCase.mode);

    expect(recording).not.toBeNull();
    expect(recording?.selectedMarbleIndex).toBeGreaterThanOrEqual(0);
    expect(recording?.selectedMarbleIndex).toBeLessThan(testCase.rosterSize);
    expect(recording?.finishOrder).toHaveLength(testCase.mode === "last" ? testCase.rosterSize : 1);

    if (recording === null) {
      return;
    }
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
  });
});
