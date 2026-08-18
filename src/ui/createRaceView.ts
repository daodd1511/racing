import type { RaceRecording, RecordedContactEvent } from "../race/types";
import { createRaceScene, type RaceScene } from "../render/createRaceScene";
import { createMarbleStyles, type MarbleStyle } from "../render/marbleStyles";
import { createReplayController, type ReplayController } from "../replay/createReplayController";
import {
  createTrackDefinition,
  DEFAULT_TRACK_CONFIG,
  type TrackDefinition,
} from "../track/definition";
import {
  createProgressTracker,
  measureTrackProgress,
  type ProgressTracker,
} from "../track/progress";

export interface RaceView {
  start(): void;
  onComplete(listener: () => void): () => void;
  dispose(): void;
}

export interface RaceViewCallbacks {
  onContact?(event: RecordedContactEvent): void;
  onComplete?(): void;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);

  if (className !== undefined) {
    element.className = className;
  }

  return element;
}

function createMarbleToken(style: MarbleStyle, className: string): HTMLSpanElement {
  const token = createElement("span", className);
  token.style.setProperty("--marble-color", style.color);
  token.style.setProperty("--marble-accent", style.accentColor);
  token.dataset.pattern = style.pattern;
  token.setAttribute("aria-hidden", "true");

  return token;
}

function createLineup(roster: readonly string[], styles: readonly MarbleStyle[]): HTMLUListElement {
  const lineup = createElement("ul", "race-lineup-list");

  roster.forEach((name, index) => {
    const entry = createElement("li", "race-lineup-entry");
    entry.append(createMarbleToken(styles[index], "marble-token"));
    const label = createElement("span", "race-lineup-name");
    label.textContent = name;
    entry.append(label);
    lineup.append(entry);
  });

  return lineup;
}

// Playback only ever moves forward through frames (createReplayController has
// no scrubbing), so a running-max tracker updated once per newly-reached
// frame stays valid — see src/track/progress.ts's ProgressTracker for why
// this must be clamped at all (tight radii make small projection errors
// read as backward movement, which would flicker the leaderboard).
function rankAtFrame(
  recording: RaceRecording,
  track: TrackDefinition,
  progressTracker: ProgressTracker,
  frameIndex: number,
): readonly number[] {
  const frame = recording.frames[frameIndex];

  if (frame === undefined) {
    return recording.finalRanking;
  }

  for (let marbleIndex = 0; marbleIndex < recording.roster.length; marbleIndex += 1) {
    const position = frame.transforms[marbleIndex]?.position;
    if (position !== undefined) {
      progressTracker.update(marbleIndex, measureTrackProgress(track, position));
    }
  }

  return Array.from({ length: recording.roster.length }, (_, marbleIndex) => marbleIndex).sort(
    (left, right) => {
      const leftFinish = recording.finishFrameByMarbleIndex[left];
      const rightFinish = recording.finishFrameByMarbleIndex[right];
      const leftHasFinished = leftFinish !== null && leftFinish <= frameIndex;
      const rightHasFinished = rightFinish !== null && rightFinish <= frameIndex;

      if (leftHasFinished && rightHasFinished) {
        return leftFinish - rightFinish || left - right;
      }
      if (leftHasFinished) {
        return -1;
      }
      if (rightHasFinished) {
        return 1;
      }

      const leftProgress = progressTracker.currentProgress(left);
      const rightProgress = progressTracker.currentProgress(right);

      return rightProgress - leftProgress || left - right;
    },
  );
}

function createLeaderboard(
  roster: readonly string[],
  styles: readonly MarbleStyle[],
): { readonly root: HTMLOListElement; readonly rows: readonly HTMLLIElement[] } {
  const root = createElement("ol", "race-leaderboard-list");
  const rows = roster.map((name, index) => {
    const row = createElement("li", "race-leaderboard-row");
    const position = createElement("span", "race-leaderboard-position");
    const swatch = createMarbleToken(styles[index], "marble-token marble-token--small");
    const label = createElement("span", "race-leaderboard-name");
    label.textContent = name;
    const state = createElement("span", "race-leaderboard-state");
    state.textContent = "Ready";
    row.append(position, swatch, label, state);
    root.append(row);

    return row;
  });

  return { root, rows };
}

