import { describe, expect, it } from "vitest";

import { createRaceStore } from "./raceStore";

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

describe("createRaceStore", () => {
  it("falls back safely for malformed persisted state", () => {
    const storage = new MemoryStorage();
    storage.setItem("marble-race-picker", "{not-json");

    expect(createRaceStore(storage).load()).toEqual({
      version: 1,
      roster: [],
      settings: { selectionMode: "first" },
      history: [],
    });
  });

  it("persists roster, settings, and immutable committed records", () => {
    const storage = new MemoryStorage();
    const store = createRaceStore(storage);
    const roster = ["Avery", "Avery"];
    const record = {
      seed: 9,
      committedAtEpochMs: 100,
      roster,
      selectionMode: "last" as const,
      selectedMarbleIndex: 1,
      selectedName: "Avery",
      finishOrder: [0, 1],
      finalRanking: [0, 1],
    };

    store.saveRoster(roster);
    store.saveSettings({ selectionMode: "last" });
    const state = store.appendCommittedRace(record);
    roster[0] = "Changed";
    record.finishOrder[0] = 1;

    expect(state.roster).toEqual(["Avery", "Avery"]);
    expect(state.settings).toEqual({ selectionMode: "last" });
    expect(state.history[0]).toMatchObject({
      selectedName: "Avery",
      finishOrder: [0, 1],
    });
    expect(store.load().history).toHaveLength(1);
  });
});
