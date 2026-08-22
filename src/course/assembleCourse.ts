import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { defaultParamValues, type ParamValues } from "../modules/params";
import { ALL_MODULES } from "../modules/registry";
import type { Anchor, Cell, Role, Spec } from "../modules/types";
import { SCALE } from "../race/scale";
import type { Quaternion, Vector3 } from "../race/types";
import { ARC, selectRoleModules, type RoleSelection } from "./arc";
import { BOARD } from "./board";
import { buildCourseConnector } from "./connectors";
import {
  rasterizeAnchorSeamCells,
  rasterizeCuboidCells,
  rasterizeFootprintCells,
} from "./occupancy";
import { buildFinishSpec, buildStartSpec } from "./startFinish";
import { transformSpec } from "./transformSpec";
import type {
  ArcSlot,
  Course,
  CourseCheckpoint,
  CourseConnector,
  CoursePlacement,
  PlacedModule,
} from "./types";

const SLOT_PADDING = SCALE.cellPitch * 2;
const SAME_ROW_CONNECTOR_DROP = SCALE.cellPitch / 2;
const EPSILON = 1e-9;

interface SlotDraft {
  readonly slot: ArcSlot;
  readonly localSpec: Spec;
  readonly moduleId?: string;
  readonly role?: Role;
  readonly params?: ParamValues;
  readonly placement: CoursePlacement;
}

interface PlacedSlot extends SlotDraft {
  readonly spec: Spec;
}

interface CourseElement {
  readonly id: string;
  readonly fromSlotIndex: number;
  readonly toSlotIndex: number;
  readonly spec: Spec;
}

function yaw(direction: ArcSlot["direction"]): Quaternion {
  const angle = direction === "right" ? Math.PI / 2 : -Math.PI / 2;
  const rotation = new ThreeQuaternion().setFromAxisAngle(new ThreeVector3(0, 1, 0), angle);
  return [rotation.x, rotation.y, rotation.z, rotation.w];
}

function localSpecForSlot(slot: ArcSlot, selection: RoleSelection): Omit<SlotDraft, "placement"> {
  if (slot.kind !== "module") {
    return {
      slot,
      localSpec: slot.kind === "start" ? buildStartSpec() : buildFinishSpec(),
    };
  }

  const moduleId = selection[slot.role];
  const module = ALL_MODULES.find(({ id }) => id === moduleId);
  if (!module || module.role !== slot.role) {
    throw new Error(`Module ${moduleId} does not satisfy Slot ${slot.slotIndex} Role ${slot.role}`);
  }
  const params = defaultParamValues(module.meta.params);
  return { slot, localSpec: module.buildSpec(params), moduleId, role: slot.role, params };
}

function horizontalPlacement(slot: ArcSlot, localSpec: Spec): CoursePlacement {
  const rotation = yaw(slot.direction);
  const rotated = transformSpec(
    localSpec,
    { position: [0, 0, 0], rotation },
    `probe-${slot.slotIndex}`,
  );
  const bayMin = BOARD.bounds.min[0] + BOARD.edgeMargin + slot.column * BOARD.bayWidth;
  const bayMax = bayMin + BOARD.bayWidth;
  const x =
    slot.direction === "right"
      ? bayMin + SLOT_PADDING - rotated.footprint.bounds.min[0]
      : bayMax - SLOT_PADDING - rotated.footprint.bounds.max[0];
  const z = -(rotated.footprint.bounds.min[2] + rotated.footprint.bounds.max[2]) / 2;
  return { position: [x, 0, z], rotation };
}

