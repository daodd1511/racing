import {
  CROSSING_TIE_EPSILON_SECONDS,
  evaluateCohortValidity,
  percentile,
  type CohortValidity,
  type ModuleRunObservation,
} from "./metrics";

export interface RoleMetricRun {
  readonly seed: number;
  readonly marbleIndex: number;
  readonly entryTimeSeconds: number;
  readonly exitTimeSeconds: number;
  readonly entryLateral: number;
  readonly exitLateral: number;
  readonly exitSpeed: number;
}

export interface AccelEvidence {
  readonly role: "accel";
  readonly meanExitSpeed: number;
  readonly controlMeanExitSpeed: number;
  readonly exitSpeedLiftRatio: number | null;
  readonly lateralSpanChange: number;
  readonly temporalGapChange: number;
  readonly absoluteEntryExitTauB: number | null;
}

export interface WideEntryScatterEvidence {
  readonly role: "scatter";
  readonly mode: "wide-entry";
  readonly absoluteLateralTauB: number | null;
  readonly controlAbsoluteLateralTauB: number | null;
  readonly exitOccupancy: number;
  readonly controlExitOccupancy: number;
}

export interface ConstrainedEntryScatterEvidence {
  readonly role: "scatter";
  readonly mode: "constrained-entry";
  readonly entrySpan: number;
  readonly meanExitSpan: number;
  readonly controlMeanExitSpan: number;
  readonly exitLaneEntropy: number;
  readonly controlExitLaneEntropy: number;
}

export interface ShuffleEvidence {
  readonly role: "shuffle";
  readonly meanAbsoluteTauB: number | null;
  readonly averagePairwiseOutcomeEntropy: number;
}

export interface SortEvidence {
  readonly role: "sort";
  readonly meanTemporalSeparation: number;
  readonly controlMeanTemporalSeparation: number;
  readonly temporalSeparationRatio: number | null;
}

export type RoleEvidence =
  | AccelEvidence
  | WideEntryScatterEvidence
  | ConstrainedEntryScatterEvidence
  | ShuffleEvidence
  | SortEvidence;

export interface DwellEvidence {
  readonly validity: CohortValidity;
  readonly dwellSecondsP95: number | null;
  readonly maximumDwellSeconds: number | null;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function span(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);
}

function ratio(value: number, control: number): number | null {
  return control === 0 ? null : value / control;
}

/** Tie-aware Kendall tau-b. A null result means one side has no rank
 * variation, so correlation evidence is unavailable rather than zero. */
export function kendallTauB(left: readonly number[], right: readonly number[]): number | null {
  if (left.length !== right.length) throw new Error("Kendall tau-b inputs must have equal length");
  let concordant = 0;
  let discordant = 0;
  let tiesLeft = 0;
  let tiesRight = 0;

  for (let first = 0; first < left.length; first += 1) {
    for (let second = first + 1; second < left.length; second += 1) {
      const leftDelta = left[first] - left[second];
      const rightDelta = right[first] - right[second];
      const leftTied = Math.abs(leftDelta) <= CROSSING_TIE_EPSILON_SECONDS;
      const rightTied = Math.abs(rightDelta) <= CROSSING_TIE_EPSILON_SECONDS;
      if (leftTied && rightTied) continue;
      if (leftTied) tiesLeft += 1;
      else if (rightTied) tiesRight += 1;
      else if (Math.sign(leftDelta) === Math.sign(rightDelta)) concordant += 1;
      else discordant += 1;
    }
  }

  const denominator = Math.sqrt(
    (concordant + discordant + tiesLeft) * (concordant + discordant + tiesRight),
  );
  return denominator === 0 ? null : (concordant - discordant) / denominator;
}

function groupBySeed(
  runs: readonly RoleMetricRun[],
): ReadonlyMap<number, readonly RoleMetricRun[]> {
  const groups = new Map<number, RoleMetricRun[]>();
  for (const run of runs) {
    const group = groups.get(run.seed) ?? [];
    group.push(run);
    groups.set(run.seed, group);
  }
  return groups;
}

