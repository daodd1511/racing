import type { PickerSettingsV1 } from "./types";

export interface RaceConfig {
  readonly resultLabel: string;
  readonly maximumRosterSize: number;
  readonly maximumSimulationSeconds: number;
  readonly fixedTimeStepSeconds: number;
  readonly retryLimit: number;
  readonly marbleRadius: number;
}

export const DEFAULT_RACE_CONFIG: RaceConfig = Object.freeze({
  resultLabel: "Winner",
  maximumRosterSize: 15,
  maximumSimulationSeconds: 120,
  fixedTimeStepSeconds: 1 / 60,
  retryLimit: 24,
  marbleRadius: 0.35,
});

export const DEFAULT_PICKER_SETTINGS: PickerSettingsV1 = Object.freeze({
  selectionMode: "first",
});
