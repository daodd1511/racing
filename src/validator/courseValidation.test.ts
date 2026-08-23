import { describe, expect, it } from "vitest";

import { percentile } from "./metrics";
import { validateCourseVariants } from "./validateCourse";

describe("validateCourseVariants", () => {
  it("finishes every packed non-vortex Course race with finite metrics", async () => {
    const report = await validateCourseVariants();
    const durations = [...report.durations].sort((left, right) => left - right);

    // Record the observed distribution without imposing a preferred range.
    expect(percentile(durations, 0.5)).not.toBeNull();
    expect(percentile(durations, 0.99)).not.toBeNull();
    expect(report).toMatchObject({
      shapeCount: 16,
      raceCount: 80,
      totalMarbles: 1_200,
      finishedMarbles: 1_200,
      stalledMarbles: 0,
      watchdogs: 0,
    });
    expect(report.races.every(({ outcome }) => outcome.kind === "completed")).toBe(true);
    expect(report.durations.every(Number.isFinite)).toBe(true);
    expect(report.dwellSeconds).toHaveLength(1_200);
    expect(report.dwellSeconds.every(Number.isFinite)).toBe(true);
    expect(report.exitSpeeds).toHaveLength(1_200);
    expect(report.exitSpeeds.every(Number.isFinite)).toBe(true);
    expect(report.shuffleCoefficients.every(Number.isFinite)).toBe(true);
  }, 120_000);
});
