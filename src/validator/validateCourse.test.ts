import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";

import { enumerateRoleSelections } from "../course/arc";
import { runCourseRaceValidation } from "./validateCourse";

beforeAll(async () => {
  await RAPIER.init();
});

describe("runCourseRaceValidation", () => {
  it("finishes one packed fixed-seed Course without a watchdog", () => {
    const result = runCourseRaceValidation(enumerateRoleSelections()[0], 0, 0);
    expect({ outcome: result.outcome, finishTimes: result.finishTimes }).toMatchObject({
      outcome: { kind: "completed" },
    });
    expect(result.finishTimes.every((time) => time !== null && Number.isFinite(time))).toBe(true);
    expect(result.exitSpeeds.every((speed) => speed !== null && Number.isFinite(speed))).toBe(true);
    expect(Number.isFinite(result.shuffleCoefficient)).toBe(true);
  });
});
