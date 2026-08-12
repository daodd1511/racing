/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RaceRecording, SelectionMode } from "../race/types";

const mocks = vi.hoisted(() => ({
  complete: undefined as (() => void) | undefined,
  start: vi.fn(),
  dispose: vi.fn(),
  simulateWithRetry: vi.fn(),
}));

vi.mock("../simulation/initializeRapier", () => ({
  initializeRapier: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../simulation/simulateWithRetry", () => ({
  simulateWithRetry: mocks.simulateWithRetry,
}));

vi.mock("../ui/createRaceView", () => ({
  createRaceView: vi.fn(() => ({
    start: mocks.start,
    cancel: vi.fn(),
    dispose: mocks.dispose,
    onComplete(listener: () => void) {
      mocks.complete = listener;
      return () => undefined;
    },
  })),
}));

import { createApp } from "./createApp";

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

let storage: MemoryStorage;

function recordingFor(mode: SelectionMode): RaceRecording {
  return {
    seed: 12,
    roster: ["Avery", "Blake"],
    selectionMode: mode,
    slotByMarbleIndex: [0, 1],
    frames: [
      {
        index: 0,
        simulationTimeSeconds: 1,
        transforms: [
          { position: [0, 2, 0], rotation: [0, 0, 0, 1] },
          { position: [0, 1, 0], rotation: [0, 0, 0, 1] },
        ],
      },
    ],
    contactEvents: [],
    finishFrameByMarbleIndex: [0, 0],
    finishOrder: [0, 1],
    finalRanking: [0, 1],
    selectedMarbleIndex: mode === "first" ? 0 : 1,
    selectionFrameIndex: 0,
    simulationDurationSeconds: 1,
  };
}

describe("createApp", () => {
  beforeEach(() => {
    storage = new MemoryStorage();
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  });

  afterEach(() => {
    document.body.replaceChildren();
    mocks.complete = undefined;
    mocks.start.mockReset();
    mocks.dispose.mockReset();
    mocks.simulateWithRetry.mockReset();
  });

  it.each(["first", "last"] as const)(
    "commits the %s mode result and returns to setup",
    async (mode) => {
      mocks.simulateWithRetry.mockReturnValue(recordingFor(mode));
      const root = document.createElement("div");
      document.body.append(root);
      createApp(root);
      await Promise.resolve();
      const roster = root.querySelector<HTMLTextAreaElement>("#race-roster");
      const form = root.querySelector<HTMLFormElement>("form");

      if (roster === null || form === null) {
        throw new Error("Expected setup view");
      }
      roster.value = "Avery\nBlake";
      roster.dispatchEvent(new Event("input", { bubbles: true }));
      if (mode === "last") {
        const lastMode = root.querySelector<HTMLInputElement>('input[value="last"]');
        lastMode?.click();
      }
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
      mocks.complete?.();

      expect(mocks.simulateWithRetry).toHaveBeenCalledWith(["Avery", "Blake"], mode);
      expect(root.textContent).toContain(mode === "first" ? "Winner" : "Last finisher");
      expect(JSON.parse(storage.getItem("marble-race-picker") ?? "{}").history).toHaveLength(1);
      root.querySelector<HTMLButtonElement>(".result-new-race")?.click();

      expect(root.querySelector("#race-roster")).not.toBeNull();
    },
  );
});
