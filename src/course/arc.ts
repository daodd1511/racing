import { modulesByRole } from "../modules/registry";
import type { Role } from "../modules/types";
import { createSeededRandom, deriveRaceSeed } from "../race/random";
import type { ArcSlot } from "./types";

export const ARC = Object.freeze([
  { slotIndex: 0, kind: "start", column: 0, row: 0, direction: "right" },
  { slotIndex: 1, kind: "module", role: "accel", column: 1, row: 0, direction: "right" },
  { slotIndex: 2, kind: "module", role: "scatter", column: 2, row: 0, direction: "right" },
  { slotIndex: 3, kind: "module", role: "accel", column: 2, row: 1, direction: "left" },
  { slotIndex: 4, kind: "module", role: "shuffle", column: 1, row: 1, direction: "left" },
  { slotIndex: 5, kind: "module", role: "sort", column: 0, row: 1, direction: "left" },
  { slotIndex: 6, kind: "module", role: "accel", column: 0, row: 2, direction: "right" },
  { slotIndex: 7, kind: "module", role: "queue", column: 1, row: 2, direction: "right" },
  { slotIndex: 8, kind: "finish", column: 2, row: 2, direction: "right" },
] as const satisfies readonly ArcSlot[]);

const ROLE_ORDER: readonly Role[] = ["accel", "scatter", "shuffle", "sort", "queue"];

export type RoleSelection = Readonly<Record<Role, string>>;

function moduleIds(role: Role): readonly string[] {
  const ids = modulesByRole(role).map(({ id }) => id);
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
