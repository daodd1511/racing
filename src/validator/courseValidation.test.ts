import { describe, expect, it } from "vitest";

import { percentile } from "./metrics";
import { validateCourseVariants } from "./validateCourse";

describe("validateCourseVariants", () => {
  it("finishes every packed active Course race with finite metrics", async () => {
    const report = await validateCourseVariants();
    const durations = [...report.durations].sort((left, right) => left - right);

    // Record the observed distribution without imposing a preferred range.
    expect(percentile(durations, 0.5)).not.toBeNull();
    expect(percentile(durations, 0.99)).not.toBeNull();
    expect(report).toMatchObject({
      shapeCount: 1,
      raceCount: 5,
      totalMarbles: 75,
      finishedMarbles: 75,
      stalledMarbles: 0,
      watchdogs: 0,
    });
    expect(report.races.every(({ outcome }) => outcome.kind === "completed")).toBe(true);
    expect(report.durations.every(Number.isFinite)).toBe(true);
    expect(report.dwellSeconds).toHaveLength(75);
    expect(report.dwellSeconds.every(Number.isFinite)).toBe(true);
    expect(report.exitSpeeds).toHaveLength(75);
    expect(report.exitSpeeds.every(Number.isFinite)).toBe(true);
    expect(report.finishOrderInversionCoefficients.every(Number.isFinite)).toBe(true);
  }, 120_000);
});
