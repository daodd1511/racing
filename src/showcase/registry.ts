import { chute } from "../modules/chute";
import type { KinematicTransform, ModuleDefinition, ModuleMeta, Role, Spec } from "../modules/types";
import type { ParamValues } from "./ParamPanel";

// The Showcase's module list. `ModuleDefinition<P>` is generic per Module
// (chute's own params aren't the bowl's), but the Showcase's sidebar and
// ParamPanel operate generically over any Module -- so entries here are
// type-erased to `ParamValues` at this one boundary, via `toShowcaseEntry`,
// rather than the Showcase carrying an `any` through its own state. Adding
// a Module (Phase 4's vortex bowl, and later the rest of the catalogue) is
// one line here.

export interface ShowcaseEntry {
  readonly id: string;
  readonly role: Role;
  readonly meta: ModuleMeta;
  buildSpec(params: ParamValues): Spec;
  step(spec: Spec, tSeconds: number): readonly KinematicTransform[];
}

// `P` is intentionally unconstrained here (not `P extends ParamValues`): a
// concrete params interface like `ChuteParams` has no index signature, so
// it never satisfies a `Record<string, ...>`-shaped constraint even though
// every one of its fields does -- that's what a constrained signature ran
// into first. Leaving `P` free lets it infer from whatever Module is
// passed, and the one `as P` below is the deliberate, localized cast a
// type-erasure boundary like this needs: `ParamSchema`'s fields are what
// generate the values passed in at runtime, so the cast asserts a contract
// the schema itself establishes, not a guess.
function toShowcaseEntry<P>(module: ModuleDefinition<P>): ShowcaseEntry {
  return {
    id: module.id,
    role: module.role,
    meta: module.meta,
    buildSpec: (params: ParamValues) => module.buildSpec(params as P),
    step: module.step,
  };
}

export const MODULES: readonly ShowcaseEntry[] = [toShowcaseEntry(chute)];
