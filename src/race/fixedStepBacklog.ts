import { KINEMATIC_FIXED_STEP_SECONDS } from "../modules/kinematics";

export interface FixedStepBacklog {
  readonly pendingSeconds: number;
  readonly completedStepCount: number;
}

export interface FixedStepAdvance {
  readonly backlog: FixedStepBacklog;
  readonly stepCount: number;
  readonly stepTimes: readonly number[];
}

export const INITIAL_FIXED_STEP_BACKLOG: FixedStepBacklog = Object.freeze({
  pendingSeconds: 0,
  completedStepCount: 0,
});

export function advanceFixedStepBacklog(
  state: FixedStepBacklog,
  wallDeltaSeconds: number,
  maxSteps: number,
): FixedStepAdvance {
  if (
    !Number.isFinite(state.pendingSeconds) ||
    state.pendingSeconds < 0 ||
    !Number.isSafeInteger(state.completedStepCount) ||
    state.completedStepCount < 0
  ) {
    throw new Error("Fixed-step backlog state is invalid");
  }
  if (!Number.isFinite(wallDeltaSeconds) || wallDeltaSeconds < 0) {
    throw new RangeError("Wall delta must be finite and non-negative");
  }
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 0) {
    throw new RangeError("Maximum step count must be a non-negative safe integer");
  }

  const availableSeconds = state.pendingSeconds + wallDeltaSeconds;
  const availableSteps = Math.floor(
    (availableSeconds + Number.EPSILON * 16) / KINEMATIC_FIXED_STEP_SECONDS,
  );
  const stepCount = Math.min(availableSteps, maxSteps);
  const completedStepCount = state.completedStepCount + stepCount;
  const backlog = Object.freeze({
    pendingSeconds: Math.max(0, availableSeconds - stepCount * KINEMATIC_FIXED_STEP_SECONDS),
    completedStepCount,
  });
  const stepTimes = Object.freeze(
    Array.from(
      { length: stepCount },
      (_, index) => (state.completedStepCount + index + 1) * KINEMATIC_FIXED_STEP_SECONDS,
    ),
  );
  return Object.freeze({ backlog, stepCount, stepTimes });
}
