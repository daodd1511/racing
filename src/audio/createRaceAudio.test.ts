import { afterEach, describe, expect, it, vi } from "vitest";

import { createRaceAudio } from "./createRaceAudio";
import type { RaceMusicTrack } from "./raceMusic";

const TRACK: RaceMusicTrack = Object.freeze({
  id: "gran-prix",
  title: "Gran Prix",
  artist: "melodyayresgriffiths",
  url: "/gran-prix.mp3",
});

function createMusicPlayerMock(): HTMLAudioElement {
  return {
    currentTime: 12,
    loop: false,
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    src: "",
    volume: 1,
  } as unknown as HTMLAudioElement;
}

describe("createRaceAudio", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queues one looping track while muted and follows the existing mute lifecycle", async () => {
    const player = createMusicPlayerMock();
    const createMusicPlayer = vi.fn(() => player);
    const audio = createRaceAudio({ createMusicPlayer });

    audio.startMusic(TRACK);

    expect(createMusicPlayer).not.toHaveBeenCalled();

    await audio.setMuted(false);
    expect(createMusicPlayer).toHaveBeenCalledOnce();
    expect(player.src).toBe(TRACK.url);
    expect(player.loop).toBe(true);
    expect(player.volume).toBe(0.16);
    expect(player.currentTime).toBe(0);
    expect(player.play).toHaveBeenCalledOnce();

    await audio.setMuted(true);
    expect(player.pause).toHaveBeenCalledTimes(2);

    audio.stopMusic();
    expect(player.currentTime).toBe(0);
    expect(player.pause).toHaveBeenCalledTimes(3);
  });

  it("pauses music and ignores further work after disposal", async () => {
    const player = createMusicPlayerMock();
    const audio = createRaceAudio({ createMusicPlayer: () => player });

    audio.startMusic(TRACK);
    await audio.setMuted(false);
    audio.dispose();
    audio.dispose();
    await audio.setMuted(false);
    audio.startMusic(TRACK);

    expect(player.pause).toHaveBeenCalledTimes(2);
    expect(player.play).toHaveBeenCalledOnce();
    expect(audio.isMuted()).toBe(true);
  });
});
