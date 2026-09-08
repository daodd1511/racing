import saved from "../config/module-settings.json";
import { ALL_MODULES } from "../modules/registry";
import type { NumberParamField, ParamSchema } from "../modules/types";
import type { ModuleId, ModuleSettings, ModuleTuning } from "./types";

export const MODULE_IDS = ["chute", "pin-field", "staircase", "whoops"] as const;

export function moduleSettingsSchema(id: ModuleId): ParamSchema {
  const module = ALL_MODULES.find((entry) => entry.id === id)!;
  const defaults = module.course!.defaults;
  const fields: NumberParamField[] = module.meta.params.fields.map((field) => {
    if (field.kind !== "number" || typeof defaults[field.key] !== "number")
      throw new Error(`${id}.${field.key}: unsupported control`);
    const baseline = defaults[field.key] as number;
    return {
      ...field,
      min: Math.min(field.min, baseline),
      max: Math.max(field.max, baseline),
      default: baseline,
    };
  });
  if (id === "pin-field") {
    const grade = defaults.courseGrade as number;
    fields.push({
      kind: "number",
      key: "courseGrade",
      label: "Grade",
      min: grade,
      max: grade,
      step: 0.01,
      default: grade,
    });
  }
  return { fields };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error(`${path}: expected a plain object`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !("value" in descriptor) || !descriptor.enumerable)
      throw new Error(`${path}: unsupported property`);
  }
  return value as Record<string, unknown>;
}

export function parseModuleTuning(id: ModuleId, value: unknown): ModuleTuning {
  const input = record(value, id);
  const fields = moduleSettingsSchema(id).fields;
  for (const key of Object.keys(input)) {
    if (!fields.some((field) => field.key === key))
      throw new Error(`${id}.${key}: unknown control`);
  }
  const values: Record<string, number> = {};
  for (const field of fields) {
    const number = input[field.key];
    if (
      field.kind !== "number" ||
      typeof number !== "number" ||
      !Number.isFinite(number) ||
      number < field.min ||
      number > field.max ||
      ((field.key === "rowCount" || field.key === "stepCount") && !Number.isSafeInteger(number))
    )
      throw new Error(
        `${id}.${field.key}: expected ${field.kind === "number" ? `${field.min}–${field.max}` : "number"}${field.key.endsWith("Count") ? " (integer)" : ""}`,
      );
    values[field.key] = number;
  }
  // Every required key and its numeric domain were checked against the Module schema.
  return { moduleId: id, values } as ModuleTuning;
}

export function parseModuleSettings(value: unknown): ModuleSettings {
  const input = record(value, "Module settings");
  for (const key of Object.keys(input)) {
    if (!MODULE_IDS.some((id) => id === key)) throw new Error(`Unknown Module ${key}`);
  }
  const entries = MODULE_IDS.map((id) => [id, parseModuleTuning(id, input[id]).values]);
  return Object.fromEntries(entries) as unknown as ModuleSettings;
}

export function loadSavedModuleSettings(): ModuleSettings {
  return parseModuleSettings(saved);
}
