import { describe, expect, it } from "vitest";

import { defaultParamValues } from "../modules/params";
import { ALL_MODULES } from "../modules/registry";
import { SCALE } from "../race/scale";
import { BOARD } from "./board";

describe("BOARD", () => {
  it("has fixed 3x3 dimensions aligned to the Cell pitch", () => {
    expect(BOARD.columns).toBe(3);
    expect(BOARD.rows).toBe(3);
    expect(BOARD.cellPitch).toBe(SCALE.cellPitch);

    const width = BOARD.bounds.max[0] - BOARD.bounds.min[0];
    const height = BOARD.bounds.max[1] - BOARD.bounds.min[1];
    expect(width / SCALE.cellPitch).toBeCloseTo(Math.round(width / SCALE.cellPitch), 10);
    expect(height / SCALE.cellPitch).toBeCloseTo(Math.round(height / SCALE.cellPitch), 10);
    expect(Object.isFrozen(BOARD)).toBe(true);
    expect(Object.isFrozen(BOARD.bounds)).toBe(true);
  });

  it.each(ALL_MODULES)("fits $id default projected bounds in one equal bay", (module) => {
    const bounds = module.buildSpec(defaultParamValues(module.meta.params)).footprint.bounds;
    const travel = bounds.max[2] - bounds.min[2];
    const vertical = bounds.max[1] - bounds.min[1];
    const boardWidth = BOARD.bounds.max[0] - BOARD.bounds.min[0];
    const boardHeight = BOARD.bounds.max[1] - BOARD.bounds.min[1];

    expect(travel).toBeLessThan(boardWidth / BOARD.columns);
    expect(vertical).toBeLessThan(boardHeight / BOARD.rows);
  });
});
