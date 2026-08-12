import { beforeAll, describe, expect, it } from "vitest";

import { initializeRapier } from "./initializeRapier";
import { simulateRace } from "./simulateRace";

const ROSTER = ["Avery", "Jordan", "Morgan"];

describe("simulateRace", () => {
  beforeAll(async () => {
    await initializeRapier();
  });

  it("ends first mode at the earliest crossing and records physics data", () => {
    const recording = simulateRace(ROSTER, 0, "first");

    expect(recording).not.toBeNull();
    expect(recording?.finishOrder).toHaveLength(1);
    expect(recording?.selectedMarbleIndex).toBe(recording?.finishOrder[0]);
    expect(recording?.finishFrameByMarbleIndex).toContain(recording?.selectionFrameIndex);
    expect(recording?.frames).not.toHaveLength(0);
    expect(recording?.frames[0].transforms).toHaveLength(ROSTER.length);
    expect(recording?.contactEvents.length).toBeGreaterThan(0);
  }, 15_000);

  it("ends last mode only after every marble crosses the finish", () => {
    const recording = simulateRace(ROSTER, 0, "last");

    expect(recording).not.toBeNull();
    expect(recording?.finishOrder).toHaveLength(ROSTER.length);
    expect(recording?.selectedMarbleIndex).toBe(recording?.finishOrder.at(-1));
    expect(recording?.finishFrameByMarbleIndex).not.toContain(null);
    expect(recording?.finalRanking).toEqual(recording?.finishOrder);
  }, 15_000);
});