function temporalSeparation(runs: readonly RoleMetricRun[]): number {
  const times = runs.map(({ exitTimeSeconds }) => exitTimeSeconds).sort((a, b) => a - b);
  if (times.length < 2) return 0;
  return mean(times.slice(1).map((time, index) => time - times[index]));
}

function meanTemporalSeparation(runs: readonly RoleMetricRun[]): number {
  return mean([...groupBySeed(runs).values()].map(temporalSeparation));
}

function outcome(left: number, right: number): -1 | 0 | 1 {
  return Math.abs(left - right) <= CROSSING_TIE_EPSILON_SECONDS ? 0 : left < right ? -1 : 1;
}

function shannonEntropy(outcomes: readonly number[]): number {
  if (outcomes.length === 0) return 0;
  const counts = new Map<number, number>();
  outcomes.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.values()].reduce((entropy, count) => {
    const probability = count / outcomes.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

export function averagePairwiseOutcomeEntropy(runs: readonly RoleMetricRun[]): number {
  const groups = groupBySeed(runs);
  const marbleIndices = [...new Set(runs.map(({ marbleIndex }) => marbleIndex))].sort(
    (left, right) => left - right,
  );
  const pairEntropies: number[] = [];

  for (let left = 0; left < marbleIndices.length; left += 1) {
    for (let right = left + 1; right < marbleIndices.length; right += 1) {
      const outcomes: (-1 | 0 | 1)[] = [];
      for (const group of groups.values()) {
        const leftRun = group.find(({ marbleIndex }) => marbleIndex === marbleIndices[left]);
        const rightRun = group.find(({ marbleIndex }) => marbleIndex === marbleIndices[right]);
        if (leftRun && rightRun) {
          outcomes.push(outcome(leftRun.exitTimeSeconds, rightRun.exitTimeSeconds));
        }
      }
      if (outcomes.length > 0) pairEntropies.push(shannonEntropy(outcomes));
    }
  }

  return mean(pairEntropies);
}

function laneIndex(value: number, laneBoundaries: readonly number[]): number {
  return laneBoundaries.findIndex((boundary) => value < boundary) < 0
    ? laneBoundaries.length
    : laneBoundaries.findIndex((boundary) => value < boundary);
}

function laneOccupancy(values: readonly number[], laneBoundaries: readonly number[]): number {
  const laneCount = laneBoundaries.length + 1;
  return new Set(values.map((value) => laneIndex(value, laneBoundaries))).size / laneCount;
}

function laneEntropy(values: readonly number[], laneBoundaries: readonly number[]): number {
  return shannonEntropy(values.map((value) => laneIndex(value, laneBoundaries)));
}

export function accelEvidence(
  moduleRuns: readonly RoleMetricRun[],
  controlRuns: readonly RoleMetricRun[],
): AccelEvidence {
  const meanExitSpeed = mean(moduleRuns.map(({ exitSpeed }) => exitSpeed));
  const controlMeanExitSpeed = mean(controlRuns.map(({ exitSpeed }) => exitSpeed));
  const tau = kendallTauB(
    moduleRuns.map(({ entryTimeSeconds }) => entryTimeSeconds),
    moduleRuns.map(({ exitTimeSeconds }) => exitTimeSeconds),
  );
  return {
    role: "accel",
    meanExitSpeed,
    controlMeanExitSpeed,
    exitSpeedLiftRatio: ratio(meanExitSpeed, controlMeanExitSpeed),
    lateralSpanChange:
      span(moduleRuns.map(({ exitLateral }) => exitLateral)) -
      span(controlRuns.map(({ exitLateral }) => exitLateral)),
    temporalGapChange: meanTemporalSeparation(moduleRuns) - meanTemporalSeparation(controlRuns),
    absoluteEntryExitTauB: tau === null ? null : Math.abs(tau),
  };
}

export function wideEntryScatterEvidence(
  moduleRuns: readonly RoleMetricRun[],
  controlRuns: readonly RoleMetricRun[],
  laneBoundaries: readonly number[],
): WideEntryScatterEvidence {
  const moduleTau = kendallTauB(
    moduleRuns.map(({ entryLateral }) => entryLateral),
    moduleRuns.map(({ exitLateral }) => exitLateral),
  );
  const controlTau = kendallTauB(
    controlRuns.map(({ entryLateral }) => entryLateral),
    controlRuns.map(({ exitLateral }) => exitLateral),
  );
  return {
    role: "scatter",
    mode: "wide-entry",
    absoluteLateralTauB: moduleTau === null ? null : Math.abs(moduleTau),
    controlAbsoluteLateralTauB: controlTau === null ? null : Math.abs(controlTau),
    exitOccupancy: laneOccupancy(
      moduleRuns.map(({ exitLateral }) => exitLateral),
      laneBoundaries,
    ),
    controlExitOccupancy: laneOccupancy(
      controlRuns.map(({ exitLateral }) => exitLateral),
      laneBoundaries,
    ),
  };
}

export function constrainedEntryScatterEvidence(
  moduleRuns: readonly RoleMetricRun[],
  controlRuns: readonly RoleMetricRun[],
  laneBoundaries: readonly number[],
): ConstrainedEntryScatterEvidence {
  return {
    role: "scatter",
    mode: "constrained-entry",
    entrySpan: span(moduleRuns.map(({ entryLateral }) => entryLateral)),
    meanExitSpan: mean(
      [...groupBySeed(moduleRuns).values()].map((runs) =>
        span(runs.map(({ exitLateral }) => exitLateral)),
      ),
    ),
    controlMeanExitSpan: mean(
      [...groupBySeed(controlRuns).values()].map((runs) =>
        span(runs.map(({ exitLateral }) => exitLateral)),
      ),
    ),
    exitLaneEntropy: laneEntropy(
      moduleRuns.map(({ exitLateral }) => exitLateral),
      laneBoundaries,
    ),
    controlExitLaneEntropy: laneEntropy(
      controlRuns.map(({ exitLateral }) => exitLateral),
      laneBoundaries,
    ),
  };
}

export function shuffleEvidence(runs: readonly RoleMetricRun[]): ShuffleEvidence {
  const taus = [...groupBySeed(runs).values()].flatMap((group) => {
    const tau = kendallTauB(
      group.map(({ entryTimeSeconds }) => entryTimeSeconds),
      group.map(({ exitTimeSeconds }) => exitTimeSeconds),
    );
    return tau === null ? [] : [Math.abs(tau)];
  });
  return {
    role: "shuffle",
    meanAbsoluteTauB: taus.length === 0 ? null : mean(taus),
    averagePairwiseOutcomeEntropy: averagePairwiseOutcomeEntropy(runs),
  };
}

export function sortEvidence(
  moduleRuns: readonly RoleMetricRun[],
  controlRuns: readonly RoleMetricRun[],
): SortEvidence {
  const meanSeparation = meanTemporalSeparation(moduleRuns);
  const controlMeanSeparation = meanTemporalSeparation(controlRuns);
  return {
    role: "sort",
    meanTemporalSeparation: meanSeparation,
    controlMeanTemporalSeparation: controlMeanSeparation,
    temporalSeparationRatio: ratio(meanSeparation, controlMeanSeparation),
  };
}

export function dwellEvidence(
  observations: readonly ModuleRunObservation[],
  minimumCompletedRuns: number,
): DwellEvidence {
  const dwellSeconds = observations
    .flatMap(({ dwellSeconds }) => (dwellSeconds === null ? [] : [dwellSeconds]))
    .sort((left, right) => left - right);
  return {
    validity: evaluateCohortValidity(observations, minimumCompletedRuns),
    dwellSecondsP95: percentile(dwellSeconds, 0.95),
    maximumDwellSeconds: dwellSeconds.at(-1) ?? null,
  };
}
