import type { Role } from "../modules/types";
import { createSeededRandom, deriveRaceSeed } from "../race/random";
import { COURSE_MODULES, courseModulesByRole } from "./courseModules";
import type { ArcSlot } from "./types";

const ARC_SLOTS = [
  { slotIndex: 0, kind: "start", column: 0, row: 0, direction: "right" },
  {
    slotIndex: 1,
    kind: "module",
    role: "accel",
    fixedModuleId: "chute",
    column: 1,
    row: 0,
    direction: "right",
  },
  {
    slotIndex: 2,
    kind: "module",
    role: "scatter",
    fixedModuleId: "pin-field",
    column: 2,
    row: 0,
    direction: "right",
  },
  {
    slotIndex: 3,
    kind: "module",
    role: "accel",
    fixedModuleId: "chute",
    column: 3,
    row: 0,
    direction: "right",
  },
  {
    slotIndex: 4,
    kind: "module",
    role: "sort",
    fixedModuleId: "staircase",
    column: 4,
    row: 0,
    direction: "right",
  },
  {
    slotIndex: 5,
    kind: "module",
    role: "accel",
    fixedModuleId: "chute",
    column: 5,
    row: 0,
    direction: "right",
  },
  {
    slotIndex: 6,
    kind: "module",
    role: "shuffle",
    fixedModuleId: "whoops",
    column: 6,
    row: 0,
    direction: "right",
  },
  {
    slotIndex: 7,
    kind: "module",
    role: "accel",
    fixedModuleId: "chute",
    column: 7,
    row: 0,
    direction: "right",
  },
  {
    slotIndex: 8,
    kind: "module",
    role: "accel",
    fixedModuleId: "chute",
    column: 7,
    row: 1,
    direction: "left",
  },
  {
    slotIndex: 9,
    kind: "module",
    role: "scatter",
    fixedModuleId: "pin-field",
    column: 6,
    row: 1,
    direction: "left",
  },
  {
    slotIndex: 10,
    kind: "module",
    role: "accel",
    fixedModuleId: "chute",
    column: 5,
    row: 1,
    direction: "left",
  },
  {
    slotIndex: 11,
    kind: "module",
    role: "sort",
    fixedModuleId: "staircase",
    column: 4,
    row: 1,
    direction: "left",
  },
  {
    slotIndex: 12,
    kind: "module",
    role: "accel",
    fixedModuleId: "chute",
    column: 3,
    row: 1,
    direction: "left",
  },
  {
    slotIndex: 13,
    kind: "module",
    role: "shuffle",
    fixedModuleId: "whoops",
    column: 2,
    row: 1,
    direction: "left",
  },
  {
    slotIndex: 14,
    kind: "module",
    role: "accel",
    fixedModuleId: "chute",
    column: 1,
    row: 1,
    direction: "left",
  },
  {
    slotIndex: 15,
    kind: "module",
    role: "scatter",
    fixedModuleId: "pin-field",
    column: 0,
    row: 1,
    direction: "left",
  },
  {
    slotIndex: 16,
    kind: "module",
    role: "accel",
    fixedModuleId: "chute",
    column: 0,
    row: 2,
    direction: "right",
  },
  {
    slotIndex: 17,
    kind: "module",
    role: "sort",
    fixedModuleId: "staircase",
    column: 1,
    row: 2,
    direction: "right",
  },
  {
    slotIndex: 18,
    kind: "module",
    role: "accel",
    fixedModuleId: "chute",
    column: 2,
    row: 2,
    direction: "right",
  },
  {
    slotIndex: 19,
    kind: "module",
    role: "shuffle",
    fixedModuleId: "whoops",
    column: 3,
    row: 2,
    direction: "right",
  },
  {
    slotIndex: 20,
    kind: "module",
    role: "accel",
    fixedModuleId: "chute",
    column: 4,
    row: 2,
    direction: "right",
  },
  {
    slotIndex: 21,
    kind: "module",
    role: "scatter",
    fixedModuleId: "pin-field",
    column: 5,
    row: 2,
    direction: "right",
  },
  {
    slotIndex: 22,
    kind: "module",
    role: "accel",
    fixedModuleId: "chute",
    column: 6,
    row: 2,
    direction: "right",
  },
  { slotIndex: 23, kind: "finish", column: 7, row: 2, direction: "right" },
] as const satisfies readonly ArcSlot[];

