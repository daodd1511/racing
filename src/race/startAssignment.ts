import { START_POSITIONS } from "../course/startFinish";
import { createSeededRandom, deriveRaceSeed, shuffleStartSlots } from "./random";
import type { Vector3 } from "./types";

export interface StartAssignment {
  readonly marbleIndex: number;
  readonly startPositionIndex: number;
  readonly position: Vector3;
}

export function assignStartPositions(seed: number, rosterSize: number): readonly StartAssignment[] {
  if (!Number.isSafeInteger(rosterSize) || rosterSize < 1 || rosterSize > START_POSITIONS.length) {
    throw new RangeError(`Roster size must be between 1 and ${START_POSITIONS.length}`);
  }

  const random = createSeededRandom(deriveRaceSeed(seed, "start"));
  const positions = shuffleStartSlots(START_POSITIONS.length, random).slice(0, rosterSize);
  return Object.freeze(
    positions.map((startPositionIndex, marbleIndex) =>
      Object.freeze({
        marbleIndex,
        startPositionIndex,
        position: START_POSITIONS[startPositionIndex],
      }),
    ),
  );
}
