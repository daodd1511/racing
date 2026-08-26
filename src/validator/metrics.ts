import type { Anchor } from "../modules/types";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";

// Per-run primitives the Validator aggregates into distributions (percentiles
// across a seed sweep are `validateModule.ts`'s job, not this file's -- these
// functions describe one marble's one run).

export interface FrameSample {
  readonly tSeconds: number;
  readonly position: Vector3;
}

export interface MarbleRun {
  readonly frames: readonly FrameSample[];
}

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(v: Vector3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function interpolateVector(start: Vector3, end: Vector3, fraction: number): Vector3 {
  return [
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction,
    start[2] + (end[2] - start[2]) * fraction,
  ];
}

export const CROSSING_HYSTERESIS_DISTANCE = SCALE.marbleRadius * 2;
export const CROSSING_TIE_EPSILON_SECONDS = 1e-9;

export interface CrossingObservation {
  readonly timeSeconds: number;
  readonly position: Vector3;
  readonly speed: number;
  /** Index of the first frame after the interpolated plane crossing. */
  readonly segmentEndFrameIndex: number;
}

export interface ModuleRunObservation {
  readonly entry: CrossingObservation | null;
  readonly exit: CrossingObservation | null;
  readonly completed: boolean;
  readonly dwellSeconds: number | null;
}

export interface CohortValidity {
  readonly totalRuns: number;
  readonly completedRuns: number;
  readonly minimumCompletedRuns: number;
  readonly behaviorAvailable: boolean;
}

export function planeDistance(plane: Anchor, position: Vector3): number {
  return dot(subtract(position, plane.position), plane.tangent);
}

/** Finds the first forward plane crossing that remains provisional until the
 * marble travels one diameter beyond the plane. A return across the plane
 * before confirmation discards that attempt. */
export function observeConfirmedCrossing(
  frames: readonly FrameSample[],
  plane: Anchor,
  startFrameIndex = 0,
): CrossingObservation | null {
  let provisional: CrossingObservation | null = null;
  const firstSegmentEnd = Math.max(1, startFrameIndex + 1);

  for (let index = firstSegmentEnd; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    const previousDistance = planeDistance(plane, previous.position);
    const currentDistance = planeDistance(plane, current.position);

    if (provisional !== null) {
      if (currentDistance < 0) {
        provisional = null;
      } else if (currentDistance >= CROSSING_HYSTERESIS_DISTANCE) {
        return provisional;
      }
      continue;
    }

    if (previousDistance < 0 && currentDistance >= 0) {
      const distanceDelta = currentDistance - previousDistance;
      const fraction = distanceDelta === 0 ? 0 : -previousDistance / distanceDelta;
      const duration = current.tSeconds - previous.tSeconds;
      provisional = {
        timeSeconds: previous.tSeconds + duration * fraction,
        position: interpolateVector(previous.position, current.position, fraction),
        speed: duration > 0 ? length(subtract(current.position, previous.position)) / duration : 0,
        segmentEndFrameIndex: index,
      };
      if (currentDistance >= CROSSING_HYSTERESIS_DISTANCE) {
        return provisional;
      }
    }
  }

  return null;
}

export function observeModuleRun(
  run: MarbleRun,
  entry: Anchor,
  exit: Anchor,
): ModuleRunObservation {
  const entryObservation = observeConfirmedCrossing(run.frames, entry);
  const exitObservation =
    entryObservation === null
      ? null
      : observeConfirmedCrossing(run.frames, exit, entryObservation.segmentEndFrameIndex);
  const completed = entryObservation !== null && exitObservation !== null;

  return {
    entry: entryObservation,
    exit: exitObservation,
    completed,
    dwellSeconds: completed ? exitObservation.timeSeconds - entryObservation.timeSeconds : null,
  };
}

/** Competition ranks: tied crossings share a rank and the following rank
 * skips the tied positions (`1, 1, 3`). Incomplete runs remain unranked. */
export function tieAwareCrossingRanks(
  observations: readonly (CrossingObservation | null)[],
): readonly (number | null)[] {
  const ranked = observations
    .flatMap((observation, index) => (observation === null ? [] : [{ index, observation }]))
    .sort(
      (left, right) =>
        left.observation.timeSeconds - right.observation.timeSeconds || left.index - right.index,
    );
  const result: (number | null)[] = observations.map(() => null);
  let groupStart = 0;

  while (groupStart < ranked.length) {
    let groupEnd = groupStart + 1;
    while (
      groupEnd < ranked.length &&
      Math.abs(
        ranked[groupEnd].observation.timeSeconds - ranked[groupStart].observation.timeSeconds,
      ) <= CROSSING_TIE_EPSILON_SECONDS
    ) {
      groupEnd += 1;
    }
    const rank = groupStart + 1;
    for (let index = groupStart; index < groupEnd; index += 1) {
      result[ranked[index].index] = rank;
    }
    groupStart = groupEnd;
  }

  return result;
}

export function evaluateCohortValidity(
  observations: readonly ModuleRunObservation[],
  minimumCompletedRuns: number,
): CohortValidity {
  if (!Number.isSafeInteger(minimumCompletedRuns) || minimumCompletedRuns < 1) {
    throw new RangeError("minimumCompletedRuns must be a positive integer");
  }
  const completedRuns = observations.filter(({ completed }) => completed).length;
  return {
    totalRuns: observations.length,
    completedRuns,
    minimumCompletedRuns,
    behaviorAvailable: completedRuns >= minimumCompletedRuns,
  };
}

/** Signed distance of `position` past the exit plane -- the plane through
 * `exit.position` perpendicular to `exit.tangent`. Positive means crossed.
 * Exported so the Showcase's live Feeder can detect the same crossing
 * incrementally, frame by frame, rather than re-deriving this math for a
 * streaming context -- the batch (`measureDwell`) and live paths must agree
 * on what "exited" means. */
export function exitPlaneDistance(exit: Anchor, position: Vector3): number {
  return planeDistance(exit, position);
}

export interface DwellResult {
  readonly exited: boolean;
  /** Seconds from the run's first frame to the frame that crossed the exit
   * plane. `null` if it never crossed. */
  readonly dwellSeconds: number | null;
  /** Speed at the crossing frame. `null` if it never crossed. */
  readonly exitSpeed: number | null;
}

/** Finds when (if ever) a marble's run first crosses the Module's exit
 * plane, and its speed at that moment. A straight plane-crossing test is
 * enough for one Module in isolation; the multi-segment progress tracking
 * the old build needed doesn't apply until Spec 3 chains Modules together. */
export function measureDwell(run: MarbleRun, exit: Anchor): DwellResult {
  const { frames } = run;
  if (frames.length === 0) {
    return { exited: false, dwellSeconds: null, exitSpeed: null };
  }

  for (let i = 1; i < frames.length; i += 1) {
    const distance = exitPlaneDistance(exit, frames[i].position);
    if (distance >= 0) {
      const dt = frames[i].tSeconds - frames[i - 1].tSeconds;
      const displacement = subtract(frames[i].position, frames[i - 1].position);
      const speed = dt > 0 ? length(displacement) / dt : 0;
      return {
        exited: true,
        dwellSeconds: frames[i].tSeconds - frames[0].tSeconds,
        exitSpeed: speed,
      };
    }
  }

  return { exited: false, dwellSeconds: null, exitSpeed: null };
}

/** Floor for `ValidationReport.minDisplacementPerSecond` (after
 * `validateModule`'s warm-up skip) -- the guardrail enforcing PLAN.md's
 * "Dwell must be paid for with visible motion". A marble sitting nearly
 * still for a whole second is exactly the failure being fixed.
 *
 * Set from real measurements, not a guess: the chute's own params schema
 * spans grade 0.05-0.6 and length 0.2-1.5; sweeping that range through
 * `validateModule` (6 seeds, 3 marbles, after the warm-up fix below) reads
 * minDisplacementPerSecond from ~0.043 m/s (shallowest legal grade) to
 * ~0.42 m/s (steepest). This threshold sits comfortably under that
 * observed floor, so no legally-configured chute fails it, while staying
 * well above the ~0 a genuinely stalled or barely-creeping marble reads.
 *
 * This is a physics-grounded number, not an eye-confirmed one: it was set
 * without ever watching the chute run (this session's browser automation
 * cannot render a frame here -- see Phase 1 and Phase 3's completion
 * reports). Revisit it once someone has actually watched continuous feed
 * and can say whether "just above stalled" also means "still reads as
 * fast" -- those are different claims, and only one of them is checked here.
 */
export const MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND = 0.02;

/** Per-frame on-screen displacement, in meters per simulated second -- the
 * raw series `validateModule` aggregates (after skipping its warm-up
 * window) into `minDisplacementPerSecond`, checked against the floor above. */
export function displacementPerSecond(run: MarbleRun): number[] {
  const { frames } = run;
  const result: number[] = [];

  for (let i = 1; i < frames.length; i += 1) {
    const dt = frames[i].tSeconds - frames[i - 1].tSeconds;
    if (dt <= 0) {
      continue;
    }
    result.push(length(subtract(frames[i].position, frames[i - 1].position)) / dt);
  }

  return result;
}

/** How much marble order changed between entering and leaving: 0 is no
 * reordering, 1 is a full reversal. See CONTEXT.md -> "Shuffle". Counts
 * inversions between spawn order (array index) and exit order (ranked by
 * dwell time), normalized by the maximum possible inversions for that many
 * marbles -- a marble that never exits doesn't participate in the ranking,
 * since it never took a position in the exit order. */
export function finishOrderInversionCoefficient(
  dwellSecondsByMarbleIndex: readonly (number | null)[],
): number {
  const exited = dwellSecondsByMarbleIndex
    .map((dwellSeconds, index) => ({ index, dwellSeconds }))
    .filter(
      (entry): entry is { index: number; dwellSeconds: number } => entry.dwellSeconds !== null,
    )
    .sort((a, b) => a.dwellSeconds - b.dwellSeconds);

  const n = exited.length;
  if (n < 2) {
    return 0;
  }

  let inversions = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (exited[i].index > exited[j].index) {
        inversions += 1;
      }
    }
  }

  const maxInversions = (n * (n - 1)) / 2;
  return maxInversions === 0 ? 0 : inversions / maxInversions;
}

/** Compatibility alias for pre-calibration Module guardrails. New Module
 * evidence uses Role metrics; only Course outcomes use inversion. */
export const shuffleCoefficient = finishOrderInversionCoefficient;

export interface StallCount {
  readonly stalled: number;
  readonly total: number;
}

export function countStalls(exitedFlags: readonly boolean[]): StallCount {
  return { stalled: exitedFlags.filter((exited) => !exited).length, total: exitedFlags.length };
}

/** `sortedValues` must already be sorted ascending -- this doesn't sort, so
 * a live/growing series can call it without re-sorting a stable prefix
 * every frame if the caller keeps it sorted incrementally; `validateModule`
 * simply sorts once before calling. */
export function percentile(sortedValues: readonly number[], fraction: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  const index = Math.min(sortedValues.length - 1, Math.floor(fraction * sortedValues.length));
  return sortedValues[index];
}
