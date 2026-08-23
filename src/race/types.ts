export type SelectionMode = "first" | "last";

export type Vector3 = readonly [x: number, y: number, z: number];

export type Quaternion = readonly [x: number, y: number, z: number, w: number];

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
