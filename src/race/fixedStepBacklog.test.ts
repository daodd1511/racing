import { describe, expect, it } from "vitest";

import { KINEMATIC_FIXED_STEP_SECONDS } from "../modules/kinematics";
import { INITIAL_FIXED_STEP_BACKLOG, advanceFixedStepBacklog } from "./fixedStepBacklog";

describe("advanceFixedStepBacklog", () => {
  it("bounds work while retaining every unprocessed fixed step", () => {
    const first = advanceFixedStepBacklog(INITIAL_FIXED_STEP_BACKLOG, 0.1, 2);
    expect(first.stepCount).toBe(2);
    expect(first.stepTimes).toEqual([
      KINEMATIC_FIXED_STEP_SECONDS,
      KINEMATIC_FIXED_STEP_SECONDS * 2,
    ]);
    expect(first.backlog.pendingSeconds).toBeCloseTo(0.1 - KINEMATIC_FIXED_STEP_SECONDS * 2, 12);

    const second = advanceFixedStepBacklog(first.backlog, 0, 10);
    expect(second.stepCount).toBe(4);
    expect(second.backlog.pendingSeconds).toBeCloseTo(0, 12);
    expect(second.backlog.completedStepCount).toBe(6);
  });

  it("is independent of render-frame partitioning", () => {
    const whole = advanceFixedStepBacklog(INITIAL_FIXED_STEP_BACKLOG, 0.05, 10);
    const partA = advanceFixedStepBacklog(INITIAL_FIXED_STEP_BACKLOG, 0.02, 10);
    const partB = advanceFixedStepBacklog(partA.backlog, 0.03, 10);

    expect(partA.stepCount + partB.stepCount).toBe(whole.stepCount);
    expect(partB.backlog.completedStepCount).toBe(whole.backlog.completedStepCount);
    expect(partB.backlog.pendingSeconds).toBeCloseTo(whole.backlog.pendingSeconds, 12);
  });

  it("rejects invalid deltas and work bounds", () => {
    expect(() => advanceFixedStepBacklog(INITIAL_FIXED_STEP_BACKLOG, -1, 1)).toThrow(/delta/);
    expect(() => advanceFixedStepBacklog(INITIAL_FIXED_STEP_BACKLOG, 0, -1)).toThrow(/Maximum/);
  });
});
