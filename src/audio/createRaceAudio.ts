import type { RaceMusicTrack } from "./raceMusic";

export interface RaceAudio {
  isMuted(): boolean;
  setMuted(muted: boolean): Promise<void>;
  startMusic(track: RaceMusicTrack): void;
  stopMusic(): void;
  dispose(): void;
}

interface RaceAudioOptions {
  readonly createMusicPlayer?: () => HTMLAudioElement;
}

const MUSIC_VOLUME = 0.16;

export function createRaceAudio({
  createMusicPlayer = () => new Audio(),
}: RaceAudioOptions = {}): RaceAudio {
  let musicPlayer: HTMLAudioElement | undefined;
  let activeMusicUrl: string | undefined;
  let loadedMusicUrl: string | undefined;
  let muted = true;
  let disposed = false;

  function playActiveMusic(): void {
    if (muted || disposed || activeMusicUrl === undefined) {
      return;
    }

    const player = (musicPlayer ??= createMusicPlayer());
    if (loadedMusicUrl !== activeMusicUrl) {
      player.pause();
      player.src = activeMusicUrl;
      player.loop = true;
      player.volume = MUSIC_VOLUME;
      player.currentTime = 0;
      loadedMusicUrl = activeMusicUrl;
    }
    void player.play().catch(() => undefined);
  }

  return {
    isMuted() {
      return muted;
    },
    async setMuted(nextMuted) {
      if (disposed) {
        return;
      }

      muted = nextMuted;
      if (muted) {
        musicPlayer?.pause();
        return;
      }

      playActiveMusic();
    },
    startMusic(track) {
      if (disposed) {
        return;
      }

      activeMusicUrl = track.url;
      loadedMusicUrl = undefined;
      if (muted && musicPlayer !== undefined) {
        musicPlayer.pause();
        musicPlayer.currentTime = 0;
      }
      playActiveMusic();
    },
    stopMusic() {
      activeMusicUrl = undefined;
      if (musicPlayer === undefined) {
        return;
      }

      musicPlayer.pause();
      musicPlayer.currentTime = 0;
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      muted = true;
      activeMusicUrl = undefined;
      loadedMusicUrl = undefined;
      musicPlayer?.pause();
    },
  };
}
