import { DEFAULT_RACE_CONFIG } from "../race/config";
import type { RaceRecording } from "../race/types";
import { createRaceScene, type RaceScene } from "../render/createRaceScene";
import { createMarbleStyles, type MarbleStyle } from "../render/marbleStyles";
import { createReplayController, type ReplayController } from "../replay/createReplayController";
import { createTrackDefinition, DEFAULT_TRACK_CONFIG } from "../track/definition";

export interface RaceView {
  start(): void;
  onComplete(listener: () => void): () => void;
  dispose(): void;
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

function rankAtFrame(recording: RaceRecording, frameIndex: number): readonly number[] {
  const frame = recording.frames[frameIndex];

  if (frame === undefined) {
    return recording.finalRanking;
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

      const leftPosition = frame.transforms[left]?.position;
      const rightPosition = frame.transforms[right]?.position;

      if (leftPosition === undefined || rightPosition === undefined) {
        return left - right;
      }

      const leftHorizontalDistance = leftPosition[0] ** 2 + leftPosition[2] ** 2;
      const rightHorizontalDistance = rightPosition[0] ** 2 + rightPosition[2] ** 2;

      return (
        leftPosition[1] - rightPosition[1] ||
        leftHorizontalDistance - rightHorizontalDistance ||
        left - right
      );
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

export function createRaceView(root: HTMLElement, recording: RaceRecording): RaceView {
  const styles = createMarbleStyles(recording.roster.length);
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
  const boardHeading = createElement("div", "race-scoreboard-heading");
  const boardLabel = createElement("p", "race-scoreboard-label");
  boardLabel.textContent = "Live positions";
  const mode = createElement("strong", "race-scoreboard-mode");
  mode.textContent = recording.selectionMode === "first" ? "First across wins" : "Last across wins";
  boardHeading.append(boardLabel, mode);
  const leaderboard = createLeaderboard(recording.roster, styles);
  board.append(boardHeading, leaderboard.root);
  stage.append(playfield, board);

  const result = createElement("section", "race-result");
  result.hidden = true;
  const resultLabel = createElement("p", "race-result-label");
  resultLabel.textContent =
    recording.selectionMode === "first" ? DEFAULT_RACE_CONFIG.resultLabel : "Last finisher";
  const selectedStyle = styles[recording.selectedMarbleIndex];
  result.append(createMarbleToken(selectedStyle, "marble-token marble-token--result"), resultLabel);
  const resultName = createElement("strong", "race-result-name");
  resultName.textContent = recording.roster[recording.selectedMarbleIndex];
  const resultDetail = createElement("p", "race-result-detail");
  resultDetail.textContent = `Seed ${recording.seed} · ${recording.finishOrder.length} finish${recording.finishOrder.length === 1 ? "" : "es"} observed`;
  result.append(resultName, resultDetail);

  cabinet.append(header, stage, result);
  root.replaceChildren(cabinet);

  let scene: RaceScene | undefined;
  let controller: ReplayController | undefined;
  let countdownTimer: number | undefined;
  let started = false;
  let disposed = false;
  const completionListeners = new Set<() => void>();

  function updateLeaderboard(frameIndex: number): void {
    const ranking = rankAtFrame(recording, frameIndex);
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
    scene = createRaceScene(canvas, createTrackDefinition(DEFAULT_TRACK_CONFIG), styles);
    scene.render(recording.frames[0].transforms);
    updateLeaderboard(0);
    controller = createReplayController(scene, recording, {
      onFrame(frameIndex) {
        const frame = recording.frames[frameIndex];
        timing.textContent = frame.simulationTimeSeconds.toFixed(2);
        updateLeaderboard(frameIndex);
      },
      onComplete() {
        status.textContent = "Selection locked";
        result.hidden = false;
        result.classList.add("is-revealed");
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
