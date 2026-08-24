import { ALL_MODULES } from "../modules/registry";
import type { Role, Spec } from "../modules/types";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";
import { ARC, COURSE_OBSTACLE_INVENTORY, enumerateRoleSelections, type RoleSelection } from "./arc";
import { CONNECTOR_EDGE_CLEARANCE, HAIRPIN_REACH_PER_DROP } from "./connectors";
import { COURSE_MODULES, courseModulesByRole, courseParamValues } from "./courseModules";
import { buildFinishSpec, buildStartSpec } from "./startFinish";
import type { BoardSpec } from "./types";

const SLOT_COLUMNS = 8;
const SLOT_ROWS = 3;
const CONNECTOR_MARGIN_CELLS = 2;
const SAME_ROW_CONNECTOR_DROP = SCALE.cellPitch / 2;
const ROLES: readonly Role[] = ["accel", "scatter", "shuffle", "sort"];

interface ProjectedSize {
  readonly travel: number;
  readonly vertical: number;
  readonly depth: number;
  readonly minYFromEntry: number;
  readonly maxYFromEntry: number;
  readonly exitDrop: number;
}

const projectedSizeCache = new Map<string, ProjectedSize>();

function finiteSpan(min: number, max: number, moduleId: string, axis: string): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    throw new Error(`Module ${moduleId} has invalid default ${axis} bounds`);
  }
  return max - min;
}

function projectedSpecSize(spec: Spec, id: string): ProjectedSize {
  const { min, max } = spec.footprint.bounds;
  return Object.freeze({
    travel: finiteSpan(min[2], max[2], id, "travel"),
    vertical: finiteSpan(min[1], max[1], id, "vertical"),
    depth: finiteSpan(min[0], max[0], id, "depth"),
    minYFromEntry: min[1] - spec.footprint.entry.position[1],
    maxYFromEntry: max[1] - spec.footprint.entry.position[1],
    exitDrop: spec.footprint.entry.position[1] - spec.footprint.exit.position[1],
  });
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

  const size = projectedSpecSize(module.buildSpec(courseParamValues(module)), module.id);
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
  const modules = courseModulesByRole(role);
  if (modules.length === 0) {
    throw new Error(`Role ${role} has no registered Module`);
  }

  roleMaxima.set(
    role,
    Object.freeze({
      travel: Math.max(...modules.map((module) => projectedDefaultSize(module.id).travel)),
      vertical: Math.max(...modules.map((module) => projectedDefaultSize(module.id).vertical)),
      depth: Math.max(...modules.map((module) => projectedDefaultSize(module.id).depth)),
      minYFromEntry: Math.min(
        ...modules.map((module) => projectedDefaultSize(module.id).minYFromEntry),
      ),
      maxYFromEntry: Math.max(
        ...modules.map((module) => projectedDefaultSize(module.id).maxYFromEntry),
      ),
      exitDrop: Math.max(...modules.map((module) => projectedDefaultSize(module.id).exitDrop)),
    }),
  );
}

const startSize = projectedSpecSize(buildStartSpec(), "Start");
const finishSize = projectedSpecSize(buildFinishSpec(), "Finish");
const obstacleSizes = [...new Set(COURSE_OBSTACLE_INVENTORY)].map(projectedDefaultSize);
const obstacleMaximum: ProjectedSize = Object.freeze({
  travel: Math.max(...obstacleSizes.map(({ travel }) => travel)),
  vertical: Math.max(...obstacleSizes.map(({ vertical }) => vertical)),
  depth: Math.max(...obstacleSizes.map(({ depth }) => depth)),
  minYFromEntry: Math.min(...obstacleSizes.map(({ minYFromEntry }) => minYFromEntry)),
  maxYFromEntry: Math.max(...obstacleSizes.map(({ maxYFromEntry }) => maxYFromEntry)),
  exitDrop: Math.max(...obstacleSizes.map(({ exitDrop }) => exitDrop)),
});

function slotSize(slot: (typeof ARC)[number], selection: RoleSelection): ProjectedSize {
  if (slot.kind !== "module") {
    return slot.kind === "start" ? startSize : finishSize;
  }
  if (slot.fixedModuleId !== "chute") {
    return obstacleMaximum;
  }
  return projectedDefaultSize(slot.fixedModuleId ?? selection[slot.role]);
}

function maximumRowSpan(): number {
  let maximum = 0;
  for (const selection of enumerateRoleSelections()) {
    for (let row = 0; row < SLOT_ROWS; row += 1) {
      let entryY = 0;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const slot of ARC.filter((candidate) => candidate.row === row)) {
        const size = slotSize(slot, selection);
        minY = Math.min(minY, entryY + size.minYFromEntry);
        maxY = Math.max(maxY, entryY + size.maxYFromEntry);
        entryY -= size.exitDrop + SAME_ROW_CONNECTOR_DROP;
      }
      maximum = Math.max(maximum, maxY - minY);
    }
  }
  return maximum;
}

const connectorMargin = CONNECTOR_MARGIN_CELLS * SCALE.cellPitch;
const bayWidth =
  roundUpToCell(Math.max(...ROLES.map((role) => roleMaxima.get(role)!.travel))) +
  connectorMargin * 2;
const bayHeight = roundUpToCell(maximumRowSpan()) + connectorMargin * 2;
const maximumIncomingEnergyHeight = Math.max(
  startSize.exitDrop,
  ...ROLES.map((role) => roleMaxima.get(role)!.exitDrop),
);
// A speed-derived rail can project its full height beyond the hairpin
// centreline when the sloped channel rotates its local up axis.
const edgeMargin = roundUpToCell(
  CONNECTOR_EDGE_CLEARANCE +
    HAIRPIN_REACH_PER_DROP * bayHeight * 2 +
    maximumIncomingEnergyHeight +
    bayHeight / 2 +
    SCALE.marbleRadius * 2,
);
const boardWidth = SLOT_COLUMNS * bayWidth + edgeMargin * 2;
const boardHeight = SLOT_ROWS * bayHeight + edgeMargin * 2;
const boardDepth =
  roundUpToCell(Math.max(...ROLES.map((role) => roleMaxima.get(role)!.depth))) + edgeMargin * 2;

for (const module of COURSE_MODULES) {
  const size = projectedDefaultSize(module.id);
  if (
    size.travel > bayWidth - connectorMargin * 2 ||
    size.vertical > bayHeight - connectorMargin * 2
  ) {
    throw new Error(`Module ${module.id} (${module.role}) default bounds do not fit its Board bay`);
  }
}

export const BOARD: BoardSpec = Object.freeze({
  columns: SLOT_COLUMNS,
  rows: SLOT_ROWS,
  cellPitch: SCALE.cellPitch,
  bayWidth,
  bayHeight,
  edgeMargin,
  bounds: Object.freeze({
    min: vector(-boardWidth / 2, -boardHeight / 2, -boardDepth / 2),
    max: vector(boardWidth / 2, boardHeight / 2, boardDepth / 2),
  }),
});
