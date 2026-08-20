import { chute } from "./chute";
import { frictionLanes } from "./frictionLanes";
import { funnelChoke } from "./funnelChoke";
import type { ParamValues } from "./params";
import { pinField } from "./pinField";
import { rumbleStrip } from "./rumbleStrip";
import { staircase } from "./staircase";
import { steepZigzag } from "./steepZigzag";
import type { KinematicTransform, ModuleDefinition, ModuleMeta, Role, Spec } from "./types";
import { vortexBowl } from "./vortexBowl";
import { whoops } from "./whoops";

// The Module registry CONTEXT.md -> "Assembler" already names: every Module
// in the catalogue, listed once, here -- so adding a Module (Phase 2 onward)
// is one line in this file and zero lines in the Showcase. Moved from
// `src/showcase/registry.ts` (Phase 3 of Spec 1's original home for it)
// because `src/modules/purity.test.ts` needs `ALL_MODULES` and must not
// import through the Showcase to get it.

export interface RegisteredModule {
  readonly id: string;
  readonly role: Role;
  readonly meta: ModuleMeta;
  buildSpec(params: ParamValues): Spec;
  step(spec: Spec, tSeconds: number): readonly KinematicTransform[];
}

// `P` is intentionally unconstrained here (not `P extends ParamValues`): a
// concrete params interface like `ChuteParams` has no index signature, so
// it never satisfies a `Record`-shaped constraint even though every one of
// its fields does -- that's what a constrained signature ran into first.
// Leaving `P` free lets it infer from whatever Module is passed, and the one
// `as P` below is the deliberate, localized cast a type-erasure boundary
// like this needs: `ParamSchema`'s fields are what generate the values
// passed in at runtime, so the cast asserts a contract the schema itself
// establishes, not a guess.
function toRegisteredModule<P>(module: ModuleDefinition<P>): RegisteredModule {
  return {
    id: module.id,
    role: module.role,
    meta: module.meta,
    buildSpec: (params: ParamValues) => module.buildSpec(params as P),
    step: module.step,
  };
}

export const ALL_MODULES: readonly RegisteredModule[] = [
  toRegisteredModule(chute),
  toRegisteredModule(vortexBowl),
  toRegisteredModule(steepZigzag),
  toRegisteredModule(pinField),
  toRegisteredModule(rumbleStrip),
  toRegisteredModule(staircase),
  toRegisteredModule(frictionLanes),
  toRegisteredModule(whoops),
  toRegisteredModule(funnelChoke),
];

export function modulesByRole(role: Role): readonly RegisteredModule[] {
  return ALL_MODULES.filter((module) => module.role === role);
}
