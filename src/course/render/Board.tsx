import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { BoardSpec } from "../types";
import type { Vector3 } from "../../race/types";

const BACKSTOP_DEPTH = 0.08;
const HOLE_RADIUS_RATIO = 0.16;
const HOLE_SURFACE_OFFSET = 0.0005;
const BOARD_MATERIAL = Object.freeze({ color: "#20262c", metalness: 0.16, roughness: 0.72 });
const HOLE_COLOR = "#11161b";

export interface BoardGrid {
  readonly columns: number;
  readonly rows: number;
}

export interface BoardProps {
  readonly board: BoardSpec;
}

export function gridForBoard(board: BoardSpec): BoardGrid {
  const width = board.bounds.max[0] - board.bounds.min[0];
  const height = board.bounds.max[1] - board.bounds.min[1];
  return Object.freeze({
    columns: Math.round(width / board.cellPitch),
    rows: Math.round(height / board.cellPitch),
  });
}

export function holePositionsForBoard(board: BoardSpec): readonly Vector3[] {
  const grid = gridForBoard(board);
  const z = board.bounds.min[2] + HOLE_SURFACE_OFFSET;
  const positions: Vector3[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    const y = board.bounds.min[1] + (row + 0.5) * board.cellPitch;
    for (let column = 0; column < grid.columns; column += 1) {
      positions.push([board.bounds.min[0] + (column + 0.5) * board.cellPitch, y, z]);
    }
  }

  return Object.freeze(positions);
}

/** Render-only Board backstop. The grid shares `BoardSpec.cellPitch` with
 * Course occupancy, so it never changes when a seed swaps Module roles. */
export function Board({ board }: BoardProps) {
  const holeMeshRef = useRef<THREE.InstancedMesh>(null);
  const holes = useMemo(() => holePositionsForBoard(board), [board]);
  const width = board.bounds.max[0] - board.bounds.min[0];
  const height = board.bounds.max[1] - board.bounds.min[1];
  const centerX = (board.bounds.min[0] + board.bounds.max[0]) / 2;
  const centerY = (board.bounds.min[1] + board.bounds.max[1]) / 2;
  const backstopZ = board.bounds.min[2] - BACKSTOP_DEPTH / 2;

  useLayoutEffect(() => {
    const mesh = holeMeshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    for (const [index, position] of holes.entries()) {
      mesh.setMatrixAt(index, matrix.makeTranslation(...position));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [holes]);

  return (
    <group name="course-board">
      <mesh position={[centerX, centerY, backstopZ]} receiveShadow>
        <boxGeometry args={[width, height, BACKSTOP_DEPTH]} />
        <meshStandardMaterial {...BOARD_MATERIAL} />
      </mesh>
      <instancedMesh ref={holeMeshRef} args={[undefined, undefined, holes.length]}>
        <circleGeometry args={[board.cellPitch * HOLE_RADIUS_RATIO, 8]} />
        <meshBasicMaterial color={HOLE_COLOR} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
