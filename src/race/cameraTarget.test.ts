import { describe, expect, it } from "vitest";

import type { RaceSnapshot } from "./liveTypes";
import { cameraTargetForSnapshot, type CameraTargetState } from "./cameraTarget";

function snapshotAt(x: number, y: number): RaceSnapshot {
  return {
    elapsedSeconds: 1,
    marbleTransforms: [
      { marbleIndex: 0, position: [x, y, 4], rotation: [0, 0, 0, 1] },
    ],
    ranking: [0],
    decisiveMarbleIndex: 0,
    passedCheckpoints: [0],
    splitTimes: [[]],
  };
}

describe("cameraTargetForSnapshot", () => {
  const center: CameraTargetState = { x: 0, y: 0, following: false };

  it("uses hysteresis before beginning and ending a damped follow", () => {
    const initial = cameraTargetForSnapshot(center, snapshotAt(2.9, 0), 10);
    const following = cameraTargetForSnapshot(center, snapshotAt(3.1, 0), 10);
    const settling = cameraTargetForSnapshot(
      { x: 3, y: 0, following: true },
      snapshotAt(1.9, 0),
      10,
    );

    expect(initial).toEqual({ x: 0, y: 0, following: false });
    expect(following).toMatchObject({ following: true });
    expect(following.x).toBeGreaterThan(0);
    expect(settling).toEqual({ x: 3, y: 0, following: false });
  });

  it("cuts immediately beyond one viewport without changing depth", () => {
    const target = cameraTargetForSnapshot(center, snapshotAt(10.1, -4), 10);

    expect(target).toEqual({ x: 10.1, y: -4, following: true });
  });

  it("rejects invalid viewport sizes", () => {
    expect(() => cameraTargetForSnapshot(center, snapshotAt(0, 0), 0)).toThrow(/viewport/i);
  });
});
