import { ALL_MODULES, type RegisteredModule } from "../modules/registry";

// The Showcase's module list -- re-exported straight from
// `src/modules/registry.ts`'s `ALL_MODULES` (Phase 1 of Spec 2), so adding a
// Module to the catalogue is one line in that file and zero lines here.
// `ShowcaseEntry` stays as this file's own name for the type (unchanged
// shape from `RegisteredModule`) so `Showcase.tsx`'s imports do not change.

export type ShowcaseEntry = RegisteredModule;

export const MODULES: readonly ShowcaseEntry[] = ALL_MODULES;
