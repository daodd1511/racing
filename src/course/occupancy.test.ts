import { describe, expect, it } from "vitest";

import type { Footprint } from "../modules/types";
import type { BoardSpec } from "./types";
import { rasterizeAnchorSeamCells, rasterizeFootprintCells } from "./occupancy";

const BOARD: BoardSpec = {
  columns: 3,
  rows: 2,
  cellPitch: 0.1,
  bayWidth: 0.1,
  bayHeight: 0.1,
  edgeMargin: 0,
  bounds: { min: [0, 0, -1], max: [0.3, 0.2, 1] },
};

function footprint(bounds: Footprint["bounds"]): Footprint {
  return {
    cells: [],
    entry: { position: bounds.min, tangent: [1, 0, 0], up: [0, 1, 0] },
    exit: { position: bounds.max, tangent: [1, 0, 0], up: [0, 1, 0] },
    route: [bounds.min, bounds.max],
    bounds,
  };
}

describe("rasterizeFootprintCells", () => {
  it("includes both Cells touched by an internal edge in stable row-major order", () => {
    const source = footprint({ min: [0.1, 0.1, 0], max: [0.2, 0.2, 0] });

    expect(rasterizeFootprintCells(source, BOARD)).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 2, row: 0 },
      { column: 0, row: 1 },
      { column: 1, row: 1 },
      { column: 2, row: 1 },
    ]);
  });

  it("clamps Cells touched at the Board edge without duplicates", () => {
    const source = footprint({ min: [0, 0, -1], max: [0.3, 0.2, 1] });
    const cells = rasterizeFootprintCells(source, BOARD);

    expect(cells).toHaveLength(6);
    expect(new Set(cells.map(({ column, row }) => `${column}:${row}`)).size).toBe(cells.length);
  });

  it("rejects non-finite and out-of-Board bounds without mutating the Footprint", () => {
    const outside = footprint({ min: [-0.001, 0, 0], max: [0.1, 0.1, 0] });
    const snapshot = structuredClone(outside);
    expect(() => rasterizeFootprintCells(outside, BOARD)).toThrow(/outside the Board/);
    expect(outside).toEqual(snapshot);

    const nonFinite = footprint({ min: [0, 0, 0], max: [Number.NaN, 0.1, 0] });
    expect(() => rasterizeFootprintCells(nonFinite, BOARD)).toThrow(/finite/);
  });

  it("keeps the matched Anchor seam inside one longitudinal marble radius", () => {
    const seam = rasterizeAnchorSeamCells(
      { position: [0.15, 0.1, 0], tangent: [1, 0, 0], up: [0, 1, 0] },
      BOARD,
      0.016,
      0.032,
    );

    expect(new Set(seam.map(({ column }) => column))).toEqual(new Set([1]));
    expect(seam).not.toContainEqual({ column: 0, row: 0 });
    expect(seam).not.toContainEqual({ column: 2, row: 0 });
  });
});