function placeRows(selection: RoleSelection): readonly PlacedSlot[] {
  const placed: PlacedSlot[] = [];

  for (let row = 0; row < BOARD.rows; row += 1) {
    const rowDrafts: SlotDraft[] = [];
    let previousExitY: number | undefined;

    for (const slot of ARC.filter((candidate) => candidate.row === row)) {
      const draft = localSpecForSlot(slot, selection);
      const horizontal = horizontalPlacement(slot, draft.localSpec);
      const rotated = transformSpec(
        draft.localSpec,
        horizontal,
        `probe-row-${row}-${slot.slotIndex}`,
      );
      const desiredEntryY =
        previousExitY === undefined ? 0 : previousExitY - SAME_ROW_CONNECTOR_DROP;
      const placement: CoursePlacement = {
        ...horizontal,
        position: [
          horizontal.position[0],
          desiredEntryY - rotated.footprint.entry.position[1],
          horizontal.position[2],
        ],
      };
      const provisional = transformSpec(draft.localSpec, placement, `slot-${slot.slotIndex}`);
      previousExitY = provisional.footprint.exit.position[1];
      rowDrafts.push({ ...draft, placement });
    }

    const provisional = rowDrafts.map((draft) =>
      transformSpec(draft.localSpec, draft.placement, `slot-${draft.slot.slotIndex}`),
    );
    const unionMin = Math.min(...provisional.map(({ footprint }) => footprint.bounds.min[1]));
    const unionMax = Math.max(...provisional.map(({ footprint }) => footprint.bounds.max[1]));
    const rowTop = BOARD.bounds.max[1] - BOARD.edgeMargin - row * BOARD.bayHeight;
    const rowBottom = rowTop - BOARD.bayHeight;
    if (unionMax - unionMin > BOARD.bayHeight - SLOT_PADDING * 2 + EPSILON) {
      throw new Error(
        `Course row ${row} does not fit its Board bays: span=${unionMax - unionMin}, usable=${BOARD.bayHeight - SLOT_PADDING * 2}`,
      );
    }
    const rowShift = (rowTop + rowBottom) / 2 - (unionMin + unionMax) / 2;

    for (const draft of rowDrafts) {
      const placement: CoursePlacement = {
        ...draft.placement,
        position: [
          draft.placement.position[0],
          draft.placement.position[1] + rowShift,
          draft.placement.position[2],
        ],
      };
      const transformed = transformSpec(draft.localSpec, placement, `slot-${draft.slot.slotIndex}`);
      const cells = rasterizeFootprintCells(transformed.footprint, BOARD);
      placed.push({
        ...draft,
        placement,
        spec: { ...transformed, footprint: { ...transformed.footprint, cells } },
      });
    }
  }

  return placed.sort((left, right) => left.slot.slotIndex - right.slot.slotIndex);
}

