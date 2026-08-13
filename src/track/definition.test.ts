import { describe, expect, it } from "vitest";

import { createTrackDefinition, DEFAULT_TRACK_CONFIG } from "./definition";
import { measureTrackProgress, sampleTrackPath } from "./progress";
import { DEFAULT_MARBLE_MATERIAL } from "../simulation/simulateRace";

describe("createTrackDefinition", () => {
  it("builds the fixed raceway modules and one-line starting grid", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);

    expect(track.surface.vertices.length).toBeGreaterThan(100);
    expect(track.surface.indices.length).toBeGreaterThan(100);
    expect(track.boxes.some((box) => box.kind === "side-rail")).toBe(true);
    expect(track.boxes.filter((box) => box.kind === "gate")).toHaveLength(7);
    expect(track.boxes.some((box) => box.kind === "deflector")).toBe(true);
    expect(track.path.length).toBeGreaterThan(50);
    expect(track.startSlots).toHaveLength(DEFAULT_TRACK_CONFIG.startSlotCount);
    const startTangent = sampleTrackPath(track, 1.5).tangent;
    const startProgress = track.startSlots.map((slot) => measureTrackProgress(track, slot));
    expect(Math.max(...startProgress) - Math.min(...startProgress)).toBeLessThan(0.02);
    expect(
      Math.hypot(
        track.startSlots[1][0] - track.startSlots[0][0],
        track.startSlots[1][1] - track.startSlots[0][1],
        track.startSlots[1][2] - track.startSlots[0][2],
      ),
    ).toBeGreaterThan(DEFAULT_TRACK_CONFIG.marbleRadius * 1.8);
    for (let index = 1; index < track.startSlots.length; index += 1) {
      const previous = track.startSlots[index - 1];
      const current = track.startSlots[index];
      const separation = [
        current[0] - previous[0],
        current[1] - previous[1],
        current[2] - previous[2],
      ];
      const longitudinalOffset = Math.abs(
        separation[0] * startTangent[0] +
          separation[1] * startTangent[1] +
          separation[2] * startTangent[2],
      );
      expect(longitudinalOffset).toBeLessThan(0.001);
    }
  });

  it("uses grounded raceway materials instead of springy pinball materials", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);

    expect(track.surface.material.restitution).toBe(0);
    expect(track.surface.material.friction).toBe(0.1);
    expect(track.boxes.find((box) => box.kind === "side-rail")?.material).toEqual({
      restitution: 0.03,
      friction: 0.11,
    });
    expect(DEFAULT_MARBLE_MATERIAL).toEqual({ restitution: 0, friction: 0.12 });
  });

  it("places the finish line near the end of the sampled centreline", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);
    const totalDistance = track.path.at(-1)?.distance ?? 0;

    expect(track.finishProgress).toBeGreaterThan(totalDistance * 0.9);
    expect(track.finishProgress).toBeLessThan(totalDistance);
    expect(track.finishLine.halfWidth).toBe(DEFAULT_TRACK_CONFIG.trackHalfWidth);
  });

  it("rejects unsupported banking", () => {
    expect(() =>
      createTrackDefinition({
        ...DEFAULT_TRACK_CONFIG,
        maximumBankRadians: Math.PI / 3,
      }),
    ).toThrow(RangeError);
  });
});
