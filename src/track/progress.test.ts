import { describe, expect, it } from "vitest";

import { createTrackDefinition, DEFAULT_TRACK_CONFIG } from "./definition";
import { hasCrossedFinish, measureTrackProgress, sampleTrackPath } from "./progress";

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

  it("samples the path nearest a requested progress", () => {
    const requested = track.finishProgress * 0.5;
    const sample = sampleTrackPath(track, requested);

    expect(Math.abs(sample.distance - requested)).toBeLessThan(2);
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
