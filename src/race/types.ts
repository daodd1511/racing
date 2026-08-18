export type SelectionMode = "first" | "last";

export type Vector3 = readonly [x: number, y: number, z: number];

export type Quaternion = readonly [x: number, y: number, z: number, w: number];

// Kept despite being a "recording" type per PLAN.md's deletion list: it is
// still `createRaceAudio.ts`'s (and its test's) `playContact` input, and that
// module is one Phase 1 keeps untouched -- audio's rewiring onto live
// contact events is Spec 4's job, not this phase's. Frame-based fields
// (frameIndex, simulationTimeSeconds, marbleIndices) are unused by the
// surviving code; only `impulse` is read.
export interface RecordedContactEvent {
  readonly frameIndex: number;
  readonly simulationTimeSeconds: number;
  readonly marbleIndices: readonly number[];
  readonly impulse: number;
}

export interface CommittedRaceRecord {
  readonly seed: number;
  readonly committedAtEpochMs: number;
  readonly roster: readonly string[];
  readonly selectionMode: SelectionMode;
  readonly selectedMarbleIndex: number;
  readonly selectedName: string;
  readonly finishOrder: readonly number[];
  readonly finalRanking: readonly number[];
}

export interface PickerSettingsV1 {
  readonly selectionMode: SelectionMode;
}

export interface PickerStateV1 {
  readonly version: 1;
  readonly roster: readonly string[];
  readonly settings: PickerSettingsV1;
  readonly history: readonly CommittedRaceRecord[];
}
