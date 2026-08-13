import type { RecordedContactEvent } from "../race/types";

export interface RaceAudio {
  isMuted(): boolean;
  setMuted(muted: boolean): Promise<void>;
  playContact(event: RecordedContactEvent): void;
  playFinish(): void;
  dispose(): void;
}

const MINIMUM_CONTACT_INTERVAL_SECONDS = 0.045;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function createContext(): AudioContext {
  const Constructor =
    window.AudioContext ??
    (window as Window & { readonly webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (Constructor === undefined) {
    throw new Error("Web Audio is not available in this browser");
  }

  return new Constructor();
}

export function createRaceAudio(): RaceAudio {
  let context: AudioContext | undefined;
  let muted = true;
  let disposed = false;
  let lastContactAtSeconds = Number.NEGATIVE_INFINITY;

  function contextIfActive(): AudioContext | undefined {
    return muted || disposed ? undefined : context;
  }

  function playTone(
    activeContext: AudioContext,
    frequency: number,
    volume: number,
    durationSeconds: number,
    type: OscillatorType,
  ): void {
    const oscillator = activeContext.createOscillator();
    const gain = activeContext.createGain();
    const startedAt = activeContext.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startedAt);
    gain.gain.setValueAtTime(volume, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + durationSeconds);
    oscillator.connect(gain);
    gain.connect(activeContext.destination);
    oscillator.start(startedAt);
    oscillator.stop(startedAt + durationSeconds);
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
        return;
      }

      context ??= createContext();
      if (context.state === "suspended") {
        await context.resume();
      }
    },
    playContact(event) {
      const activeContext = contextIfActive();
      if (activeContext === undefined) {
        return;
      }

      const startedAt = activeContext.currentTime;
      if (startedAt - lastContactAtSeconds < MINIMUM_CONTACT_INTERVAL_SECONDS) {
        return;
      }

      lastContactAtSeconds = startedAt;
      const impulse = clamp(event.impulse, 0, 6);
      playTone(
        activeContext,
        190 + impulse * 72,
        0.025 + impulse * 0.012,
        0.055 + impulse * 0.008,
        "sine",
      );
    },
    playFinish() {
      const activeContext = contextIfActive();
      if (activeContext === undefined) {
        return;
      }

      playTone(activeContext, 660, 0.12, 0.24, "triangle");
      playTone(activeContext, 880, 0.08, 0.34, "sine");
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      muted = true;
      if (context !== undefined && context.state !== "closed") {
        void context.close();
      }
    },
  };
}
