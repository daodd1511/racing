import RAPIER from "@dimforge/rapier3d-compat";

import type { ModuleDefinition, Spec } from "../modules/types";
import { createSeededRandom } from "../race/random";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";
import { buildWorld } from "./buildWorld";
import {
  displacementPerSecond,
  measureDwell,
  shuffleCoefficient,
  type FrameSample,
  type MarbleRun,
} from "./metrics";

const FIXED_TIME_STEP_SECONDS = 1 / 60;

export interface ValidateModuleOptions {
  readonly seedCount: number;
  readonly marbleCount: number;
  readonly maxSimulationSeconds: number;
}

export interface ValidationReport {
  readonly seeds: number;
  readonly totalMarbles: number;
  readonly stalledMarbles: number;
  readonly dwellSecondsP50: number | null;
  readonly dwellSecondsP99: number | null;
  readonly exitSpeeds: readonly number[];
  /** Worst-case displacement-per-second observed across every marble, every
   * frame, every seed -- the floor PLAN.md's "Dwell must be paid for with
   * visible motion" guardrail checks against. `0` if no marble ever exited. */
  readonly minDisplacementPerSecond: number;
  readonly shuffleCoefficients: readonly number[];
}

function percentile(sortedValues: readonly number[], fraction: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  const index = Math.min(sortedValues.length - 1, Math.floor(fraction * sortedValues.length));
  return sortedValues[index];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: Vector3): Vector3 {
  const magnitude = Math.hypot(v[0], v[1], v[2]);
  return magnitude === 0 ? v : [v[0] / magnitude, v[1] / magnitude, v[2] / magnitude];
}

function addScaled(base: Vector3, direction: Vector3, amount: number): Vector3 {
  return [
    base[0] + direction[0] * amount,
    base[1] + direction[1] * amount,
    base[2] + direction[2] * amount,
  ];
}

// A marble spawned exactly AT the entry anchor's position lands precisely on
// the geometric edge of the entry collider -- close enough to floating-point
// residue that it can miss the surface on the very first physics step and
// fall straight through with no contact at all (found empirically: it isn't
// tunneling through a thin collider, it's simply not overlapping one to
// begin with). Spawning a few marble radii inward along `tangent`, lifted a
// couple of radii along `up`, lands solidly on the surface instead.
const ENTRY_MARGIN_RADII = 3;
const ENTRY_LIFT_RADII = 2;

function spawnMarbles(
  world: RAPIER.World,
  spec: Spec,
  marbleCount: number,
  seed: number,
): RAPIER.RigidBody[] {
  const random = createSeededRandom(seed);
  const { entry } = spec.footprint;
  const bodies: RAPIER.RigidBody[] = [];

  const basePosition = addScaled(
    addScaled(entry.position, entry.tangent, SCALE.marbleRadius * ENTRY_MARGIN_RADII),
    entry.up,
    SCALE.marbleRadius * ENTRY_LIFT_RADII,
  );
  // Spread marbles laterally across the entry so a marbleCount > 1 sweep
  // exercises real marble-to-marble contact, not marbleCount copies of the
  // same single-marble run. `lateral` is derived from the entry frame
  // itself (cross of tangent and up), not assumed to be +X, so it holds for
  // any Module's entry orientation, not only ones shaped like the chute.
  const lateral = normalize(cross(entry.tangent, entry.up));
  const spreadWidth = Math.max(0, SCALE.channelWidth - SCALE.marbleRadius * 4);

  for (let index = 0; index < marbleCount; index += 1) {
    const lateralOffset = (random() - 0.5) * spreadWidth;
    const liftOffset = index * SCALE.marbleRadius * 2.5;
    const spawnPosition = addScaled(
      addScaled(basePosition, lateral, lateralOffset),
      entry.up,
      liftOffset,
    );
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnPosition[0], spawnPosition[1], spawnPosition[2])
        .setLinearDamping(SCALE.linearDamping)
        .setAngularDamping(SCALE.angularDamping)
        .setCcdEnabled(true),
    );
    world.createCollider(
      RAPIER.ColliderDesc.ball(SCALE.marbleRadius)
        .setRestitution(SCALE.defaultRestitution)
        .setFriction(SCALE.defaultFriction)
        .setDensity(2.4),
      body,
    );
    bodies.push(body);
  }

  return bodies;
}

/** Steps a fixed 1/60 across a seed sweep of one Module's built `Spec` and
 * reports Dwell Time, exit speed, Shuffle, stalls, and displacement -- the
 * guardrails PLAN.md's "Acceptance" section defines as necessary but never
 * sufficient on their own; see that section before treating a green report
 * as a finished Module. */
export async function validateModule<P>(
  module: ModuleDefinition<P>,
  params: P,
  options: ValidateModuleOptions,
): Promise<ValidationReport> {
  await RAPIER.init();

  const spec = module.buildSpec(params);
  const maxSteps = Math.ceil(options.maxSimulationSeconds / FIXED_TIME_STEP_SECONDS);

  const allDwellSeconds: number[] = [];
  const allExitSpeeds: number[] = [];
  const allShuffleCoefficients: number[] = [];
  let stalledMarbles = 0;
  let minDisplacementPerSecond = Number.POSITIVE_INFINITY;
  let anyExited = false;

  for (let seed = 0; seed < options.seedCount; seed += 1) {
    const world = buildWorld([spec]);
    const bodies = spawnMarbles(world, spec, options.marbleCount, seed);
    const runs: MarbleRun[] = bodies.map(() => ({ frames: [] }));

    for (let step = 0; step < maxSteps; step += 1) {
      world.step();
      const tSeconds = (step + 1) * FIXED_TIME_STEP_SECONDS;
      bodies.forEach((body, index) => {
        const translation = body.translation();
        (runs[index].frames as FrameSample[]).push({
          tSeconds,
          position: [translation.x, translation.y, translation.z],
        });
      });
    }

    const dwellResults = runs.map((run) => measureDwell(run, spec.footprint.exit));

    for (const result of dwellResults) {
      if (result.exited && result.dwellSeconds !== null) {
        allDwellSeconds.push(result.dwellSeconds);
        anyExited = true;
        if (result.exitSpeed !== null) {
          allExitSpeeds.push(result.exitSpeed);
        }
      } else {
        stalledMarbles += 1;
      }
    }

    allShuffleCoefficients.push(
      shuffleCoefficient(dwellResults.map((result) => result.dwellSeconds)),
    );

    for (const run of runs) {
      for (const displacement of displacementPerSecond(run)) {
        minDisplacementPerSecond = Math.min(minDisplacementPerSecond, displacement);
      }
    }

    world.free();
  }

  allDwellSeconds.sort((a, b) => a - b);

  return {
    seeds: options.seedCount,
    totalMarbles: options.seedCount * options.marbleCount,
    stalledMarbles,
    dwellSecondsP50: percentile(allDwellSeconds, 0.5),
    dwellSecondsP99: percentile(allDwellSeconds, 0.99),
    exitSpeeds: allExitSpeeds,
    minDisplacementPerSecond: anyExited ? minDisplacementPerSecond : 0,
    shuffleCoefficients: allShuffleCoefficients,
  };
}
