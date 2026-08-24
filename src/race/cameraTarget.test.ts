import { describe, expect, it } from "vitest";

import type { Course } from "../course/types";
import type { RaceSnapshot } from "./liveTypes";
import { decisiveMarbleTarget } from "./cameraTarget";
import type { Vector3 } from "./types";

function course(route: readonly Vector3[]): Course {
  return {
    seed: 1,
    board: {
      columns: 3,
      rows: 3,
      cellPitch: 0.1,
      bayWidth: 1,
      bayHeight: 1,
      edgeMargin: 0.2,
      bounds: { min: [-2, -2, -0.5], max: [2, 2, 0.5] },
    },
    modules: [],
    connectors: [],
    route,
    checkpoints: [],
    start: {} as Course["start"],
    finish: {} as Course["finish"],
    entry: {} as Course["entry"],
    exit: {} as Course["exit"],
  };
}

const EASTBOUND_COURSE = course([
  [-2, 0, 0],
  [2, 0, 0],
]);

function snapshot({
  decisiveMarbleIndex,
  marbleTransforms,
}: {
  readonly decisiveMarbleIndex: number;
  readonly marbleTransforms: RaceSnapshot["marbleTransforms"];
}): RaceSnapshot {
  return {
    elapsedSeconds: 1,
    marbleTransforms,
    ranking: [0, 1],
    decisiveMarbleIndex,
    passedCheckpoints: [0, 0],
    splitTimes: [[], []],
  };
}

describe("decisiveMarbleTarget", () => {
  it("returns the same decisive marble transform used by broadcast consumers", () => {
    const position = [1.2, -0.4, 0.1] as const;

    expect(
      decisiveMarbleTarget(
        EASTBOUND_COURSE,
        snapshot({
          decisiveMarbleIndex: 1,
          marbleTransforms: [
            { marbleIndex: 0, position: [0, 0, 0], rotation: [0, 0, 0, 1] },
            { marbleIndex: 1, position, rotation: [0, 0, 0, 1] },
          ],
        }),
      ),
    ).toEqual({ marbleIndex: 1, position, forward: [1, 0, 0] });
  });

  it("uses the local Course tangent after a turn", () => {
    const turningCourse = course([
      [0, 0, 0],
      [2, 0, 0],
      [2, -2, 0],
    ]);

    expect(
      decisiveMarbleTarget(
        turningCourse,
        snapshot({
          decisiveMarbleIndex: 0,
          marbleTransforms: [{ marbleIndex: 0, position: [2, -1, 0], rotation: [0, 0, 0, 1] }],
        }),
      )?.forward,
    ).toEqual([0, -1, 0]);
  });

  it("does not fabricate a camera target when the decisive marble is absent", () => {
    expect(
      decisiveMarbleTarget(
        EASTBOUND_COURSE,
        snapshot({
          decisiveMarbleIndex: 2,
          marbleTransforms: [{ marbleIndex: 0, position: [0, 0, 0], rotation: [0, 0, 0, 1] }],
        }),
      ),
    ).toBeNull();
  });
});
