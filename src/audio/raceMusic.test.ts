import { describe, expect, it } from "vitest";

import { RACE_MUSIC_TRACKS, selectRaceMusicTrack } from "./raceMusic";

describe("raceMusic", () => {
  it("contains only the two selected tracks", () => {
    expect(RACE_MUSIC_TRACKS.map((track) => track.id)).toEqual(["gran-prix", "arcade-style-game"]);
  });

  it("alternates tracks deterministically from the Race seed", () => {
    expect(selectRaceMusicTrack(8).id).toBe("gran-prix");
    expect(selectRaceMusicTrack(9).id).toBe("arcade-style-game");
    expect(selectRaceMusicTrack(10).id).toBe("gran-prix");
  });
});
