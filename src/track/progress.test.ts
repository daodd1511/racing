import { describe, expect, it } from "vitest";

import { createTrackDefinition, DEFAULT_TRACK_CONFIG } from "./definition";
import {
  createProgressTracker,
  hasCrossedFinish,
  measureTrackProgress,
  sampleTrackPath,
} from "./progress";

const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);

describe("track progress", () => {
  it("projects centreline samples to their cumulative distance", () => {
    for (const sample of [track.path[8], track.path[36], track.path[70]]) {
      expect(measureTrackProgress(track, sample.position)).toBeCloseTo(sample.distance, 4);
    }
  });

  it("keeps lateral positions on the same section", () => {
    const sample = track.path[42];
    const lateralPosition = [
      sample.position[0] + sample.side[0] * 3,
      sample.position[1] + sample.side[1] * 3,
      sample.position[2] + sample.side[2] * 3,
    ] as const;

    expect(measureTrackProgress(track, lateralPosition)).toBeCloseTo(sample.distance, 0);
  });

  it("interpolates the path at requested progress", () => {
    const requested = track.finishProgress * 0.5;
    const sample = sampleTrackPath(track, requested);

    expect(sample.distance).toBeCloseTo(requested, 6);
  });

  it("accepts only bounded crossings of the physical finish plane", () => {
    const finish = track.finishLine;
    const crossing = [
      finish.center[0] + finish.tangent[0] * 0.2 + finish.up[0] * 0.4,
      finish.center[1] + finish.tangent[1] * 0.2 + finish.up[1] * 0.4,
      finish.center[2] + finish.tangent[2] * 0.2 + finish.up[2] * 0.4,
    ] as const;
    const escaped = [crossing[0], crossing[1] - 30, crossing[2]] as const;

    expect(hasCrossedFinish(track, crossing)).toBe(true);
    expect(hasCrossedFinish(track, escaped)).toBe(false);
  });
});

describe("createProgressTracker", () => {
  it("clamps a dipping raw reading to the previous high, never lower", () => {
    const tracker = createProgressTracker(1);
    const readings = [5, 8, 6, 10, 9, 12];
    const clamped = readings.map((raw) => tracker.update(0, raw));

    expect(clamped).toEqual([5, 8, 8, 10, 10, 12]);
    for (let index = 1; index < clamped.length; index += 1) {
      expect(clamped[index]).toBeGreaterThanOrEqual(clamped[index - 1]);
    }
  });

  it("tracks marbles independently", () => {
    const tracker = createProgressTracker(2);
    tracker.update(0, 10);
    tracker.update(1, 3);

    expect(tracker.currentProgress(0)).toBe(10);
    expect(tracker.currentProgress(1)).toBe(3);

    tracker.update(0, 4);
    expect(tracker.currentProgress(0)).toBe(10);
    expect(tracker.currentProgress(1)).toBe(3);
  });

  it("starts every marble at zero before any update", () => {
    const tracker = createProgressTracker(3);
    expect(tracker.currentProgress(2)).toBe(0);
  });

  // Real course geometry, not synthetic numbers: a small lateral wobble
  // perturbs each reading the way an actual rolling marble's true position
  // would, proving the clamp holds even when a raw reading dips.
  it("keeps tracked progress non-decreasing along the existing course despite lateral wobble", () => {
    const tracker = createProgressTracker(1);
    let previous = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < track.path.length; index += 4) {
      const sample = track.path[index];
      const wobble = (index % 8 === 0 ? 1 : -1) * 0.15;
      const perturbed = [
        sample.position[0] + sample.side[0] * wobble,
        sample.position[1] + sample.side[1] * wobble,
        sample.position[2] + sample.side[2] * wobble,
      ] as const;
      const clamped = tracker.update(0, measureTrackProgress(track, perturbed));

      expect(clamped).toBeGreaterThanOrEqual(previous);
      previous = clamped;
    }
  });
});
