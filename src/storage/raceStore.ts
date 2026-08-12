import { DEFAULT_PICKER_SETTINGS, DEFAULT_RACE_CONFIG } from "../race/config";
import type {
  CommittedRaceRecord,
  PickerSettingsV1,
  PickerStateV1,
  SelectionMode,
} from "../race/types";

const STORAGE_KEY = "marble-race-picker";

export interface RaceStore {
  load(): PickerStateV1;
  saveRoster(roster: readonly string[]): PickerStateV1;
  saveSettings(settings: PickerSettingsV1): PickerStateV1;
  appendCommittedRace(record: CommittedRaceRecord): PickerStateV1;
}

function createEmptyState(): PickerStateV1 {
  return Object.freeze({
    version: 1,
    roster: Object.freeze([]),
    settings: Object.freeze({ ...DEFAULT_PICKER_SETTINGS }),
    history: Object.freeze([]),
  });
}

function isSelectionMode(value: unknown): value is SelectionMode {
  return value === "first" || value === "last";
}

function isValidRoster(value: unknown, allowEmpty = true): value is readonly string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.length <= DEFAULT_RACE_CONFIG.maximumRosterSize &&
    value.every((name) => typeof name === "string" && name.trim().length > 0)
  );
}

function isValidRanking(value: unknown, rosterSize: number): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.every((index) => Number.isSafeInteger(index) && index >= 0 && index < rosterSize)
  );
}

function isCommittedRaceRecord(value: unknown): value is CommittedRaceRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Partial<CommittedRaceRecord>;
  const rosterSize = record.roster?.length;
  const selectedMarbleIndex = record.selectedMarbleIndex;

  return (
    Number.isSafeInteger(record.seed) &&
    Number.isSafeInteger(record.committedAtEpochMs) &&
    isValidRoster(record.roster, false) &&
    typeof rosterSize === "number" &&
    typeof selectedMarbleIndex === "number" &&
    Number.isSafeInteger(selectedMarbleIndex) &&
    selectedMarbleIndex >= 0 &&
    selectedMarbleIndex < rosterSize &&
    typeof record.selectedName === "string" &&
    isValidRanking(record.finishOrder, rosterSize) &&
    isValidRanking(record.finalRanking, rosterSize)
  );
}

function isPickerState(value: unknown): value is PickerStateV1 {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const state = value as Partial<PickerStateV1>;

  return (
    state.version === 1 &&
    isValidRoster(state.roster) &&
    typeof state.settings === "object" &&
    state.settings !== null &&
    isSelectionMode(state.settings.selectionMode) &&
    Array.isArray(state.history) &&
    state.history.every(isCommittedRaceRecord)
  );
}

function cloneRecord(record: CommittedRaceRecord): CommittedRaceRecord {
  return Object.freeze({
    ...record,
    roster: Object.freeze([...record.roster]),
    finishOrder: Object.freeze([...record.finishOrder]),
    finalRanking: Object.freeze([...record.finalRanking]),
  });
}

function cloneState(state: PickerStateV1): PickerStateV1 {
  return Object.freeze({
    version: 1,
    roster: Object.freeze([...state.roster]),
    settings: Object.freeze({ ...state.settings }),
    history: Object.freeze(state.history.map(cloneRecord)),
  });
}

function readState(storage: Storage): PickerStateV1 {
  try {
    const serialized = storage.getItem(STORAGE_KEY);

    if (serialized === null) {
      return createEmptyState();
    }

    const parsed: unknown = JSON.parse(serialized);
    return isPickerState(parsed) ? cloneState(parsed) : createEmptyState();
  } catch {
    return createEmptyState();
  }
}

function writeState(storage: Storage, state: PickerStateV1): PickerStateV1 {
  const immutableState = cloneState(state);
  storage.setItem(STORAGE_KEY, JSON.stringify(immutableState));
  return immutableState;
}

function assertRoster(roster: readonly string[]): void {
  if (!isValidRoster(roster, false)) {
    throw new RangeError(
      `Roster must contain 1–${DEFAULT_RACE_CONFIG.maximumRosterSize} non-empty names`,
    );
  }
}

function assertSettings(settings: PickerSettingsV1): void {
  if (!isSelectionMode(settings.selectionMode)) {
    throw new RangeError("Selection mode must be first or last");
  }
}

function assertCommittedRace(record: CommittedRaceRecord): void {
  if (!isCommittedRaceRecord(record)) {
    throw new RangeError("Committed race record is malformed");
  }
}

export function createRaceStore(storage: Storage): RaceStore {
  return {
    load() {
      return readState(storage);
    },
    saveRoster(roster) {
      assertRoster(roster);
      const current = readState(storage);
      return writeState(storage, { ...current, roster: Object.freeze([...roster]) });
    },
    saveSettings(settings) {
      assertSettings(settings);
      const current = readState(storage);
      return writeState(storage, { ...current, settings: Object.freeze({ ...settings }) });
    },
    appendCommittedRace(record) {
      assertCommittedRace(record);
      const current = readState(storage);
      return writeState(storage, {
        ...current,
        history: Object.freeze([...current.history, cloneRecord(record)]),
      });
    },
  };
}
