import { ALL_MODULES } from "../modules/registry";
import type { Spec } from "../modules/types";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";
import { ARC } from "./arc";
import { CONNECTOR_EDGE_CLEARANCE, HAIRPIN_REACH_PER_DROP } from "./connectors";
import { courseParamValues } from "./courseModules";
import { buildFinishSpec, buildStartSpec } from "./startFinish";
import type { BoardSpec } from "./types";

const SLOT_COLUMNS = 8;
const SLOT_ROWS = 3;
const connectorMargin = 2 * SCALE.cellPitch;
const SAME_ROW_CONNECTOR_DROP = SCALE.cellPitch / 2;

function roundUpToCell(value: number): number {
  // Blender saves float32 frames; sub-micrometer roundoff must not add a whole Cell.
  return Math.ceil(value / SCALE.cellPitch - 1e-5) * SCALE.cellPitch;
}
function vector(x: number, y: number, z: number): Vector3 {
  return Object.freeze([x, y, z]);
}

interface ProjectedSize {
  readonly travel: number;
  readonly vertical: number;
  readonly depth: number;
  readonly minYFromEntry: number;
  readonly maxYFromEntry: number;
  readonly exitDrop: number;
}

function finiteSpan(min: number, max: number, moduleId: string, axis: string): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    throw new Error(`Module ${moduleId} has invalid default ${axis} bounds`);
  }
  return max - min;
}

function projectedSpecSize(spec: Spec, id: string): ProjectedSize {
  const { min, max } = spec.footprint.bounds;
  if (![...spec.footprint.entry.position, ...spec.footprint.exit.position].every(Number.isFinite))
    throw new Error(`Module ${id} has non-finite Anchors`);
  return Object.freeze({
    travel: finiteSpan(min[2], max[2], id, "travel"),
    vertical: finiteSpan(min[1], max[1], id, "vertical"),
    depth: finiteSpan(min[0], max[0], id, "depth"),
    minYFromEntry: min[1] - spec.footprint.entry.position[1],
    maxYFromEntry: max[1] - spec.footprint.entry.position[1],
    exitDrop: spec.footprint.entry.position[1] - spec.footprint.exit.position[1],
  });
}

/** Specs follow the Arc's slot order, including Start and Finish. */
export function buildBoard(specs: readonly Spec[]): BoardSpec {
  if (specs.length !== ARC.length)
    throw new Error(`Board needs ${ARC.length} configured Slot Specs`);
  const sizes = specs.map((spec, index) => projectedSpecSize(spec, `slot-${index}`));
  const modules = sizes.filter((_, i) => ARC[i].kind === "module");
  const obstacles = sizes.filter(
    (_, i) => ARC[i].kind === "module" && ARC[i].fixedModuleId !== "chute",
  );
  const obstacleMaximum: ProjectedSize = {
    travel: Math.max(...obstacles.map((size) => size.travel)),
    vertical: Math.max(...obstacles.map((size) => size.vertical)),
    depth: Math.max(...obstacles.map((size) => size.depth)),
    minYFromEntry: Math.min(...obstacles.map((size) => size.minYFromEntry)),
    maxYFromEntry: Math.max(...obstacles.map((size) => size.maxYFromEntry)),
    exitDrop: Math.max(...obstacles.map((size) => size.exitDrop)),
  };
  let rowSpan = 0;
  for (let row = 0; row < SLOT_ROWS; row++) {
    let entryY = 0,
      minY = Infinity,
      maxY = -Infinity;
    for (const slot of ARC.filter((item) => item.row === row)) {
      const size =
        slot.kind === "module" && slot.fixedModuleId !== "chute"
          ? obstacleMaximum
          : sizes[slot.slotIndex];
      minY = Math.min(minY, entryY + size.minYFromEntry);
      maxY = Math.max(maxY, entryY + size.maxYFromEntry);
      entryY -= size.exitDrop + SAME_ROW_CONNECTOR_DROP;
    }
    rowSpan = Math.max(rowSpan, maxY - minY);
  }
  const bayWidth =
    roundUpToCell(Math.max(...modules.map((size) => size.travel))) + connectorMargin * 2;
  const bayHeight = roundUpToCell(rowSpan) + connectorMargin * 2;
  const maximumDrop = Math.max(...sizes.map((size) => size.exitDrop));
  const edgeMargin = roundUpToCell(
    CONNECTOR_EDGE_CLEARANCE +
      HAIRPIN_REACH_PER_DROP * bayHeight * 2 +
      maximumDrop +
      bayHeight / 2 +
      SCALE.marbleRadius * 2,
  );
  const width = SLOT_COLUMNS * bayWidth + edgeMargin * 2;
  const height = SLOT_ROWS * bayHeight + edgeMargin * 2;
  const depth = roundUpToCell(Math.max(...modules.map((size) => size.depth))) + edgeMargin * 2;
  return Object.freeze({
    columns: SLOT_COLUMNS,
    rows: SLOT_ROWS,
    cellPitch: SCALE.cellPitch,
    bayWidth,
    bayHeight,
    edgeMargin,
    bounds: Object.freeze({
      min: vector(-width / 2, -height / 2, -depth / 2),
      max: vector(width / 2, height / 2, depth / 2),
    }),
  });
}

/** Compatibility Board for callers using the original Course defaults. */
export const BOARD = buildBoard(
  ARC.map((slot) => {
    if (slot.kind !== "module") return slot.kind === "start" ? buildStartSpec() : buildFinishSpec();
    const module = ALL_MODULES.find((entry) => entry.id === slot.fixedModuleId);
    if (!module) throw new Error(`Unknown Module ${slot.fixedModuleId}`);
    return module.buildSpec(courseParamValues(module));
  }),
);