export function createRaceView(
  root: HTMLElement,
  recording: RaceRecording,
  callbacks: RaceViewCallbacks = {},
): RaceView {
  const styles = createMarbleStyles(recording.roster.length);
  const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);
  const cabinet = createElement("main", "race-cabinet");
  const header = createElement("header", "race-cabinet-header");
  const eyebrow = createElement("p", "race-eyebrow");
  eyebrow.textContent = "Physics-powered selection machine";
  const title = createElement("h1", "race-title");
  title.textContent = "Marble Mayhem";
  const status = createElement("p", "race-status");
  status.textContent = "Lineup loading";
  header.append(eyebrow, title, status);

  const stage = createElement("section", "race-stage");
  stage.setAttribute("aria-label", "Marble race replay");
  const playfield = createElement("div", "race-playfield");
  const canvas = createElement("canvas", "race-canvas");
  const liveReadout = createElement("div", "race-live-readout");
  const timingLabel = createElement("span", "race-live-label");
  timingLabel.textContent = "Race clock";
  const timing = createElement("strong", "race-live-time");
  timing.textContent = "00.00";
  liveReadout.append(timingLabel, timing);

  const lineup = createElement("section", "race-lineup");
  const lineupHeading = createElement("p", "race-lineup-heading");
  lineupHeading.textContent = "Starting lineup";
  const countdown = createElement("strong", "race-countdown");
  countdown.textContent = "3";
  lineup.append(lineupHeading, countdown, createLineup(recording.roster, styles));
  playfield.append(canvas, liveReadout, lineup);

  const board = createElement("aside", "race-scoreboard");
  board.classList.toggle("is-dense", recording.roster.length > 10);
  const boardHeading = createElement("div", "race-scoreboard-heading");
  const boardLabel = createElement("p", "race-scoreboard-label");
  boardLabel.textContent = "Live positions";
  const mode = createElement("strong", "race-scoreboard-mode");
  mode.textContent = recording.selectionMode === "first" ? "First across wins" : "Last across wins";
  boardHeading.append(boardLabel, mode);
  const leaderboard = createLeaderboard(recording.roster, styles);
  board.append(boardHeading, leaderboard.root);
  stage.append(playfield, board);

  cabinet.append(header, stage);
  root.replaceChildren(cabinet);

  let scene: RaceScene | undefined;
  let controller: ReplayController | undefined;
  let countdownTimer: number | undefined;
  let started = false;
  let disposed = false;
  const completionListeners = new Set<() => void>();
  const progressTracker = createProgressTracker(recording.roster.length);

  function updateLeaderboard(frameIndex: number): void {
    const ranking = rankAtFrame(recording, track, progressTracker, frameIndex);
    const completed = new Set(
      recording.finishOrder.filter((marbleIndex) => {
        const finishFrame = recording.finishFrameByMarbleIndex[marbleIndex];
        return finishFrame !== null && finishFrame <= frameIndex;
      }),
    );

    ranking.forEach((marbleIndex, position) => {
      const row = leaderboard.rows[marbleIndex];
      row.style.order = String(position);
      const positionElement = row.querySelector<HTMLSpanElement>(".race-leaderboard-position");
      if (positionElement !== null) {
        positionElement.textContent = String(position + 1);
      }
      row.classList.toggle("is-finished", completed.has(marbleIndex));
      const state = row.querySelector<HTMLSpanElement>(".race-leaderboard-state");
      if (state !== null) {
        state.textContent = completed.has(marbleIndex) ? "Finished" : "Racing";
      }
    });
  }

  function startReplay(): void {
    if (disposed) {
      return;
    }

    lineup.classList.add("is-hidden");
    status.textContent = "Live race";
    scene = createRaceScene(canvas, track, recording.roster, styles, recording.selectionMode);
    scene.render(recording.frames[0].transforms);
    updateLeaderboard(0);
    controller = createReplayController(scene, recording, {
      onFrame(frameIndex) {
        updateLeaderboard(frameIndex);
      },
      onPlaybackTime(seconds) {
        timing.textContent = seconds.toFixed(2);
      },
      onContact(event) {
        callbacks.onContact?.(event);
      },
      onComplete() {
        status.textContent = "Selection locked";
        callbacks.onComplete?.();
        completionListeners.forEach((listener) => listener());
      },
    });
    controller.start();
  }

  function beginLineup(): void {
    let remainingSeconds = 3;
    status.textContent = "Starting lineup";
    countdown.textContent = String(remainingSeconds);
    countdownTimer = window.setInterval(() => {
      remainingSeconds -= 1;
      countdown.textContent = remainingSeconds > 0 ? String(remainingSeconds) : "Go";

      if (remainingSeconds === 0) {
        if (countdownTimer !== undefined) {
          window.clearInterval(countdownTimer);
          countdownTimer = undefined;
        }
        startReplay();
      }
    }, 1_000);
  }

  const resizeObserver = new ResizeObserver(() => scene?.resize());
  resizeObserver.observe(playfield);
  updateLeaderboard(0);

  return {
    start() {
      if (started || disposed) {
        return;
      }
      started = true;
      beginLineup();
    },
    onComplete(listener) {
      completionListeners.add(listener);
      return () => completionListeners.delete(listener);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (countdownTimer !== undefined) {
        window.clearInterval(countdownTimer);
      }
      resizeObserver.disconnect();
      controller?.dispose();
      root.replaceChildren();
    },
  };
}
