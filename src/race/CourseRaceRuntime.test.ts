import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";

import { assembleCourse } from "../course/assembleCourse";
import { CourseRaceRuntime } from "./CourseRaceRuntime";

beforeAll(async () => {
  await RAPIER.init();
});

describe("CourseRaceRuntime", () => {
  it("advances a materialized Course and emits immutable live snapshots", () => {
    const runtime = new CourseRaceRuntime(assembleCourse(7), {
      seed: 7,
      roster: ["Avery", "Blake", "Casey"],
      selectionMode: "last",
    });

    const initial = runtime.currentSnapshot;
    const step = runtime.step(1 / 60);

    expect(initial.marbleTransforms).toHaveLength(3);
    expect(step.snapshot.elapsedSeconds).toBeCloseTo(1 / 60, 10);
    expect(step.snapshot.marbleTransforms).toHaveLength(3);
    expect(Object.isFrozen(step.snapshot)).toBe(true);
    expect(Object.isFrozen(step.snapshot.marbleTransforms)).toBe(true);
    expect(step.outcome).toBeNull();

    runtime.dispose();
  });
});
