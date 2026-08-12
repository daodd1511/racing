import { afterEach, describe, expect, it, vi } from "vitest";

import type { RaceRecording } from "../race/types";

const { mockedSimulateRace } = vi.hoisted(() => ({
  mockedSimulateRace: vi.fn(),
}));

vi.mock("./simulateRace", () => ({
  simulateRace: mockedSimulateRace,
}));

import { simulateWithRetry } from "./simulateWithRetry";

const ACCEPTED_RECORDING = {
  seed: 0,
  roster: ["Avery"],
  selectionMode: "first",
  slotByMarbleIndex: [0],
  frames: [],
  contactEvents: [],
  finishFrameByMarbleIndex: [0],
  finishOrder: [0],
  finalRanking: [0],
  selectedMarbleIndex: 0,
  selectionFrameIndex: 0,
  simulationDurationSeconds: 1 / 60,
} satisfies RaceRecording;

describe("simulateWithRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockedSimulateRace.mockReset();
  });

  it("discards rejected seeds and preserves the accepted recording seed", () => {
    mockedSimulateRace
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ ...ACCEPTED_RECORDING, seed: 858_993_459 });
    vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);

    const recording = simulateWithRetry(["Avery"], "first");

    expect(mockedSimulateRace).toHaveBeenNthCalledWith(1, ["Avery"], 429_496_729, "first");
    expect(mockedSimulateRace).toHaveBeenNthCalledWith(2, ["Avery"], 858_993_459, "first");
    expect(recording.seed).toBe(858_993_459);
  });
});
