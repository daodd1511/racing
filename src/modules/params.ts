import type { ParamSchema } from "./types";

// Moved out of `src/showcase/ParamPanel.tsx`: `src/modules/purity.test.ts`
// and `src/modules/registry.ts` both need `defaultParamValues` to build
// every registered Module's params from its own schema, and neither may
// import a React component to get it. `ParamPanel.tsx` re-exports both names
// so the Showcase's own imports do not change.

export type ParamValues = Readonly<Record<string, number | boolean>>;

/** The schema's own defaults, as a `ParamValues` -- used to (re)initialize
 * the Showcase's param state whenever the selected Module changes, and to
 * build every registered Module's default params for `purity.test.ts`. */
export function defaultParamValues(schema: ParamSchema): ParamValues {
  const values: Record<string, number | boolean> = {};
  for (const field of schema.fields) {
    values[field.key] = field.default;
  }
  return values;
}
