import { describe, expect, it } from "vitest";

import { createTrackDefinition, DEFAULT_TRACK_CONFIG } from "./definition";

describe("createTrackDefinition", () => {
  it("builds the fixed raceway modules and starting grid", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);

    expect(track.surface.vertices.length).toBeGreaterThan(100);
    expect(track.surface.indices.length).toBeGreaterThan(100);
    expect(track.boxes.some((box) => box.kind === "side-rail")).toBe(true);
    expect(track.boxes.some((box) => box.kind === "splitter-rail")).toBe(true);
    expect(track.boxes.some((box) => box.kind === "deflector")).toBe(true);
    expect(track.bumpers.length).toBeGreaterThanOrEqual(8);
    expect(track.path.length).toBeGreaterThan(50);
    expect(track.startSlots).toHaveLength(DEFAULT_TRACK_CONFIG.startSlotCount);
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
