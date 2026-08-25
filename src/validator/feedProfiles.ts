import { startGridPositions } from "../course/startFinish";
import { FEEDER_APRON_LENGTH } from "../modules/feederApron";
import { KINEMATIC_FIXED_STEP_SECONDS } from "../modules/kinematics";
import type { Anchor } from "../modules/types";
import { createSeededRandom } from "../race/random";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";

export type FeedProfile = "burst15" | "continuous" | "single";

export const CONTINUOUS_COHORT_SIZE = 30;
export const CONTINUOUS_RELEASE_INTERVAL_SECONDS = 0.4;
export const FEED_STALL_TIMEOUT_SECONDS = 15;

export interface FeedRelease {
  readonly marbleIndex: number;
  readonly position: Vector3;
  readonly initialVelocity: Vector3;
  readonly releaseStep: number;
  readonly heldByGate: boolean;
}

export interface FeedCohort {
  readonly profile: FeedProfile;
  readonly seed: number;
  readonly releases: readonly FeedRelease[];
  readonly stallTimeoutSeconds: number;
}

export interface FeedConfiguration {
  readonly moduleId: string;
  readonly params: Readonly<Record<string, number | boolean>>;
  readonly profile: FeedProfile;
  readonly seed: number;
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(vector: Vector3): Vector3 {
  const magnitude = Math.hypot(...vector);
  if (magnitude === 0) throw new Error("Feed entry frame has no lateral axis");
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
}

function addScaled(base: Vector3, direction: Vector3, amount: number): Vector3 {
  return [
    base[0] + direction[0] * amount,
    base[1] + direction[1] * amount,
    base[2] + direction[2] * amount,
  ];
}

function positionInEntryFrame(
  entry: Anchor,
  lateralOffset: number,
  tangentOffset: number,
): Vector3 {
  const lateral = normalize(cross(entry.up, entry.tangent));
  return addScaled(
    addScaled(addScaled(entry.position, lateral, lateralOffset), entry.tangent, tangentOffset),
    entry.up,
    SCALE.marbleRadius,
  );
}

function release(
  marbleIndex: number,
  position: Vector3,
  releaseStep: number,
  heldByGate: boolean,
): FeedRelease {
  return Object.freeze({
    marbleIndex,
    position: Object.freeze(position),
    initialVelocity: Object.freeze([0, 0, 0] as Vector3),
    releaseStep,
    heldByGate,
  });
}

function burstReleases(entry: Anchor, random: () => number): readonly FeedRelease[] {
  const grid = startGridPositions(15);
  const frontZ = Math.max(...grid.map((position) => position[2]));
  const placementJitter = SCALE.marbleRadius * 0.1;

  return Object.freeze(
    grid.map((position, marbleIndex) => {
      const lateralJitter = (random() - 0.5) * placementJitter;
      const tangentJitter = (random() - 0.5) * placementJitter;
      const tangentOffset = -(frontZ - position[2]) - SCALE.marbleRadius * 3 + tangentJitter;
      return release(
        marbleIndex,
        positionInEntryFrame(entry, position[0] + lateralJitter, tangentOffset),
        0,
        true,
      );
    }),
  );
}

function isolatedReleases(
  entry: Anchor,
  random: () => number,
  count: number,
  releaseIntervalSeconds: number,
): readonly FeedRelease[] {
  const lateralRange = SCALE.channelWidth - SCALE.marbleRadius * 4;
  const tangentOffset = -FEEDER_APRON_LENGTH + SCALE.marbleRadius * 3;

  return Object.freeze(
    Array.from({ length: count }, (_, marbleIndex) =>
      release(
        marbleIndex,
        positionInEntryFrame(entry, (random() - 0.5) * lateralRange, tangentOffset),
        Math.round((marbleIndex * releaseIntervalSeconds) / KINEMATIC_FIXED_STEP_SECONDS),
        false,
      ),
    ),
  );
}

export function buildFeedCohort(profile: FeedProfile, seed: number, entry: Anchor): FeedCohort {
  if (!Number.isSafeInteger(seed)) throw new RangeError("Feed seed must be a safe integer");
  const random = createSeededRandom(seed);
  const releases =
    profile === "burst15"
      ? burstReleases(entry, random)
      : isolatedReleases(
          entry,
          random,
          profile === "continuous" ? CONTINUOUS_COHORT_SIZE : 1,
          profile === "continuous" ? CONTINUOUS_RELEASE_INTERVAL_SECONDS : 0,
        );

  return Object.freeze({
    profile,
    seed,
    releases,
    stallTimeoutSeconds: FEED_STALL_TIMEOUT_SECONDS,
  });
}

/** Stable identity for the configuration boundary that resets live cohort
 * state. Sorting parameter keys prevents object insertion order from
 * producing a false reset or false reuse. */
export function feedConfigurationIdentity(configuration: FeedConfiguration): string {
  const params = Object.entries(configuration.params).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return JSON.stringify({
    moduleId: configuration.moduleId,
    params,
    profile: configuration.profile,
    seed: configuration.seed,
  });
}
