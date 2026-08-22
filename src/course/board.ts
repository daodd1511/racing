import { defaultParamValues } from "../modules/params";
import { ALL_MODULES } from "../modules/registry";
import type { Role } from "../modules/types";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";
import type { BoardSpec } from "./types";

const SLOT_COLUMNS = 3;
const SLOT_ROWS = 3;
const CONNECTOR_MARGIN_CELLS = 2;
const BOARD_EDGE_MARGIN_CELLS = 1;
const ROLES: readonly Role[] = ["accel", "scatter", "shuffle", "sort", "queue"];

interface ProjectedSize {
  readonly travel: number;
  readonly vertical: number;
  readonly depth: number;
}

const projectedSizeCache = new Map<string, ProjectedSize>();

function finiteSpan(min: number, max: number, moduleId: string, axis: string): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    throw new Error(`Module ${moduleId} has invalid default ${axis} bounds`);
  }
  return max - min;
}

function projectedDefaultSize(moduleId: string): ProjectedSize {
  const cached = projectedSizeCache.get(moduleId);
  if (cached) {
    return cached;
  }
  const module = ALL_MODULES.find((candidate) => candidate.id === moduleId);
  if (!module) {
    throw new Error(`Unknown Module ${moduleId}`);
  }

  const { min, max } = module.buildSpec(defaultParamValues(module.meta.params)).footprint.bounds;
  const size = Object.freeze({
    travel: finiteSpan(min[2], max[2], module.id, "travel"),
    vertical: finiteSpan(min[1], max[1], module.id, "vertical"),
    depth: finiteSpan(min[0], max[0], module.id, "depth"),
  });
  projectedSizeCache.set(moduleId, size);
  return size;
}

function roundUpToCell(value: number): number {
  return Math.ceil(value / SCALE.cellPitch) * SCALE.cellPitch;
}

function vector(x: number, y: number, z: number): Vector3 {
  return Object.freeze([x, y, z]);
}

const roleMaxima = new Map<Role, ProjectedSize>();
for (const role of ROLES) {
  const modules = ALL_MODULES.filter((module) => module.role === role);
  if (modules.length === 0) {
    throw new Error(`Role ${role} has no registered Module`);
  }

  roleMaxima.set(
    role,
    Object.freeze({
      travel: Math.max(...modules.map((module) => projectedDefaultSize(module.id).travel)),
      vertical: Math.max(...modules.map((module) => projectedDefaultSize(module.id).vertical)),
      depth: Math.max(...modules.map((module) => projectedDefaultSize(module.id).depth)),
    }),
  );
}

const connectorMargin = CONNECTOR_MARGIN_CELLS * SCALE.cellPitch;
const edgeMargin = BOARD_EDGE_MARGIN_CELLS * SCALE.cellPitch;
const bayTravel =
  roundUpToCell(Math.max(...ROLES.map((role) => roleMaxima.get(role)!.travel))) +
  connectorMargin * 2;
const bayVertical =
  roundUpToCell(Math.max(...ROLES.map((role) => roleMaxima.get(role)!.vertical))) +
  connectorMargin * 2;
const boardWidth = SLOT_COLUMNS * bayTravel + edgeMargin * 2;
const boardHeight = SLOT_ROWS * bayVertical + edgeMargin * 2;
const boardDepth =
  roundUpToCell(Math.max(...ROLES.map((role) => roleMaxima.get(role)!.depth))) + edgeMargin * 2;

for (const module of ALL_MODULES) {
  const size = projectedDefaultSize(module.id);
  const usableTravel = bayTravel - connectorMargin * 2;
  const usableVertical = bayVertical - connectorMargin * 2;
  if (size.travel > usableTravel || size.vertical > usableVertical) {
    throw new Error(`Module ${module.id} (${module.role}) default bounds do not fit its Board bay`);
  }
}

export const BOARD: BoardSpec = Object.freeze({
  columns: SLOT_COLUMNS,
  rows: SLOT_ROWS,
  cellPitch: SCALE.cellPitch,
  bounds: Object.freeze({
    min: vector(-boardWidth / 2, -boardHeight / 2, -boardDepth / 2),
    max: vector(boardWidth / 2, boardHeight / 2, boardDepth / 2),
  }),
});
