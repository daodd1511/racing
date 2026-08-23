import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";

import { enumeratePhysicsValidatedSelections, runCourseRaceValidation } from "./validateCourse";

beforeAll(async () => {
  await RAPIER.init();
});

describe("runCourseRaceValidation", () => {
  it("finishes one packed fixed-seed Course without a watchdog", () => {
    const [{ selection, shapeIndex }] = enumeratePhysicsValidatedSelections();
    const result = runCourseRaceValidation(selection, shapeIndex, 0);
    expect({ outcome: result.outcome, finishTimes: result.finishTimes }).toMatchObject({
      outcome: { kind: "completed" },
    });
    expect(result.finishTimes.every((time) => time !== null && Number.isFinite(time))).toBe(true);
    expect(result.exitSpeeds.every((speed) => speed !== null && Number.isFinite(speed))).toBe(true);
    expect(Number.isFinite(result.shuffleCoefficient)).toBe(true);
  });

  it("excludes only vortex shapes from the successful physics gate", () => {
    const selections = enumeratePhysicsValidatedSelections();
    expect(selections).toHaveLength(16);
    expect(selections.every(({ selection }) => selection.shuffle !== "vortex-bowl")).toBe(true);
  });

  it.each([
    [14, 4],
    [21, 3],
    [28, 1],
  ])("contains known packed seam case shape %i, Start seed %i", (shapeIndex, startSeed) => {
    const { selection } = enumeratePhysicsValidatedSelections().find(
      (candidate) => candidate.shapeIndex === shapeIndex,
    )!;
    expect(runCourseRaceValidation(selection, shapeIndex, startSeed).outcome).toMatchObject({
      kind: "completed",
    });
  });

});
