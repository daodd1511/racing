import { beforeAll, describe, expect, it } from "vitest";

import { initializeRapier } from "./initializeRapier";
import { simulateRace } from "./simulateRace";

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
  });
});
