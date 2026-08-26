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
    expect(Number.isFinite(result.finishOrderInversionCoefficient)).toBe(true);
  }, 15_000);

  it("includes the active Module combination in the physics gate", () => {
    const selections = enumeratePhysicsValidatedSelections();
    expect(selections).toHaveLength(1);
  });

  it.each([
    [0, 4],
    [0, 3],
    [0, 1],
  ])(
    "contains packed active-Course case shape %i, Start seed %i",
    (shapeIndex, startSeed) => {
      const { selection } = enumeratePhysicsValidatedSelections().find(
        (candidate) => candidate.shapeIndex === shapeIndex,
      )!;
      const result = runCourseRaceValidation(selection, shapeIndex, startSeed);
      expect(result.outcome).toMatchObject({
        kind: "completed",
      });
    },
    15_000,
  );
});
