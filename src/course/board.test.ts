import { describe, expect, it } from "vitest";

import { defaultParamValues } from "../modules/params";
import { ALL_MODULES } from "../modules/registry";
import { SCALE } from "../race/scale";
import { BOARD } from "./board";
import { CONNECTOR_EDGE_CLEARANCE } from "./connectors";

describe("BOARD", () => {
  it("has fixed 3x3 dimensions aligned to the Cell pitch", () => {
    expect(BOARD.columns).toBe(3);
    expect(BOARD.rows).toBe(3);
    expect(BOARD.cellPitch).toBe(SCALE.cellPitch);

    const width = BOARD.bounds.max[0] - BOARD.bounds.min[0];
    const height = BOARD.bounds.max[1] - BOARD.bounds.min[1];
    expect(width).toBeCloseTo(BOARD.columns * BOARD.bayWidth + BOARD.edgeMargin * 2, 10);
    expect(height).toBeCloseTo(BOARD.rows * BOARD.bayHeight + BOARD.edgeMargin * 2, 10);
    expect(BOARD.edgeMargin).toBeGreaterThanOrEqual(CONNECTOR_EDGE_CLEARANCE);
    expect(width / SCALE.cellPitch).toBeCloseTo(Math.round(width / SCALE.cellPitch), 10);
    expect(height / SCALE.cellPitch).toBeCloseTo(Math.round(height / SCALE.cellPitch), 10);
    expect(Object.isFrozen(BOARD)).toBe(true);
    expect(Object.isFrozen(BOARD.bounds)).toBe(true);
  });

  it.each(ALL_MODULES)("fits $id default projected bounds in one fixed bay", (module) => {
    const bounds = module.buildSpec(defaultParamValues(module.meta.params)).footprint.bounds;
    const travel = bounds.max[2] - bounds.min[2];
    const vertical = bounds.max[1] - bounds.min[1];

    expect(travel).toBeLessThan(BOARD.bayWidth);
    expect(vertical).toBeLessThan(BOARD.bayHeight);
  });
});
