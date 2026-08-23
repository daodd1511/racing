import { describe, expect, it } from "vitest";

import { BOARD } from "../board";
import { gridForBoard, holePositionsForBoard } from "./Board";

describe("Board", () => {
  it("derives one visible hole for every Board Cell", () => {
    const grid = gridForBoard(BOARD);
    const holes = holePositionsForBoard(BOARD);

    expect(holes).toHaveLength(grid.columns * grid.rows);
    expect(holes[0]).toEqual([
      BOARD.bounds.min[0] + BOARD.cellPitch / 2,
      BOARD.bounds.min[1] + BOARD.cellPitch / 2,
      expect.any(Number),
    ]);
    expect(holes.at(-1)?.[0]).toBeCloseTo(BOARD.bounds.max[0] - BOARD.cellPitch / 2, 10);
    expect(holes.at(-1)?.[1]).toBeCloseTo(BOARD.bounds.max[1] - BOARD.cellPitch / 2, 10);
  });
});