export const ARC: readonly ArcSlot[] = Object.freeze(
  ARC_SLOTS.map((slot) => Object.freeze({ ...slot })),
);

export const COURSE_OBSTACLE_INVENTORY: readonly string[] = Object.freeze([
  "pin-field",
  "pin-field",
  "pin-field",
  "pin-field",
  "whoops",
  "whoops",
  "whoops",
  "staircase",
  "staircase",
  "staircase",
]);

function shuffleObstaclesWithoutRepeats(random: () => number): string[] {
  const remaining = new Map<string, number>();
  for (const moduleId of COURSE_OBSTACLE_INVENTORY) {
    remaining.set(moduleId, (remaining.get(moduleId) ?? 0) + 1);
  }

  const shuffled: string[] = [];
  function placeNext(): boolean {
    if (shuffled.length === COURSE_OBSTACLE_INVENTORY.length) return true;

    const previous = shuffled.at(-1);
    const candidates = [...remaining.entries()]
      .filter(([moduleId, count]) => count > 0 && moduleId !== previous)
      .map(([moduleId]) => moduleId);
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }

    for (const moduleId of candidates) {
      remaining.set(moduleId, remaining.get(moduleId)! - 1);
      shuffled.push(moduleId);
      if (placeNext()) return true;
      shuffled.pop();
      remaining.set(moduleId, remaining.get(moduleId)! + 1);
    }
    return false;
  }

  if (!placeNext()) {
    throw new Error("Course obstacle inventory cannot be arranged without adjacent repeats");
  }
  return shuffled;
}

export function randomizedArc(seed: number): readonly ArcSlot[] {
  const random = createSeededRandom(deriveRaceSeed(seed, "course-obstacles"));
  const shuffled = shuffleObstaclesWithoutRepeats(random);

  let obstacleIndex = 0;
  return Object.freeze(
    ARC.map((slot): ArcSlot => {
      if (slot.kind !== "module" || slot.fixedModuleId === "chute") {
        return slot;
      }
      const moduleId = shuffled[obstacleIndex++];
      const module = COURSE_MODULES.find(({ id }) => id === moduleId);
      if (!module) {
        throw new Error(`Unknown Course obstacle ${moduleId}`);
      }
      return Object.freeze({ ...slot, role: module.role, fixedModuleId: moduleId });
    }),
  );
}

const ROLE_ORDER: readonly Role[] = ["accel", "scatter", "shuffle", "sort"];

export type RoleSelection = Readonly<Record<Role, string>>;

function moduleIds(role: Role): readonly string[] {
  const ids = courseModulesByRole(role).map(({ id }) => id);
  if (ids.length === 0) {
    throw new Error(`Role ${role} has no registered Module`);
  }
  return ids;
}

export function enumerateRoleSelections(): readonly RoleSelection[] {
  let selections: readonly Partial<Record<Role, string>>[] = [Object.freeze({})];

  for (const role of ROLE_ORDER) {
    selections = selections.flatMap((selection) =>
      moduleIds(role).map((moduleId) => Object.freeze({ ...selection, [role]: moduleId })),
    );
  }

  return Object.freeze(selections as readonly RoleSelection[]);
}

export function selectRoleModules(seed: number): RoleSelection {
  const random = createSeededRandom(deriveRaceSeed(seed, "course"));
  const selection = {} as Record<Role, string>;

  for (const role of ROLE_ORDER) {
    const ids = moduleIds(role);
    selection[role] = ids[Math.floor(random() * ids.length)];
  }

  return Object.freeze(selection);
}
