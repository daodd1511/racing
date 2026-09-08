import { describe, expect, it } from "vitest";
import { loadSavedModuleSettings, moduleSettingsSchema, parseModuleSettings } from "./settings";
import { validateCourseSettings } from "./validateCourseSettings";
import { authoredModule } from "./authoredRegistry";
import { ALL_MODULES } from "../modules/registry";

describe("shared Module settings", () => {
  it("loads independent saved settings and retains registry Course defaults", () => {
    const settings = loadSavedModuleSettings();
    expect(parseModuleSettings(settings)).toEqual(settings);
    expect(loadSavedModuleSettings()).not.toBe(settings);
    expect(
      moduleSettingsSchema("staircase").fields.find((field) => field.key === "stepCount"),
    ).toMatchObject({ min: 3, max: 10, default: 10 });
    for (const module of ALL_MODULES) expect(authoredModule(module.id).course).toBe(module.course);
  });
  it.each([
    { chute: { length: Number.NaN } },
    { chute: { length: Infinity } },
    { chute: { grade: 0 } },
    { chute: { unknown: 1 } },
    { staircase: { stepCount: 5.5 } },
    { "pin-field": { courseGrade: 0.5 } },
  ])("rejects malformed controls %j", (patch) => {
    const settings = loadSavedModuleSettings();
    const input = Object.fromEntries(
      Object.entries(settings).map(([id, values]) => [
        id,
        { ...values, ...patch[id as keyof typeof patch] },
      ]),
    );
    expect(() => parseModuleSettings(input)).toThrow();
  });
  it("rejects missing Modules, unknown Modules and accessors without evaluating them", () => {
    const settings = loadSavedModuleSettings();
    expect(() => parseModuleSettings({ ...settings, unknown: {} })).toThrow("Unknown Module");
    expect(() => parseModuleSettings({ chute: settings.chute })).toThrow("plain object");
    let invoked = false;
    const input = {
      ...settings,
      get chute() {
        invoked = true;
        return settings.chute;
      },
    };
    expect(() => parseModuleSettings(input)).toThrow("unsupported property");
    expect(invoked).toBe(false);
  });
  it("preflights through assembly and leaves saved settings intact after invalid gaps", () => {
    const settings = loadSavedModuleSettings();
    expect(() => validateCourseSettings(settings)).not.toThrow();
    const invalid = { ...settings, "pin-field": { ...settings["pin-field"], postSpacing: 0.2 } };
    expect(() => validateCourseSettings(invalid)).toThrow("rail gaps");
    expect(loadSavedModuleSettings()).toEqual(settings);
  });
});
