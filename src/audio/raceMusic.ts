import arcadeStyleGameUrl from "../assets/audio/arcade-style-game.mp3";
import granPrixUrl from "../assets/audio/gran-prix.mp3";

export interface RaceMusicTrack {
  readonly id: "gran-prix" | "arcade-style-game";
  readonly title: string;
  readonly artist: string;
  readonly url: string;
}

export const RACE_MUSIC_TRACKS: readonly RaceMusicTrack[] = Object.freeze([
  Object.freeze({
    id: "gran-prix",
    title: "Gran Prix",
    artist: "melodyayresgriffiths",
    url: granPrixUrl,
  }),
  Object.freeze({
    id: "arcade-style-game",
    title: "Music for Arcade Style Game",
    artist: "lucadialessandro",
    url: arcadeStyleGameUrl,
  }),
]);

export function selectRaceMusicTrack(seed: number): RaceMusicTrack {
  return RACE_MUSIC_TRACKS[seed % RACE_MUSIC_TRACKS.length] ?? RACE_MUSIC_TRACKS[0];
}
