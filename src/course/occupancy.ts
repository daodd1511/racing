import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import type { Cell, ColliderSpec, Footprint } from "../modules/types";
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

type Point2 = readonly [number, number];

function convexHull(points: readonly Point2[]): readonly Point2[] {
  const sorted = [
    ...new Map(points.map((point) => [`${point[0]}:${point[1]}`, point])).values(),
  ].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  if (sorted.length <= 2) {
    return sorted;
  }
  const cross = (origin: Point2, a: Point2, b: Point2) =>
    (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  const half = (source: readonly Point2[]) => {
    const result: Point2[] = [];
    for (const point of source) {
      while (result.length >= 2 && cross(result.at(-2)!, result.at(-1)!, point) <= 0) {
        result.pop();
      }
      result.push(point);
    }
    return result;
  };
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
}

function polygonsOverlap(left: readonly Point2[], right: readonly Point2[]): boolean {
  const axes: Point2[] = [
    [1, 0],
    [0, 1],
  ];
  for (const polygon of [left, right]) {
    polygon.forEach((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      const dx = next[0] - point[0];
      const dy = next[1] - point[1];
      const length = Math.hypot(dx, dy);
      if (length > 1e-12) {
        axes.push([-dy / length, dx / length]);
      }
    });
  }
  return axes.every((axis) => {
    const project = (polygon: readonly Point2[]) =>
      polygon.reduce(
        (range, point) => {
          const value = point[0] * axis[0] + point[1] * axis[1];
          return [Math.min(range[0], value), Math.max(range[1], value)] as const;
        },
        [Infinity, -Infinity] as const,
      );
    const a = project(left);
    const b = project(right);
    return a[1] >= b[0] - 1e-9 && b[1] >= a[0] - 1e-9;
  });
}

function cuboidProjection(collider: ColliderSpec): readonly Point2[] {
  if (collider.shape.kind !== "cuboid") {
    throw new Error(`Collider ${collider.id} must be a cuboid for projected Cell rasterization`);
  }
  const rotation = new ThreeQuaternion(...collider.rotation);
  const center = new ThreeVector3(...collider.position);
  const points: Point2[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner = new ThreeVector3(
          sx * collider.shape.halfExtents[0],
          sy * collider.shape.halfExtents[1],
          sz * collider.shape.halfExtents[2],
        )
          .applyQuaternion(rotation)
          .add(center);
        points.push([corner.x, corner.y]);
      }
    }
  }
  return convexHull(points);
}

/** Conservatively rasterizes each projected oriented cuboid separately, so
 * a bent connector does not claim the empty interior of its outer AABB. */
export function rasterizeCuboidCells(
  colliders: readonly ColliderSpec[],
  footprint: Footprint,
  board: BoardSpec,
): readonly Cell[] {
  assertFiniteBounds(footprint, board);
  const occupied = new Map<string, Cell>();
  for (const collider of colliders) {
    const polygon = cuboidProjection(collider);
    const minX = Math.min(...polygon.map(([x]) => x));
    const maxX = Math.max(...polygon.map(([x]) => x));
    const minY = Math.min(...polygon.map(([, y]) => y));
    const maxY = Math.max(...polygon.map(([, y]) => y));
    const candidates = rasterizeFootprintCells(
      {
        ...footprint,
        bounds: { min: [minX, minY, board.bounds.min[2]], max: [maxX, maxY, board.bounds.max[2]] },
      },
      board,
    );
    for (const cell of candidates) {
      const cellMinX = board.bounds.min[0] + cell.column * board.cellPitch;
      const cellMaxY = board.bounds.max[1] - cell.row * board.cellPitch;
      const rectangle: readonly Point2[] = [
        [cellMinX, cellMaxY - board.cellPitch],
        [cellMinX + board.cellPitch, cellMaxY - board.cellPitch],
        [cellMinX + board.cellPitch, cellMaxY],
        [cellMinX, cellMaxY],
      ];
      if (polygonsOverlap(polygon, rectangle)) {
        occupied.set(`${cell.row}:${cell.column}`, cell);
      }
    }
  }
  return [...occupied.values()].sort(
    (left, right) => left.row - right.row || left.column - right.column,
  );
}
