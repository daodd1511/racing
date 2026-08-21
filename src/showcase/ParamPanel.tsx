import type { ParamSchema } from "../modules/types";
import { defaultParamValues } from "../modules/params";
import type { ParamValues } from "../modules/params";

// Generated from a Module's `meta.params` schema -- never a hand-written
// panel per Module, per PLAN.md -> "Showcase". Adding a Module with new
// params needs no change here; it only needs an accurate `ParamSchema`.

// `ParamValues` and `defaultParamValues` live in `../modules/params` now --
// `src/modules/purity.test.ts` and `src/modules/registry.ts` need them and
// must not import a React component to get them. Re-exported here so this
// file's own imports elsewhere in the Showcase do not change.
export type { ParamValues };
export { defaultParamValues };

function numberValueOrDefault(values: ParamValues, key: string, fallback: number): number {
  const value = values[key];
  return typeof value === "number" ? value : fallback;
}

function booleanValueOrDefault(values: ParamValues, key: string, fallback: boolean): boolean {
  const value = values[key];
  return typeof value === "boolean" ? value : fallback;
}

export interface ParamPanelProps {
  readonly schema: ParamSchema;
  readonly values: ParamValues;
  readonly onChange: (key: string, value: number | boolean) => void;
}

export function ParamPanel({ schema, values, onChange }: ParamPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {schema.fields.map((field) => {
        if (field.kind === "number") {
          const value = numberValueOrDefault(values, field.key, field.default);
          return (
            <label
              key={field.key}
              style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
            >
              <span>
                {field.label} ({value})
              </span>
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={value}
                onChange={(event) => onChange(field.key, event.currentTarget.valueAsNumber)}
              />
            </label>
          );
        }

        const value = booleanValueOrDefault(values, field.key, field.default);
        return (
          <label key={field.key} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={value}
              onChange={(event) => onChange(field.key, event.currentTarget.checked)}
            />
            <span>{field.label}</span>
          </label>
        );
      })}
    </div>
  );
}
