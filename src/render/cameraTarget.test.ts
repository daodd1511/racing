import { describe, expect, it } from "vitest";

import type { MarbleTransform } from "../race/types";
import { createTrackDefinition, DEFAULT_TRACK_CONFIG } from "../track/definition";
import { cameraDampingAlpha, createCameraTarget, selectCameraTargetIndex } from "./cameraTarget";

const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);
const transforms = [10, 35, 62].map((pathIndex): MarbleTransform => ({
  position: track.path[pathIndex].position,
  rotation: [0, 0, 0, 1],
}));

describe("race camera targeting", () => {
  it("follows the current leader in first mode", () => {
    expect(selectCameraTargetIndex(transforms, track, "first")).toBe(2);
  });

  it("follows the current trailer in last mode", () => {
    expect(selectCameraTargetIndex(transforms, track, "last")).toBe(0);
  });

  it("positions the camera above and behind the selected marble", () => {
    const target = createCameraTarget(transforms, track, "first");
    const marble = transforms[target.marbleIndex].position;

    expect(target.position[1]).toBeGreaterThan(marble[1]);
    expect(target.lookAt[2]).not.toBe(marble[2]);
  });

  it("damps target changes instead of snapping to them", () => {
    expect(cameraDampingAlpha(1 / 60)).toBeGreaterThan(0);
    expect(cameraDampingAlpha(1 / 60)).toBeLessThan(1);
    expect(cameraDampingAlpha(1 / 30)).toBeGreaterThan(cameraDampingAlpha(1 / 60));
  });
});
