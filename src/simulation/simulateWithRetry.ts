import { DEFAULT_RACE_CONFIG } from "../race/config";
import type { RaceRecording, SelectionMode } from "../race/types";
import { simulateRace } from "./simulateRace";

function createSeed(): number {
  return Math.floor(Math.random() * 4_294_967_296);
}

export function simulateWithRetry(roster: readonly string[], mode: SelectionMode): RaceRecording {
  for (let attempt = 0; attempt < DEFAULT_RACE_CONFIG.retryLimit; attempt += 1) {
    const seed = createSeed();
    const recording = simulateRace(roster, seed, mode);

    if (recording !== null) {
      return recording;
    }
  }

  throw new Error(
    `Unable to produce a complete ${mode}-mode race after ${DEFAULT_RACE_CONFIG.retryLimit} seeds`,
  );
}
