import { describe, expect, it } from "vitest";

import { createSeededRandom, deriveRaceSeed } from "../race/random";
import { ARC, enumerateRoleSelections, selectRoleModules } from "./arc";

describe("ARC", () => {
  it("is the fixed nine-Slot 3x3 serpentine", () => {
    expect(ARC).toHaveLength(9);
    expect(ARC.map(({ column, row }) => [column, row])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    expect(ARC.map(({ direction }) => direction)).toEqual([
      "right",
      "right",
      "right",
      "left",
      "left",
      "left",
      "right",
      "right",
      "right",
    ]);
  });
});

describe("Role selections", () => {
  it("enumerates exactly 32 unique combinations and reuses one accel choice", () => {
    const selections = enumerateRoleSelections();
    expect(selections).toHaveLength(32);
    expect(new Set(selections.map((selection) => JSON.stringify(selection))).size).toBe(32);

    for (const selection of selections) {
      const buildChoices = ARC.filter(
        (slot) => slot.kind === "module" && slot.role === "accel",
      ).map(() => selection.accel);
      expect(new Set(buildChoices)).toEqual(new Set([selection.accel]));
    }
  });

  it("is deterministic and isolated from Start-substream draws", () => {
    const seed = 193;
    const expected = selectRoleModules(seed);
    const startRandom = createSeededRandom(deriveRaceSeed(seed, "start"));
    for (let draw = 0; draw < 100; draw += 1) {
      startRandom();
    }

    expect(selectRoleModules(seed)).toEqual(expected);
    expect(Object.isFrozen(expected)).toBe(true);
  });
});
