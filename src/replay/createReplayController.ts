import type { MarbleTransform, RaceRecording, RecordedContactEvent } from "../race/types";
import type { RaceScene } from "../render/createRaceScene";

export interface ReplayCallbacks {
  onFrame?(frameIndex: number): void;
  onContact?(event: RecordedContactEvent): void;
  onComplete?(): void;
}

export interface ReplayController {
  start(): void;
  cancel(): void;
  dispose(): void;
}

const REPLAY_DURATION_MS = 30_000;
const SLOW_APPROACH_START = 0.82;
const SLOW_APPROACH_SOURCE_FRACTION = 0.9;

function sourceProgressAt(playbackProgress: number): number {
  if (playbackProgress <= SLOW_APPROACH_START) {
    return (playbackProgress / SLOW_APPROACH_START) * SLOW_APPROACH_SOURCE_FRACTION;
  }

  return (
    SLOW_APPROACH_SOURCE_FRACTION +
    ((playbackProgress - SLOW_APPROACH_START) / (1 - SLOW_APPROACH_START)) *
      (1 - SLOW_APPROACH_SOURCE_FRACTION)
  );
}

function interpolateTransforms(
  left: readonly MarbleTransform[],
  right: readonly MarbleTransform[],
  fraction: number,
): MarbleTransform[] {
  return left.map((transform, index) => {
    const next = right[index] ?? transform;

    return {
      position: [
        transform.position[0] + (next.position[0] - transform.position[0]) * fraction,
        transform.position[1] + (next.position[1] - transform.position[1]) * fraction,
        transform.position[2] + (next.position[2] - transform.position[2]) * fraction,
      ],
      rotation: [
        transform.rotation[0] + (next.rotation[0] - transform.rotation[0]) * fraction,
        transform.rotation[1] + (next.rotation[1] - transform.rotation[1]) * fraction,
        transform.rotation[2] + (next.rotation[2] - transform.rotation[2]) * fraction,
        transform.rotation[3] + (next.rotation[3] - transform.rotation[3]) * fraction,
      ],
    };
  });
}

export function createReplayController(
  scene: RaceScene,
  recording: RaceRecording,
  callbacks: ReplayCallbacks,
): ReplayController {
  let animationFrame: number | undefined;
  let startedAt: number | undefined;
  let nextContactEventIndex = 0;
  let lastFrameIndex = -1;
  let active = false;
  let disposed = false;

  const durationSeconds = recording.simulationDurationSeconds;
  const lastFrame = recording.frames.at(-1);

  if (lastFrame === undefined || durationSeconds <= 0) {
    throw new Error("Race recording must contain at least one frame");
  }
  const finalFrame = lastFrame;

  function renderAt(timestamp: number): void {
    if (!active || startedAt === undefined) {
      return;
    }

    const elapsed = Math.max(0, timestamp - startedAt);
    const playbackProgress = Math.min(1, elapsed / REPLAY_DURATION_MS);
    const sourceTimeSeconds = sourceProgressAt(playbackProgress) * durationSeconds;
    const framePosition = sourceTimeSeconds / recording.frames[0].simulationTimeSeconds - 1;
    const lowerFrameIndex = Math.max(0, Math.min(finalFrame.index, Math.floor(framePosition)));
    const upperFrameIndex = Math.min(finalFrame.index, lowerFrameIndex + 1);
    const fractionalFrame = framePosition - lowerFrameIndex;
    const lowerFrame = recording.frames[lowerFrameIndex];
    const upperFrame = recording.frames[upperFrameIndex];

    scene.render(
      interpolateTransforms(
        lowerFrame.transforms,
        upperFrame.transforms,
        Math.max(0, fractionalFrame),
      ),
    );

    if (lowerFrameIndex !== lastFrameIndex) {
      callbacks.onFrame?.(lowerFrameIndex);
      lastFrameIndex = lowerFrameIndex;
    }

    while (
      nextContactEventIndex < recording.contactEvents.length &&
      recording.contactEvents[nextContactEventIndex].frameIndex <= lowerFrameIndex
    ) {
      callbacks.onContact?.(recording.contactEvents[nextContactEventIndex]);
      nextContactEventIndex += 1;
    }

    if (playbackProgress === 1) {
      active = false;
      animationFrame = undefined;
      callbacks.onComplete?.();
      return;
    }

    animationFrame = window.requestAnimationFrame(renderAt);
  }

  return {
    start() {
      if (disposed || active) {
        return;
      }

      active = true;
      startedAt = performance.now();
      animationFrame = window.requestAnimationFrame(renderAt);
    },
    cancel() {
      active = false;
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = undefined;
      }
    },
    dispose() {
      if (disposed) {
        return;
      }

      this.cancel();
      disposed = true;
      scene.dispose();
    },
  };
}
