import { describe, expect, it } from "vitest";

import { ROLE_THRESHOLDS } from "./roleThresholds";

describe("ROLE_THRESHOLDS", () => {
  it("freezes the approved v1 calibration contract", () => {
    expect(ROLE_THRESHOLDS).toEqual({
      version: "v1",
      accel: {
        minimumExitSpeedLiftRatio: 1.05,
        maximumAbsoluteLateralSpanChangeMeters: 0.05,
        maximumTemporalGapWideningSeconds: 0.05,
        minimumAbsoluteEntryExitTauB: 0.8,
      },
      wideEntryScatter: {
        maximumAbsoluteLateralTauB: 0.25,
        minimumControlTauBReduction: 0.5,
        minimumExitOccupancy: 0.67,
        minimumControlOccupancyRatio: 0.9,
      },
      constrainedEntryScatter: {
        minimumExitSpanRatio: 1.5,
        minimumExitLaneEntropyLiftBits: 0.25,
        minimumMeanExitSpanMeters: 0.064,
      },
      shuffle: {
        maximumMeanAbsoluteTauB: 0.3,
        minimumAveragePairwiseOutcomeEntropyBits: 0.8,
      },
      sort: { minimumTemporalSeparationRatio: 1.25 },
      dwellSafety: { maximumP95ControlRatio: 4 },
      completionSafety: { maximumStalls: 0, maximumTimeouts: 0 },
      cohortValidity: {
        burst15MinimumCompletedRuns: 240,
        continuousMinimumCompletedRuns: 240,
        singleMinimumCompletedRuns: 48,
      },
      breakTableIdentity: { maximumSingleToBurstExitSpanRatio: 0.25 },
    });

    expect(Object.isFrozen(ROLE_THRESHOLDS)).toBe(true);
    for (const value of Object.values(ROLE_THRESHOLDS)) {
      if (typeof value === "object") expect(Object.isFrozen(value)).toBe(true);
    }
  });
});
