export type SelectionMode = "first" | "last";

export type Vector3 = readonly [x: number, y: number, z: number];

export type Quaternion = readonly [x: number, y: number, z: number, w: number];

export interface MarbleTransform {
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

export interface TransformFrame {
  readonly index: number;
  readonly simulationTimeSeconds: number;
  readonly transforms: readonly MarbleTransform[];
}

export interface RecordedContactEvent {
  readonly frameIndex: number;
  readonly simulationTimeSeconds: number;
  readonly marbleIndices: readonly number[];
  readonly impulse: number;
}

export interface RaceRecording {
  readonly seed: number;
  readonly roster: readonly string[];
  readonly selectionMode: SelectionMode;
  readonly slotByMarbleIndex: readonly number[];
  readonly frames: readonly TransformFrame[];
  readonly contactEvents: readonly RecordedContactEvent[];
  readonly finishFrameByMarbleIndex: readonly (number | null)[];
  readonly finishOrder: readonly number[];
  readonly finalRanking: readonly number[];
  readonly selectedMarbleIndex: number;
  readonly selectionFrameIndex: number;
  readonly simulationDurationSeconds: number;
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
