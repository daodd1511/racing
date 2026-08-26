import { describe, expect, it } from "vitest";

import type { Anchor } from "../modules/types";
import type { Vector3 } from "../race/types";
import {
  CROSSING_HYSTERESIS_DISTANCE,
  evaluateCohortValidity,
  observeConfirmedCrossing,
  observeModuleRun,
  tieAwareCrossingRanks,
  type CrossingObservation,
  type FrameSample,
  type ModuleRunObservation,
} from "./metrics";

const plane = (z: number): Anchor => ({
  position: [0, 0, z],
  tangent: [0, 0, 1],
  up: [0, 1, 0],
});
const frame = (tSeconds: number, z: number): FrameSample => ({
  tSeconds,
  position: [0, 0, z],
});

describe("confirmed crossing observations", () => {
  it("linearly interpolates the absolute crossing time and position", () => {
    const crossing = observeConfirmedCrossing(
      [frame(4, -0.01), frame(4.02, 0.01), frame(4.04, CROSSING_HYSTERESIS_DISTANCE)],
      plane(0),
    );

    expect(crossing?.timeSeconds).toBeCloseTo(4.01);
    expect(crossing?.position).toEqual([0, 0, 0]);
    expect(crossing?.speed).toBeCloseTo(1);
  });

  it("discards a provisional crossing that returns before one-diameter hysteresis", () => {
    const crossing = observeConfirmedCrossing(
      [
        frame(0, -0.01),
        frame(1, 0.01),
        frame(2, -0.01),
        frame(3, 0.03),
        frame(4, CROSSING_HYSTERESIS_DISTANCE + 0.01),
      ],
      plane(0),
    );

    expect(crossing?.timeSeconds).toBeCloseTo(2.25);
    expect(crossing?.segmentEndFrameIndex).toBe(3);
  });

  it("keeps an unconfirmed final crossing incomplete", () => {
    expect(observeConfirmedCrossing([frame(0, -0.01), frame(1, 0.01)], plane(0))).toBeNull();
  });
});

describe("Module observations", () => {
  it("measures Dwell from interpolated entry time rather than the first frame", () => {
    const observation = observeModuleRun(
      {
        frames: [
          frame(0, -0.1),
          frame(1, 0.1),
          frame(2, 0.2),
          frame(3, 0.9),
          frame(4, 1.1),
          frame(5, 1 + CROSSING_HYSTERESIS_DISTANCE),
        ],
      },
      plane(0),
      plane(1),
    );

    expect(observation.completed).toBe(true);
    expect(observation.entry?.timeSeconds).toBeCloseTo(0.5);
    expect(observation.exit?.timeSeconds).toBeCloseTo(3.5);
    expect(observation.dwellSeconds).toBeCloseTo(3);
  });

  it("reports behavior unavailable when valid completions are below the supplied floor", () => {
    const complete = (completed: boolean): ModuleRunObservation => ({
      entry: null,
      exit: null,
      completed,
      dwellSeconds: null,
    });

    expect(evaluateCohortValidity([complete(true), complete(true), complete(false)], 3)).toEqual({
      totalRuns: 3,
      completedRuns: 2,
      minimumCompletedRuns: 3,
      behaviorAvailable: false,
    });
  });
});

describe("tie-aware crossing ranks", () => {
  it("assigns competition ranks to ties and leaves incomplete runs unranked", () => {
    const crossing = (timeSeconds: number): CrossingObservation => ({
      timeSeconds,
      position: [0, 0, 0] as Vector3,
      speed: 1,
      segmentEndFrameIndex: 1,
    });

    expect(tieAwareCrossingRanks([crossing(1), crossing(1 + 5e-10), crossing(2), null])).toEqual([
      1,
      1,
      3,
      null,
    ]);
  });
});
