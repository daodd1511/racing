import { describe, expect, it } from "vitest";

import type { RaceSnapshot } from "./liveTypes";
import { decisiveMarbleTarget } from "./cameraTarget";

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
        snapshot({
          decisiveMarbleIndex: 1,
          marbleTransforms: [
            { marbleIndex: 0, position: [0, 0, 0], rotation: [0, 0, 0, 1] },
            { marbleIndex: 1, position, rotation: [0, 0, 0, 1] },
          ],
        }),
      ),
    ).toEqual({ marbleIndex: 1, position });
  });

  it("does not fabricate a camera target when the decisive marble is absent", () => {
    expect(
      decisiveMarbleTarget(
        snapshot({
          decisiveMarbleIndex: 2,
          marbleTransforms: [{ marbleIndex: 0, position: [0, 0, 0], rotation: [0, 0, 0, 1] }],
        }),
      ),
    ).toBeNull();
  });
});
