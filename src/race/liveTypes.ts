import type { Quaternion, SelectionMode, Vector3 } from "./types";

export interface RaceRequest {
  readonly seed: number;
  readonly roster: readonly string[];
  readonly selectionMode: SelectionMode;
}

export interface MarbleTransform {
  readonly marbleIndex: number;
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

export interface RaceContactEvent {
  readonly elapsedSeconds: number;
  readonly marbleIndices: readonly number[];
  readonly impulse: number;
}

export interface RaceSnapshot {
  readonly elapsedSeconds: number;
  readonly marbleTransforms: readonly MarbleTransform[];
  readonly ranking: readonly number[];
  readonly decisiveMarbleIndex: number;
  readonly passedCheckpoints: readonly number[];
  readonly splitTimes: readonly (readonly (number | null)[])[];
}

export type RaceOutcome =
  | {
      readonly kind: "completed";
      readonly seed: number;
      readonly selectedMarbleIndex: number;
      readonly finishOrder: readonly number[];
      readonly finalRanking: readonly number[];
      readonly elapsedSeconds: number;
    }
  | {
      readonly kind: "watchdog";
      readonly seed: number;
      readonly unfinishedMarbleIndices: readonly number[];
      readonly elapsedSeconds: number;
    };
