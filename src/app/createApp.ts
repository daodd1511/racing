import { DEFAULT_RACE_CONFIG } from "../race/config";
import type { CommittedRaceRecord, RaceRecording } from "../race/types";
import { initializeRapier } from "../simulation/initializeRapier";
import { simulateWithRetry } from "../simulation/simulateWithRetry";
import { createRaceStore, type RaceStore } from "../storage/raceStore";
import { createRaceView, type RaceView } from "../ui/createRaceView";
import { createResultDialog, type ResultDialog } from "../ui/createResultDialog";
import { createSetupView, type SetupView } from "../ui/createSetupView";

export interface AppController {
  dispose(): void;
}

function createCommittedRecord(recording: RaceRecording): CommittedRaceRecord {
  const selectedMarbleIndex = recording.selectedMarbleIndex;

  return Object.freeze({
    seed: recording.seed,
    committedAtEpochMs: Date.now(),
    roster: Object.freeze([...recording.roster]),
    selectionMode: recording.selectionMode,
    selectedMarbleIndex,
    selectedName: recording.roster[selectedMarbleIndex],
    finishOrder: Object.freeze([...recording.finishOrder]),
    finalRanking: Object.freeze([...recording.finalRanking]),
  });
}

function renderLoading(root: HTMLElement): void {
  const loading = document.createElement("main");
  loading.className = "app-loading";
  loading.textContent = "Warming up the marble machine…";
  root.replaceChildren(loading);
}

function renderFailure(root: HTMLElement): void {
  const failure = document.createElement("main");
  failure.className = "app-loading";
  failure.textContent = "The marble machine could not start. Reload and try again.";
  root.replaceChildren(failure);
}

export function createApp(root: HTMLElement): AppController {
  const store: RaceStore = createRaceStore(window.localStorage);
  let setupView: SetupView | undefined;
  let raceView: RaceView | undefined;
  let resultDialog: ResultDialog | undefined;
  let disposed = false;

  function disposeActiveView(): void {
    resultDialog?.dispose();
    resultDialog = undefined;
    raceView?.dispose();
    raceView = undefined;
    setupView?.dispose();
    setupView = undefined;
  }

  function renderSetup(): void {
    if (disposed) {
      return;
    }

    disposeActiveView();
    setupView = createSetupView(root, store.load());
    setupView.onRosterChange((roster) => {
      store.saveRoster(roster);
    });
    setupView.onSettingsChange((selectionMode) => {
      store.saveSettings({ selectionMode });
    });
    setupView.onStart(({ roster, selectionMode }) => {
      store.saveRoster(roster);
      store.saveSettings({ selectionMode });
      setupView?.dispose();
      setupView = undefined;
      const recording = simulateWithRetry(roster, selectionMode);
      raceView = createRaceView(root, recording);
      raceView.onComplete(() => {
        if (disposed || raceView === undefined) {
          return;
        }

        const committedRecord = createCommittedRecord(recording);
        store.appendCommittedRace(committedRecord);
        const label =
          committedRecord.selectionMode === "first"
            ? DEFAULT_RACE_CONFIG.resultLabel
            : "Last finisher";
        resultDialog = createResultDialog(root, committedRecord, label);
        resultDialog.onNewRace(() => renderSetup());
      });
      raceView.start();
    });
  }

  renderLoading(root);
  void initializeRapier()
    .then(() => renderSetup())
    .catch(() => {
      if (!disposed) {
        renderFailure(root);
      }
    });

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      disposeActiveView();
      root.replaceChildren();
    },
  };
}
