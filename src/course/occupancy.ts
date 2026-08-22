import type { Cell, Footprint } from "../modules/types";
import type { BoardSpec } from "./types";

function assertFiniteBounds(footprint: Footprint, board: BoardSpec): void {
  const values = [
    ...footprint.bounds.min,
    ...footprint.bounds.max,
    ...board.bounds.min,
    ...board.bounds.max,
    board.cellPitch,
  ];
  if (!values.every(Number.isFinite) || board.cellPitch <= 0) {
    throw new Error("Footprint and Board bounds must be finite with a positive Cell pitch");
  }

  for (let axis = 0; axis < 3; axis += 1) {
    if (footprint.bounds.min[axis] > footprint.bounds.max[axis]) {
      throw new Error("Footprint bounds min must not exceed max");
    }
    if (
      footprint.bounds.min[axis] < board.bounds.min[axis] ||
      footprint.bounds.max[axis] > board.bounds.max[axis]
    ) {
      throw new Error("Footprint bounds extend outside the Board");
    }
  }
}

function cellCount(span: number, pitch: number): number {
  const count = Math.round(span / pitch);
  if (count <= 0 || Math.abs(count * pitch - span) > 1e-9) {
    throw new Error("Board bounds must align to whole Cells");
  }
  return count;
}

function touchedRange(minOffset: number, maxOffset: number, count: number): readonly number[] {
  const edgeTolerance = 1e-9;
  const first = Math.max(0, Math.ceil(minOffset - edgeTolerance) - 1);
  const last = Math.min(count - 1, Math.floor(maxOffset + edgeTolerance));
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/** Conservatively returns every closed Board Cell touched by the transformed
 * axis-aligned bounds. A bound exactly on a Cell edge occupies both adjacent
 * Cells, except at the Board's outer edge where the range is clamped. */
export function rasterizeFootprintCells(footprint: Footprint, board: BoardSpec): readonly Cell[] {
  assertFiniteBounds(footprint, board);

  const width = board.bounds.max[0] - board.bounds.min[0];
  const height = board.bounds.max[1] - board.bounds.min[1];
  const columnCount = cellCount(width, board.cellPitch);
  const rowCount = cellCount(height, board.cellPitch);
  const columns = touchedRange(
    (footprint.bounds.min[0] - board.bounds.min[0]) / board.cellPitch,
    (footprint.bounds.max[0] - board.bounds.min[0]) / board.cellPitch,
    columnCount,
  );
  const rows = touchedRange(
    (board.bounds.max[1] - footprint.bounds.max[1]) / board.cellPitch,
    (board.bounds.max[1] - footprint.bounds.min[1]) / board.cellPitch,
    rowCount,
  );

  return rows.flatMap((row) => columns.map((column) => ({ column, row })));
}
