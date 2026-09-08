import { describe, expect, it, vi } from "vitest";

import * as occupancy from "./occupancy";
import { defaultParamValues } from "../modules/params";
import { ALL_MODULES } from "../modules/registry";
import { createSeededRandom, deriveRaceSeed } from "../race/random";
import { enumerateRoleSelections } from "./arc";
import { assembleCourse, assembleCourseFromRoleSelection } from "./assembleCourse";
import { courseParamValues, COURSE_MODULES } from "./courseModules";
import { BOARD } from "./board";
import { stepCourse } from "./stepCourse";

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  expect(Object.isFrozen(value)).toBe(true);
  Object.values(value).forEach(expectDeepFrozen);
}

describe("assembleCourse", () => {
  it("is deterministic and isolated from Start-substream draws", () => {
    const seed = 0x1234abcd;
    const expected = assembleCourse(seed);
    const startRandom = createSeededRandom(deriveRaceSeed(seed, "start"));
    for (let draw = 0; draw < 100; draw += 1) {
      startRandom();
    }

    expect(assembleCourse(seed)).toEqual(expected);
    expectDeepFrozen(expected);
  });

  it.each(enumerateRoleSelections().map((selection, index) => [index, selection] as const))(
    "assembles structurally valid Role selection %i",
    (_index, selection) => {
      const course = assembleCourseFromRoleSelection(17, selection);

      expect(course.board).toBe(BOARD);
      expect(course.modules).toHaveLength(22);
      expect(course.connectors).toHaveLength(23);
      expect(course.checkpoints).toHaveLength(24);
      expect(course.route[0]).toEqual(course.entry.position);
      expect(course.route.at(-1)).toEqual(course.exit.position);
      expect(
        course.modules.filter(({ role }) => role === "accel").map(({ moduleId }) => moduleId),
      ).toEqual(Array(12).fill(selection.accel));
      expect(course.checkpoints.map(({ routeDistance }) => routeDistance)).toEqual(
        course.checkpoints
          .map(({ routeDistance }) => routeDistance)
          .sort((left, right) => left - right),
      );
      for (const spec of [
        course.start,
        ...course.modules.map(({ spec }) => spec),
        ...course.connectors.map(({ spec }) => spec),
        course.finish,
      ]) {
        expect(spec.footprint.cells.length).toBeGreaterThan(0);
      }
    },
  );

  it("does not mutate source Module Specs", () => {
    const before = ALL_MODULES.map((module) =>
      module.buildSpec(defaultParamValues(module.meta.params)),
    );
    assembleCourse(4);
    const after = ALL_MODULES.map((module) =>
      module.buildSpec(defaultParamValues(module.meta.params)),
    );

    expect(after).toEqual(before);
  });

  it("rejects non-finite Course step times", () => {
    const course = assembleCourse(5);
    expect(() => stepCourse(course, Number.NaN)).toThrow(/finite/);
  });
});

it("keeps tuned Course defaults and inventory in the catalog", () => {
  expect(COURSE_MODULES.map(({ id }) => id)).toEqual(["chute", "pin-field", "staircase", "whoops"]);
  const defaults = (id: string) =>
    courseParamValues(ALL_MODULES.find((module) => module.id === id)!);
  expect(defaults("chute").grade).toBe(0.12);
  expect(defaults("pin-field").courseGrade).toBe(0.12);
  expect(defaults("staircase")).toMatchObject({ stepCount: 10, tread: 0.2, riseHeight: 0.048 });
  expect(defaults("whoops")).toMatchObject({
    amplitude: 0.016,
    grade: 0.12,
    length: 2.4,
    wavelength: 0.4,
  });
  const ids = assembleCourse(7).modules.map(({ moduleId }) => moduleId);
  expect(ids.filter((id) => id === "chute")).toHaveLength(12);
  expect(ids.filter((id) => id === "pin-field")).toHaveLength(4);
  expect(ids.filter((id) => id === "whoops")).toHaveLength(3);
  expect(ids.filter((id) => id === "staircase")).toHaveLength(3);
});

it("reassembles every authored instance, Board, Cells and connectors from shared settings", async () => {
  const { loadSavedModuleSettings } = await import("../assets/settings");
  const settings = loadSavedModuleSettings();
  const baseline = assembleCourse(7, { settings });
  const edited = {
    ...settings,
    chute: { ...settings.chute, length: 1.1 },
    staircase: { ...settings.staircase, stepCount: 6 },
  };
  const course = assembleCourse(7, { settings: edited });
  expect(course.modules.map((module) => module.moduleId)).toEqual(
    baseline.modules.map((module) => module.moduleId),
  );
  expect(
    course.modules
      .filter((module) => module.moduleId === "chute")
      .every((module) => module.params.length === 1.1),
  ).toBe(true);
  expect(course.board).not.toEqual(baseline.board);
  expect(course.route).not.toEqual(baseline.route);
  expect(course.connectors).not.toEqual(baseline.connectors);
  expect(course.modules[0].spec.footprint.cells).not.toEqual(
    baseline.modules[0].spec.footprint.cells,
  );
  expect(course.route[0]).toEqual(course.entry.position);
  expect(course.route.at(-1)).toEqual(course.exit.position);
  expect(assembleCourse(7, { settings })).toEqual(baseline);
  expect(() => assembleCourse(7, { source: "legacy", settings })).toThrow("require authored");
  expectDeepFrozen(course);
});

it("rejects overlapping nonadjacent Slots on a configured Board", async () => {
  const { loadSavedModuleSettings } = await import("../assets/settings");
  const original = occupancy.rasterizeFootprintCells;
  const rasterize = vi
    .spyOn(occupancy, "rasterizeFootprintCells")
    .mockImplementation((footprint, board) => [
      ...original(footprint, board),
      { column: 0, row: 0 },
    ]);
  try {
    expect(() => assembleCourse(7, { settings: loadSavedModuleSettings() })).toThrow(
      "overlap outside",
    );
  } finally {
    rasterize.mockRestore();
  }
});
