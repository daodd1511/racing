import { describe, expect, it } from "vitest";

import { createTrackDefinition, DEFAULT_TRACK_CONFIG } from "./definition";

describe("createTrackDefinition", () => {
  it("builds every fixed module and all start slots", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);

    expect(track.boxes.some((box) => box.kind === "helix-ramp")).toBe(true);
    expect(track.boxes.some((box) => box.kind === "helix-rail")).toBe(true);
    expect(track.boxes.some((box) => box.kind === "funnel-panel")).toBe(true);
    expect(track.boxes.some((box) => box.kind === "finish-tube")).toBe(true);
    expect(track.boxes.some((box) => box.kind === "finish-basin")).toBe(true);
    expect(track.pegs).not.toHaveLength(0);
    expect(track.startSlots).toHaveLength(DEFAULT_TRACK_CONFIG.startSlotCount);
  });

  it("keeps every start slot above the finish line", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);

    for (const startSlot of track.startSlots) {
      expect(startSlot[1]).toBeGreaterThan(track.finishY);
    }
  });

  it("rejects impossible funnel dimensions", () => {
    expect(() =>
      createTrackDefinition({
        ...DEFAULT_TRACK_CONFIG,
        funnelThroatRadius: DEFAULT_TRACK_CONFIG.funnelMouthRadius,
      }),
    ).toThrow(RangeError);
  });
});
