import { describe, expect, it } from "vitest";

import { defaultParamValues } from "../modules/params";
import { ALL_MODULES } from "../modules/registry";
import { createSeededRandom, deriveRaceSeed } from "../race/random";
import { enumerateRoleSelections } from "./arc";
import { assembleCourse, assembleCourseFromRoleSelection } from "./assembleCourse";
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
      expect(course.modules).toHaveLength(7);
      expect(course.connectors).toHaveLength(8);
      expect(course.checkpoints).toHaveLength(9);
      expect(course.route[0]).toEqual(course.entry.position);
      expect(course.route.at(-1)).toEqual(course.exit.position);
      expect(
        course.modules.filter(({ role }) => role === "accel").map(({ moduleId }) => moduleId),
      ).toEqual([selection.accel, selection.accel, selection.accel]);
      expect(course.checkpoints.map(({ routeDistance }) => routeDistance)).toEqual(
        [...course.checkpoints.map(({ routeDistance }) => routeDistance)].sort(
          (left, right) => left - right,
        ),
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
