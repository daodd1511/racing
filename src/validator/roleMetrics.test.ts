import { describe, expect, it } from "vitest";

import type { ModuleRunObservation } from "./metrics";
import {
  constrainedEntryScatterEvidence,
  dwellEvidence,
  kendallTauB,
  shuffleEvidence,
  sortEvidence,
  wideEntryScatterEvidence,
  type RoleMetricRun,
} from "./roleMetrics";

function run(
  seed: number,
  marbleIndex: number,
  entryTimeSeconds: number,
  exitTimeSeconds: number,
  entryLateral = marbleIndex,
  exitLateral = marbleIndex,
): RoleMetricRun {
  return {
    seed,
    marbleIndex,
    entryTimeSeconds,
    exitTimeSeconds,
    entryLateral,
    exitLateral,
    exitSpeed: 2,
  };
}

function seedRuns(seed: number, exitOrder: readonly number[]): RoleMetricRun[] {
  return exitOrder.map((marbleIndex, exitRank) => run(seed, marbleIndex, marbleIndex, exitRank));
}

describe("kendallTauB", () => {
  it("reports preservation, reversal, and tied crossings", () => {
    expect(kendallTauB([0, 1, 2], [0, 1, 2])).toBe(1);
    expect(kendallTauB([0, 1, 2], [2, 1, 0])).toBe(-1);
    expect(kendallTauB([0, 0, 1], [0, 1, 2])).toBeCloseTo(2 / Math.sqrt(6));
  });
});

describe("Shuffle evidence", () => {
  it("rejects deterministic preservation and deterministic reversal by entropy", () => {
    expect(shuffleEvidence([...seedRuns(1, [0, 1, 2]), ...seedRuns(2, [0, 1, 2])])).toEqual({
      role: "shuffle",
      meanAbsoluteTauB: 1,
      averagePairwiseOutcomeEntropy: 0,
    });
    expect(shuffleEvidence([...seedRuns(1, [2, 1, 0]), ...seedRuns(2, [2, 1, 0])])).toEqual({
      role: "shuffle",
      meanAbsoluteTauB: 1,
      averagePairwiseOutcomeEntropy: 0,
    });
  });

  it("reports decorrelation and outcome entropy across varied seeded orders", () => {
    const evidence = shuffleEvidence([
      ...seedRuns(1, [0, 1, 2]),
      ...seedRuns(2, [2, 0, 1]),
      ...seedRuns(3, [1, 2, 0]),
      ...seedRuns(4, [2, 1, 0]),
    ]);

    expect(evidence.meanAbsoluteTauB).toBeLessThan(1);
    expect(evidence.averagePairwiseOutcomeEntropy).toBeGreaterThan(0.8);
  });
});

describe("Scatter evidence", () => {
  it("distinguishes wide-entry decorrelation from preserved lateral order", () => {
    const moduleRuns = [0, 1, 2, 3, 4].map((index) =>
      run(1, index, index, index, index - 2, [0, 2, -2, 1, -1][index]),
    );
    const controlRuns = [0, 1, 2, 3, 4].map((index) =>
      run(1, index, index, index, index - 2, index - 2),
    );
    const evidence = wideEntryScatterEvidence(moduleRuns, controlRuns, [-1, 1]);

    expect(evidence.absoluteLateralTauB).toBeLessThan(evidence.controlAbsoluteLateralTauB ?? 0);
    expect(evidence.exitOccupancy).toBe(1);
  });

  it("measures constrained-input diversity from exits rather than collapsed entries", () => {
    const moduleRuns = [
      run(1, 0, 0, 0, 0, -2),
      run(1, 1, 1, 1, 0, 2),
      run(2, 0, 0, 0, 0, 2),
      run(2, 1, 1, 1, 0, -2),
    ];
    const controlRuns = moduleRuns.map((value) => ({ ...value, exitLateral: 0 }));
    const evidence = constrainedEntryScatterEvidence(moduleRuns, controlRuns, [-1, 1]);

    expect(evidence.entrySpan).toBe(0);
    expect(evidence.meanExitSpan).toBe(4);
    expect(evidence.controlMeanExitSpan).toBe(0);
    expect(evidence.exitLaneEntropy).toBeGreaterThan(evidence.controlExitLaneEntropy);
  });
});

describe("Sort and Dwell evidence", () => {
  it("compares temporal separation with the paired control", () => {
    const moduleRuns = [run(1, 0, 0, 0), run(1, 1, 1, 2), run(1, 2, 2, 4)];
    const controlRuns = [run(1, 0, 0, 0), run(1, 1, 1, 1), run(1, 2, 2, 2)];

    expect(sortEvidence(moduleRuns, controlRuns)).toMatchObject({
      meanTemporalSeparation: 2,
      controlMeanTemporalSeparation: 1,
      temporalSeparationRatio: 2,
    });
  });

  it("keeps incomplete cohorts visible while withholding behavior availability", () => {
    const observation = (dwellSeconds: number | null): ModuleRunObservation => ({
      entry: null,
      exit: null,
      completed: dwellSeconds !== null,
      dwellSeconds,
    });
    const evidence = dwellEvidence(
      [observation(1), observation(2), observation(3), observation(null)],
      4,
    );

    expect(evidence.validity).toMatchObject({ completedRuns: 3, behaviorAvailable: false });
    expect(evidence.dwellSecondsP95).toBe(3);
    expect(evidence.maximumDwellSeconds).toBe(3);
  });
});