function routeDistance(a: Vector3, b: Vector3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function estimateIncomingSpeed(spec: Spec): number {
  const drop = Math.max(0, spec.footprint.entry.position[1] - spec.footprint.exit.position[1]);
  return Math.sqrt(2 * Math.hypot(...SCALE.gravity) * drop);
}

function connectorWithCells(spec: Spec, id: string): Spec {
  try {
    const cells = rasterizeCuboidCells(spec.colliders, spec.footprint, BOARD);
    return { ...spec, footprint: { ...spec.footprint, cells } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${id} cannot occupy Board Cells: ${message}`);
  }
}

function buildConnectors(slots: readonly PlacedSlot[]): readonly CourseConnector[] {
  return slots.slice(0, -1).map((from, index) => {
    const to = slots[index + 1];
    const connector = buildCourseConnector({
      id: `connector-${from.slot.slotIndex}-${to.slot.slotIndex}`,
      fromSlotIndex: from.slot.slotIndex,
      toSlotIndex: to.slot.slotIndex,
      start: from.spec.footprint.exit,
      end: to.spec.footprint.entry,
      incomingSpeed: estimateIncomingSpeed(from.spec),
    });
    return { ...connector, spec: connectorWithCells(connector.spec, connector.id) };
  });
}

function cellKey(cell: Cell): string {
  return `${cell.row}:${cell.column}`;
}

function anchorSeamCells(anchor: Anchor): ReadonlySet<string> {
  return new Set(
    rasterizeAnchorSeamCells(anchor, BOARD, SCALE.marbleRadius, SCALE.marbleRadius * 2).map(
      cellKey,
    ),
  );
}

function assertConnected(previous: CourseElement, next: CourseElement): void {
  const exit = previous.spec.footprint.exit;
  const entry = next.spec.footprint.entry;
  if (routeDistance(exit.position, entry.position) > SCALE.marbleRadius + EPSILON) {
    throw new Error(`${previous.id} and ${next.id} Anchors are disconnected`);
  }
  const tangentDot =
    exit.tangent[0] * entry.tangent[0] +
    exit.tangent[1] * entry.tangent[1] +
    exit.tangent[2] * entry.tangent[2];
  if (tangentDot <= 0) {
    throw new Error(`${previous.id} and ${next.id} tangents oppose`);
  }
}

function assertRoute(id: string, route: readonly Vector3[]): void {
  if (route.length < 2 || route.some((point) => !point.every(Number.isFinite))) {
    throw new Error(`${id} has an invalid route`);
  }
  for (let index = 1; index < route.length; index += 1) {
    if (routeDistance(route[index - 1], route[index]) <= EPSILON) {
      throw new Error(`${id} has a zero-length route segment`);
    }
  }
}

function assertUniqueIds(elements: readonly CourseElement[]): void {
  const colliderIds = elements.flatMap(({ spec }) => spec.colliders.map(({ id }) => id));
  const visualIds = elements.flatMap(({ spec }) => spec.visuals.map(({ id }) => id));
  if (
    new Set(colliderIds).size !== colliderIds.length ||
    new Set(visualIds).size !== visualIds.length
  ) {
    throw new Error("Course collider and visual ids must be globally unique");
  }
}

function assertModuleFitsBay(slot: PlacedSlot): void {
  if (slot.slot.kind !== "module") {
    return;
  }
  const bayMinX = BOARD.bounds.min[0] + BOARD.edgeMargin + slot.slot.column * BOARD.bayWidth;
  const bayMaxX = bayMinX + BOARD.bayWidth;
  const bayMaxY = BOARD.bounds.max[1] - BOARD.edgeMargin - slot.slot.row * BOARD.bayHeight;
  const bayMinY = bayMaxY - BOARD.bayHeight;
  const bounds = slot.spec.footprint.bounds;
  if (
    bounds.min[0] < bayMinX - EPSILON ||
    bounds.max[0] > bayMaxX + EPSILON ||
    bounds.min[1] < bayMinY - EPSILON ||
    bounds.max[1] > bayMaxY + EPSILON
  ) {
    throw new Error(
      `Module ${slot.moduleId} (${slot.role}) does not fit Slot ${slot.slot.slotIndex}`,
    );
  }
}

function assertCellOverlap(elements: readonly CourseElement[]): void {
  for (let leftIndex = 0; leftIndex < elements.length; leftIndex += 1) {
    const left = elements[leftIndex];
    const leftCells = new Set(left.spec.footprint.cells.map(cellKey));
    for (let rightIndex = leftIndex + 1; rightIndex < elements.length; rightIndex += 1) {
      const right = elements[rightIndex];
      const overlap = right.spec.footprint.cells.map(cellKey).filter((key) => leftCells.has(key));
      if (overlap.length === 0) {
        continue;
      }
      const seam = anchorSeamCells(left.spec.footprint.exit);
      const sameSlotNeighborhood = right.fromSlotIndex <= left.toSlotIndex;
      const consecutiveHasSeam =
        rightIndex !== leftIndex + 1 || overlap.some((key) => seam.has(key));
      if (!sameSlotNeighborhood || !consecutiveHasSeam) {
        throw new Error(`${left.id} and ${right.id} overlap outside their local Slot neighborhood`);
      }
    }
  }
}

function interleaveElements(
  slots: readonly PlacedSlot[],
  connectors: readonly CourseConnector[],
): readonly CourseElement[] {
  const elements: CourseElement[] = [];
  slots.forEach((slot, index) => {
    elements.push({
      id: `slot-${slot.slot.slotIndex}`,
      fromSlotIndex: slot.slot.slotIndex,
      toSlotIndex: slot.slot.slotIndex,
      spec: slot.spec,
    });
    const connector = connectors[index];
    if (connector) {
      elements.push({ ...connector, spec: connector.spec });
    }
  });
  return elements;
}

function appendRoute(target: Vector3[], route: readonly Vector3[]): number {
  for (const point of route) {
    const previous = target.at(-1);
    if (!previous || routeDistance(previous, point) > EPSILON) {
      target.push(point);
    }
  }
  return target.slice(1).reduce((distance, point, index) => {
    return distance + routeDistance(target[index], point);
  }, 0);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export function assembleCourseFromRoleSelection(seed: number, selection: RoleSelection): Course {
  const slots = placeRows(selection);
  const connectors = buildConnectors(slots);
  const elements = interleaveElements(slots, connectors);

  elements.forEach((element, index) => {
    assertRoute(element.id, element.spec.footprint.route);
    if (index > 0) {
      assertConnected(elements[index - 1], element);
    }
  });
  slots.forEach(assertModuleFitsBay);
  assertUniqueIds(elements);
  assertCellOverlap(elements);

  const route: Vector3[] = [];
  const checkpoints: CourseCheckpoint[] = [];
  slots.forEach((slot, index) => {
    const distance = appendRoute(route, slot.spec.footprint.route);
    checkpoints.push({
      slotIndex: slot.slot.slotIndex,
      anchor: slot.spec.footprint.exit,
      routeDistance: distance,
    });
    const connector = connectors[index];
    if (connector) {
      appendRoute(route, connector.spec.footprint.route);
    }
  });

  const modules: PlacedModule[] = slots.flatMap((slot) => {
    if (slot.slot.kind !== "module" || !slot.moduleId || !slot.role || !slot.params) {
      return [];
    }
    return [
      {
        slotIndex: slot.slot.slotIndex,
        role: slot.role,
        moduleId: slot.moduleId,
        params: slot.params,
        placement: slot.placement,
        spec: slot.spec,
      },
    ];
  });
  const start = slots[0].spec;
  const finish = slots.at(-1)!.spec;

  return deepFreeze({
    seed,
    board: BOARD,
    modules,
    connectors,
    route,
    checkpoints,
    start,
    finish,
    entry: start.footprint.entry,
    exit: finish.footprint.exit,
  });
}

export function assembleCourse(seed: number): Course {
  return assembleCourseFromRoleSelection(seed, selectRoleModules(seed));
}
