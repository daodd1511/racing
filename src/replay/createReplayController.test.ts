import { afterEach, describe, expect, it, vi } from "vitest";

import type { RaceRecording } from "../race/types";
import { createReplayController } from "./createReplayController";

const render = vi.fn();
const dispose = vi.fn();
let scheduled: FrameRequestCallback | undefined;

const RECORDING = {
  seed: 1,
  roster: ["Avery"],
  selectionMode: "first",
  slotByMarbleIndex: [0],
  frames: [
    {
      index: 0,
      simulationTimeSeconds: 1,
      transforms: [{ position: [0, 2, 0], rotation: [0, 0, 0, 1] }],
    },
    {
      index: 1,
      simulationTimeSeconds: 2,
      transforms: [{ position: [0, 1, 0], rotation: [0, 0, 0, 1] }],
    },
  ],
  contactEvents: [{ frameIndex: 1, simulationTimeSeconds: 2, marbleIndices: [0], impulse: 1 }],
  finishFrameByMarbleIndex: [1],
  finishOrder: [0],
  finalRanking: [0],
  selectedMarbleIndex: 0,
  selectionFrameIndex: 1,
  simulationDurationSeconds: 2,
} satisfies RaceRecording;

describe("createReplayController", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    render.mockReset();
    dispose.mockReset();
    scheduled = undefined;
  });

  it("replays immutable transforms, contact events, and completion", () => {
    const onContact = vi.fn();
    const onComplete = vi.fn();
    const onPlaybackTime = vi.fn();
    vi.stubGlobal("performance", { now: () => 0 });
    vi.stubGlobal("window", {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        scheduled = callback;
        return 1;
      },
      cancelAnimationFrame: vi.fn(),
    });
    const controller = createReplayController({ render, resize: vi.fn(), dispose }, RECORDING, {
      onContact,
      onComplete,
      onPlaybackTime,
    });

    controller.start();
    scheduled?.(0);
    scheduled?.(2_000);

    expect(render).toHaveBeenCalled();
    expect(onContact).toHaveBeenCalledWith(RECORDING.contactEvents[0]);
    expect(onPlaybackTime).toHaveBeenLastCalledWith(2);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("uses the final replay segment for slow motion", () => {
    vi.stubGlobal("performance", { now: () => 0 });
    vi.stubGlobal("window", {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        scheduled = callback;
        return 1;
      },
      cancelAnimationFrame: vi.fn(),
    });
    const controller = createReplayController({ render, resize: vi.fn(), dispose }, RECORDING, {});

    controller.start();
    scheduled?.(1_640);
    const approachPosition = render.mock.calls.at(-1)?.[0][0].position[1];
    scheduled?.(1_820);
    const slowMotionPosition = render.mock.calls.at(-1)?.[0][0].position[1];

    expect(approachPosition).toBeCloseTo(1.2, 2);
    expect(slowMotionPosition).toBeCloseTo(1.1, 2);
  });

  it("cancels and disposes the scene", () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("performance", { now: () => 0 });
    vi.stubGlobal("window", {
      requestAnimationFrame: () => 3,
      cancelAnimationFrame,
    });
    const controller = createReplayController({ render, resize: vi.fn(), dispose }, RECORDING, {});

    controller.start();
    controller.dispose();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(3);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
