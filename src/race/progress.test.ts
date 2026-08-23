import { describe, expect, it } from "vitest";

import { assembleCourse } from "../course/assembleCourse";
import { DEFAULT_RACE_CONFIG } from "./config";
import type { RaceRequest } from "./liveTypes";
import {
  advanceWatchdog,
  createRaceProgress,
  recordCheckpoint,
  recordFinish,
  recordMarbleProgress,
} from "./progress";

const COURSE = assembleCourse(17);

function request(selectionMode: RaceRequest["selectionMode"]): RaceRequest {
  return { seed: 17, roster: ["A", "B", "C"], selectionMode };
}

describe("Race progress", () => {
  it("records only the first next-checkpoint crossing and keeps split times immutable", () => {
    const initial = createRaceProgress(request("first"), COURSE);
    const first = recordCheckpoint(initial, 1, 0, 1.5);
    const duplicate = recordCheckpoint(first, 1, 0, 2);
    const skipped = recordCheckpoint(first, 1, 2, 2);

    expect(first.splitTimes[1][0]).toBe(1.5);
    expect(duplicate).toBe(first);
    expect(skipped).toBe(first);
    expect(initial.splitTimes[1][0]).toBeNull();
    expect(Object.isFrozen(first.splitTimes)).toBe(true);
    expect(Object.isFrozen(first.splitTimes[1])).toBe(true);
  });

  it("restricts projection to the interval after the highest passed checkpoint", () => {
    const initial = createRaceProgress(request("first"), COURSE);
    const farPosition = COURSE.route.at(-1)!;
    const beforeCheckpoint = recordMarbleProgress(initial, 0, farPosition, 0.1);
    expect(beforeCheckpoint.routeDistances[0]).toBeLessThanOrEqual(
      COURSE.checkpoints[0].routeDistance,
    );

    const passed = recordCheckpoint(beforeCheckpoint, 0, 0, 0.2);
    const afterCheckpoint = recordMarbleProgress(passed, 0, farPosition, 0.3);
    expect(afterCheckpoint.routeDistances[0]).toBeGreaterThanOrEqual(
      COURSE.checkpoints[0].routeDistance,
    );
    expect(afterCheckpoint.routeDistances[0]).toBeLessThanOrEqual(
      COURSE.checkpoints[1].routeDistance,
    );
  });

  it("completes first with partial-progress ranking and freezes one outcome", () => {
    let state = createRaceProgress(request("first"), COURSE);
    state = recordCheckpoint(state, 2, 0, 0.5);
    state = recordFinish(state, 0, 1);

    expect(state.outcome).toMatchObject({
      kind: "completed",
      selectedMarbleIndex: 0,
      finishOrder: [0],
      finalRanking: [0, 2, 1],
    });
    expect(recordFinish(state, 1, 2)).toBe(state);
    expect(advanceWatchdog(state, DEFAULT_RACE_CONFIG.maximumSimulationSeconds)).toBe(state);
  });

  it("keeps the trailing unfinished marble decisive and selects the last crossing", () => {
    let state = createRaceProgress(request("last"), COURSE);
    state = recordCheckpoint(state, 0, 0, 0.2);
    expect(state.decisiveMarbleIndex).toBe(2);
    state = recordFinish(state, 0, 1);
    state = recordFinish(state, 2, 2);
    expect(state.outcome).toBeNull();
    expect(state.decisiveMarbleIndex).toBe(1);
    state = recordFinish(state, 1, 3);

    expect(state.outcome).toEqual({
      kind: "completed",
      seed: 17,
      selectedMarbleIndex: 1,
      finishOrder: [0, 2, 1],
      finalRanking: [0, 2, 1],
      elapsedSeconds: 3,
    });
  });

  it("fails honestly at the watchdog with unfinished marble indices", () => {
    let state = createRaceProgress(request("last"), COURSE);
    state = recordFinish(state, 1, 3);
    state = advanceWatchdog(state, DEFAULT_RACE_CONFIG.maximumSimulationSeconds);

    expect(state.outcome).toEqual({
      kind: "watchdog",
      seed: 17,
      unfinishedMarbleIndices: [0, 2],
      elapsedSeconds: DEFAULT_RACE_CONFIG.maximumSimulationSeconds,
    });
  });
});
