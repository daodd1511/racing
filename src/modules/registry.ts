import { chute } from "./chute";
import { defaultParamValues, type ParamValues } from "./params";
import { pinField } from "./pinField";
import { staircase } from "./staircase";
import type { KinematicTransform, ModuleDefinition, ModuleMeta, Role, Spec } from "./types";
import { whoops } from "./whoops";
import { SCALE } from "../race/scale";

export const COURSE_GRADE = 0.12;

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
  /** Presence opts this Module into Course assembly; values include schema defaults. */
  readonly course?: { readonly defaults: ParamValues };
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
function toRegisteredModule<P>(
  module: ModuleDefinition<P>,
  courseOverrides?: ParamValues,
): RegisteredModule {
  return {
    id: module.id,
    role: module.role,
    meta: module.meta,
    course:
      courseOverrides === undefined
        ? undefined
        : Object.freeze({
            defaults: Object.freeze({
              ...defaultParamValues(module.meta.params),
              ...courseOverrides,
            }),
          }),
    buildSpec: (params: ParamValues) => module.buildSpec(params as P),
    step: module.step,
  };
}

export const ALL_MODULES: readonly RegisteredModule[] = [
  toRegisteredModule(chute, { grade: COURSE_GRADE }),
  toRegisteredModule(pinField, { courseGrade: COURSE_GRADE }),
  toRegisteredModule(staircase, { stepCount: 10, tread: 0.2, riseHeight: SCALE.marbleRadius * 3 }),
  toRegisteredModule(whoops, {
    amplitude: SCALE.marbleRadius,
    grade: COURSE_GRADE,
    length: 2.4,
    wavelength: 0.4,
  }),
];

export function modulesByRole(role: Role): readonly RegisteredModule[] {
  return ALL_MODULES.filter((module) => module.role === role);
}
