import type { Anchor } from "../modules/types";
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

/** Signed distance of `position` past the exit plane -- the plane through
 * `exit.position` perpendicular to `exit.tangent`. Positive means crossed. */
function exitPlaneDistance(exit: Anchor, position: Vector3): number {
  return dot(subtract(position, exit.position), exit.tangent);
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

/** Per-frame on-screen displacement, in meters per simulated second -- the
 * metric enforcing PLAN.md's "Dwell must be paid for with visible motion".
 * A marble sitting nearly still for a whole second is exactly the failure
 * being fixed; the Validator's guardrail is a floor on this value. */
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
export function shuffleCoefficient(dwellSecondsByMarbleIndex: readonly (number | null)[]): number {
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

export interface StallCount {
  readonly stalled: number;
  readonly total: number;
}

export function countStalls(exitedFlags: readonly boolean[]): StallCount {
  return { stalled: exitedFlags.filter((exited) => !exited).length, total: exitedFlags.length };
}
