import { afterEach, describe, expect, it, vi } from "vitest";

import { createRaceAudio } from "./createRaceAudio";

function createAudioContextMock(): AudioContext {
  let currentTime = 1;
  const oscillator = {
    type: "sine",
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as OscillatorNode;
  const gain = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  } as unknown as GainNode;

  return {
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      currentTime = value;
    },
    state: "suspended",
    destination: {} as AudioDestinationNode,
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;
}

describe("createRaceAudio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is silent until a user gesture unmutes it", async () => {
    const context = createAudioContextMock();
    const Constructor = vi.fn(function AudioContextMock() {
      return context;
    });
    vi.stubGlobal("window", { AudioContext: Constructor });
    const audio = createRaceAudio();

    audio.playContact({ impulse: 3 });
    expect(Constructor).not.toHaveBeenCalled();

    await audio.setMuted(false);

    expect(audio.isMuted()).toBe(false);
    expect(Constructor).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
  });

  it("modulates impacts, throttles dense contacts, and plays the finish sting", async () => {
    const context = createAudioContextMock();
    vi.stubGlobal("window", {
      AudioContext: vi.fn(function AudioContextMock() {
        return context;
      }),
    });
    const audio = createRaceAudio();
    await audio.setMuted(false);

    audio.playContact({ impulse: 1 });
    audio.playContact({ impulse: 5 });
    audio.playFinish();

    expect(context.createOscillator).toHaveBeenCalledTimes(3);
    expect(context.createGain).toHaveBeenCalledTimes(3);
    const firstOscillator = vi.mocked(context.createOscillator).mock.results[0]?.value;
    const firstGain = vi.mocked(context.createGain).mock.results[0]?.value;

    if (firstOscillator === undefined || firstGain === undefined) {
      throw new Error("Expected the first collision tone");
    }
    expect(firstOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(262, 1);
    expect(vi.mocked(firstGain.gain.setValueAtTime).mock.calls[0]?.[0]).toBeCloseTo(0.037);
  });

  it("mutes immediately and closes a created context on disposal", async () => {
    const context = createAudioContextMock();
    vi.stubGlobal("window", {
      AudioContext: vi.fn(function AudioContextMock() {
        return context;
      }),
    });
    const audio = createRaceAudio();
    await audio.setMuted(false);
    await audio.setMuted(true);
    audio.playFinish();

    expect(context.createOscillator).not.toHaveBeenCalled();
    audio.dispose();

    expect(context.close).toHaveBeenCalledOnce();
  });
});
