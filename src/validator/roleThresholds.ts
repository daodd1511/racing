export interface RoleThresholdTable {
  readonly version: string;
  readonly accel: {
    readonly minimumExitSpeedLiftRatio: number;
    readonly maximumAbsoluteLateralSpanChangeMeters: number;
    readonly maximumTemporalGapWideningSeconds: number;
    readonly minimumAbsoluteEntryExitTauB: number;
  };
  readonly wideEntryScatter: {
    readonly maximumAbsoluteLateralTauB: number;
    readonly minimumControlTauBReduction: number;
    readonly minimumExitOccupancy: number;
    readonly minimumControlOccupancyRatio: number;
  };
  readonly constrainedEntryScatter: {
    readonly minimumExitSpanRatio: number;
    readonly minimumExitLaneEntropyLiftBits: number;
    readonly minimumMeanExitSpanMeters: number;
  };
  readonly shuffle: {
    readonly maximumMeanAbsoluteTauB: number;
    readonly minimumAveragePairwiseOutcomeEntropyBits: number;
  };
  readonly sort: {
    readonly minimumTemporalSeparationRatio: number;
  };
  readonly dwellSafety: {
    readonly maximumP95ControlRatio: number;
  };
  readonly completionSafety: {
    readonly maximumStalls: number;
    readonly maximumTimeouts: number;
  };
  readonly cohortValidity: {
    readonly burst15MinimumCompletedRuns: number;
    readonly continuousMinimumCompletedRuns: number;
    readonly singleMinimumCompletedRuns: number;
  };
  readonly breakTableIdentity: {
    readonly maximumSingleToBurstExitSpanRatio: number;
  };
}

/** Approved from specs/module-candidate-expansion/reports/calibration-v1.md. */
export const ROLE_THRESHOLDS = Object.freeze({
  version: "v1",
  accel: Object.freeze({
    minimumExitSpeedLiftRatio: 1.05,
    maximumAbsoluteLateralSpanChangeMeters: 0.05,
    maximumTemporalGapWideningSeconds: 0.05,
    minimumAbsoluteEntryExitTauB: 0.8,
  }),
  wideEntryScatter: Object.freeze({
    maximumAbsoluteLateralTauB: 0.25,
    minimumControlTauBReduction: 0.5,
    minimumExitOccupancy: 0.67,
    minimumControlOccupancyRatio: 0.9,
  }),
  constrainedEntryScatter: Object.freeze({
    minimumExitSpanRatio: 1.5,
    minimumExitLaneEntropyLiftBits: 0.25,
    minimumMeanExitSpanMeters: 0.064,
  }),
  shuffle: Object.freeze({
    maximumMeanAbsoluteTauB: 0.3,
    minimumAveragePairwiseOutcomeEntropyBits: 0.8,
  }),
  sort: Object.freeze({ minimumTemporalSeparationRatio: 1.25 }),
  dwellSafety: Object.freeze({ maximumP95ControlRatio: 4 }),
  completionSafety: Object.freeze({ maximumStalls: 0, maximumTimeouts: 0 }),
  cohortValidity: Object.freeze({
    burst15MinimumCompletedRuns: 240,
    continuousMinimumCompletedRuns: 240,
    singleMinimumCompletedRuns: 48,
  }),
  breakTableIdentity: Object.freeze({ maximumSingleToBurstExitSpanRatio: 0.25 }),
} as const satisfies RoleThresholdTable);
