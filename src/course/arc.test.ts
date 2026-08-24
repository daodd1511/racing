import { describe, expect, it } from "vitest";

import { createSeededRandom, deriveRaceSeed } from "../race/random";
import { ARC, enumerateRoleSelections, selectRoleModules } from "./arc";

describe("ARC", () => {
  it("is the fixed 24-Slot 8x3 serpentine", () => {
    expect(ARC).toHaveLength(24);
    expect(ARC.map(({ column, row }) => [column, row])).toEqual(
      [0, 1, 2].flatMap((row) => {
        const columns = Array.from({ length: 8 }, (_, column) => column);
        return (row % 2 === 0 ? columns : columns.reverse()).map((column) => [column, row]);
      }),
    );
    expect(ARC.map(({ direction }) => direction)).toEqual(
      [0, 1, 2].flatMap((row) => Array(8).fill(row % 2 === 0 ? "right" : "left")),
    );
    expect(Object.isFrozen(ARC)).toBe(true);
    ARC.forEach((slot) => expect(Object.isFrozen(slot)).toBe(true));
  });
});

describe("Role selections", () => {
  it("enumerates the single active Module combination and reuses one accel choice", () => {
    const selections = enumerateRoleSelections();
    expect(selections).toHaveLength(1);
    expect(new Set(selections.map((selection) => JSON.stringify(selection))).size).toBe(1);

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
