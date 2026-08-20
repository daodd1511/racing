import type { ParamSchema } from "../modules/types";

// Generated from a Module's `meta.params` schema -- never a hand-written
// panel per Module, per PLAN.md -> "Showcase". Adding a Module with new
// params needs no change here; it only needs an accurate `ParamSchema`.

export type ParamValues = Readonly<Record<string, number | boolean>>;

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
            <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
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

/** The schema's own defaults, as a `ParamValues` -- used to (re)initialize
 * the Showcase's param state whenever the selected Module changes. */
export function defaultParamValues(schema: ParamSchema): ParamValues {
  const values: Record<string, number | boolean> = {};
  for (const field of schema.fields) {
    values[field.key] = field.default;
  }
  return values;
}
