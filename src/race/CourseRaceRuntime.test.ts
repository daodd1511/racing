import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";

import { assembleCourse } from "../course/assembleCourse";
import type { Course } from "../course/types";
import type { Spec } from "../modules/types";
import { CourseRaceRuntime, type CourseRaceStep } from "./CourseRaceRuntime";

function courseWithoutTrack(course: Course): Course {
  const withoutColliders = (spec: Spec): Spec => ({ ...spec, colliders: [] });
  return {
    ...course,
    start: {
      ...course.start,
      colliders: course.start.colliders.filter(({ kinematic }) => kinematic === true),
    },
    finish: {
      ...course.finish,
      colliders: course.finish.colliders.filter(({ sensor }) => sensor === true),
    },
    modules: course.modules.map((module) => ({
      ...module,
      spec: withoutColliders(module.spec),
    })),
    connectors: course.connectors.map((connector) => ({
      ...connector,
      spec: withoutColliders(connector.spec),
    })),
  };
}

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

  it("respawns an off-track marble at its last safe transform with its fall stopped", () => {
    const runtime = new CourseRaceRuntime(courseWithoutTrack(assembleCourse(11)), {
      seed: 11,
      roster: ["Avery"],
      selectionMode: "last",
    });
    let recoveredStep: CourseRaceStep | undefined;

    for (let stepIndex = 1; stepIndex <= 120; stepIndex += 1) {
      const step = runtime.step(stepIndex / 60);
      if (step.recoveredMarbleIndices.includes(0)) {
        recoveredStep = step;
        break;
      }
    }

    if (recoveredStep === undefined) throw new Error("Expected the marble to be recovered");
    expect(recoveredStep.recoveredMarbleIndices).toEqual([0]);
    const recoveredPosition = recoveredStep.snapshot.marbleTransforms[0].position;
    const next = runtime.step(recoveredStep.snapshot.elapsedSeconds + 1 / 60);
    expect(next.snapshot.marbleTransforms[0].position[1]).toBeGreaterThan(
      recoveredPosition[1] - 0.01,
    );

    runtime.dispose();
  });
});

it("retains unread step snapshots after later steps and world disposal", () => {
  const runtime = new CourseRaceRuntime(assembleCourse(7), {
    seed: 7,
    roster: ["A", "B"],
    selectionMode: "last",
  });
  const retained = runtime.step(1 / 60);
  const expected = runtime.currentSnapshot;
  runtime.step(2 / 60);
  runtime.dispose();
  expect(retained.snapshot).toEqual(expected);
  expect(retained.snapshot).toBe(retained.snapshot);
});

it("uses only the active Module recovery area and resumes recovery after leaving it", () => {
  const base = courseWithoutTrack(assembleCourse(11));
  const request = { seed: 11, roster: ["A"], selectionMode: "last" as const };
  const probe = new CourseRaceRuntime(base, request);
  const initial = probe.currentSnapshot.marbleTransforms[0].position;
  probe.dispose();
  const withArea = (slotIndex: number, halfHeight: number): Course => ({
    ...base,
    modules: [
      {
        ...base.modules[0],
        slotIndex,
        spec: {
          ...base.modules[0].spec,
          recoveryBoxes: [
            {
              position: initial,
              rotation: [0, 0, 0, 1],
              halfExtents: [2, halfHeight, 2],
            },
          ],
        },
      },
    ],
  });
  const active = new CourseRaceRuntime(withArea(base.checkpoints[0].slotIndex, 2), request);
  const unrelated = new CourseRaceRuntime(withArea(base.checkpoints[3].slotIndex, 2), request);
  const limited = new CourseRaceRuntime(withArea(base.checkpoints[0].slotIndex, 0.5), request);
  let activeRecoveries = 0;
  let unrelatedRecoveries = 0;
  let limitedRecovery: CourseRaceStep | undefined;
  try {
    for (let index = 1; index <= 30; index++) {
      activeRecoveries += active.step(index / 60).recoveredMarbleIndices.length;
      unrelatedRecoveries += unrelated.step(index / 60).recoveredMarbleIndices.length;
      const step = limited.step(index / 60);
      if (step.recoveredMarbleIndices.length && !limitedRecovery) limitedRecovery = step;
    }
    expect(activeRecoveries).toBe(0);
    expect(active.currentSnapshot.marbleTransforms[0].position[1]).toBeLessThan(initial[1] - 0.5);
    expect(unrelatedRecoveries).toBeGreaterThan(0);
    expect(limitedRecovery).toBeDefined();
    expect(limitedRecovery!.snapshot.marbleTransforms[0].position[1]).toBeGreaterThan(
      initial[1] - 0.1,
    );
  } finally {
    active.dispose();
    unrelated.dispose();
    limited.dispose();
  }
});
