import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";

import { createRaceAudio, type RaceAudio } from "../audio/createRaceAudio";
import { selectRaceMusicTrack } from "../audio/raceMusic";
import { assembleCourse } from "../course/assembleCourse";
import type { Course } from "../course/types";
import type { RaceContactEvent, RaceOutcome, RaceRequest, RaceSnapshot } from "../race/liveTypes";
import type { CameraMode, CommittedRaceRecord, SelectionMode } from "../race/types";
import { createRaceStore, type RaceStore } from "../storage/raceStore";
import { AudioToggle } from "../ui/AudioToggle";
import { BroadcastRace } from "../ui/BroadcastRace";
import { ResultPanel } from "../ui/ResultPanel";
import { SetupScreen, type SetupRaceInput } from "../ui/SetupScreen";
import { WatchdogPanel } from "../ui/WatchdogPanel";
import "../styles/app.css";
import { createRaceSeed, type RaceSeedSource } from "./createRaceSeed";
import { createInitialSession, reduceSession } from "./session";

export interface AppProps {
  readonly store?: RaceStore;
  readonly createAudio?: () => RaceAudio;
  readonly createSeed?: RaceSeedSource;
  readonly createCourse?: (seed: number) => Course;
  readonly onRaceContact?: (event: RaceContactEvent) => void;
  readonly onRaceOutcome?: (outcome: RaceOutcome) => void;
}

const RESULT_REVEAL_DELAY_MS = 800;

function createBrowserStore(): RaceStore {
  return createRaceStore(window.localStorage);
}

function selectedName(request: RaceRequest, selectedMarbleIndex: number): string {
  return request.roster[selectedMarbleIndex] ?? `Marble ${selectedMarbleIndex + 1}`;
}

function createCommittedRaceRecord({
  request,
  outcome,
}: {
  readonly request: RaceRequest;
  readonly outcome: Extract<RaceOutcome, { readonly kind: "completed" }>;
}): CommittedRaceRecord {
  return Object.freeze({
    seed: request.seed,
    committedAtEpochMs: Date.now(),
    roster: Object.freeze([...request.roster]),
    selectionMode: request.selectionMode,
    selectedMarbleIndex: outcome.selectedMarbleIndex,
    selectedName: selectedName(request, outcome.selectedMarbleIndex),
    finishOrder: Object.freeze([...outcome.finishOrder]),
    finalRanking: Object.freeze([...outcome.finalRanking]),
  });
}

function FrozenRace({
  course,
  request,
  snapshot,
  cameraMode,
  children,
}: {
  readonly course: Course;
  readonly request: RaceRequest;
  readonly snapshot: RaceSnapshot;
  readonly cameraMode: CameraMode;
  readonly children: ReactNode;
}) {
  return (
    <div className="terminal-race">
      <BroadcastRace
        cameraMode={cameraMode}
        course={course}
        frozen
        request={request}
        snapshot={snapshot}
      />
      {children === null ? null : <div className="terminal-race__overlay">{children}</div>}
    </div>
  );
}

export function App({
  store: suppliedStore,
  createAudio = createRaceAudio,
  createSeed = createRaceSeed,
  createCourse = assembleCourse,
  onRaceContact,
  onRaceOutcome,
}: AppProps) {
  const [store] = useState(() => suppliedStore ?? createBrowserStore());
  const [session, dispatch] = useReducer(reduceSession, store, (activeStore) =>
    createInitialSession(activeStore.load()),
  );
  const [muted, setMuted] = useState(true);
  const [cameraMode, setCameraMode] = useState<CameraMode>("broadcast");
  const audioRef = useRef<RaceAudio | null>(null);
  const snapshotRef = useRef<RaceSnapshot | null>(null);
  const terminalSeedRef = useRef<number | null>(null);

  useEffect(() => {
    const audio = createAudio();
    audioRef.current = audio;
    setMuted(audio.isMuted());

    return () => {
      audio.dispose();
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [createAudio]);

  useEffect(() => {
    if (session.kind !== "result" || session.revealVisible) {
      return;
    }

    const timer = window.setTimeout(() => {
      dispatch({ kind: "show-result", seed: session.request.seed });
    }, RESULT_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [session]);

  function resetRaceReferences(): void {
    snapshotRef.current = null;
    terminalSeedRef.current = null;
  }

  function handleMutedChange(nextMuted: boolean): void {
    setMuted(nextMuted);
    void audioRef.current?.setMuted(nextMuted);
  }

  function handleRosterChange(roster: readonly string[]): void {
    dispatch({ kind: "set-roster", roster });
    if (roster.length > 0) {
      store.saveRoster(roster);
    }
  }

  function handleSelectionModeChange(selectionMode: SelectionMode): void {
    dispatch({ kind: "set-selection-mode", selectionMode });
    store.saveSettings({ selectionMode });
  }

  function handleCameraModeChange(nextCameraMode: CameraMode): void {
    setCameraMode(nextCameraMode);
  }

  function handleStart(input: SetupRaceInput): void {
    setCameraMode(input.cameraMode);
    const seed = createSeed();
    const request: RaceRequest = Object.freeze({
      seed,
      roster: Object.freeze([...input.roster]),
      selectionMode: input.selectionMode,
    });
    const course = createCourse(seed);
    store.saveRoster(request.roster);
    store.saveSettings({ selectionMode: request.selectionMode });
    resetRaceReferences();
    audioRef.current?.startMusic(selectRaceMusicTrack(seed));
    dispatch({ kind: "start-race", request, course });
  }

  function handleSnapshot(snapshot: RaceSnapshot): void {
    if (session.kind === "racing") {
      snapshotRef.current = snapshot;
    }
  }

  function handleContact(event: RaceContactEvent): void {
    if (session.kind !== "racing") {
      return;
    }
    onRaceContact?.(event);
  }

  function handleOutcome(outcome: RaceOutcome): void {
    const snapshot = snapshotRef.current;
    if (
      session.kind !== "racing" ||
      outcome.seed !== session.request.seed ||
      terminalSeedRef.current === outcome.seed ||
      snapshot === null
    ) {
      return;
    }

    terminalSeedRef.current = outcome.seed;
    onRaceOutcome?.(outcome);
    audioRef.current?.stopMusic();
    if (outcome.kind === "watchdog") {
      dispatch({ kind: "fail-race", outcome, snapshot });
      return;
    }

    const record = createCommittedRaceRecord({ request: session.request, outcome });
    store.appendCommittedRace(record);
    dispatch({ kind: "complete-race", outcome, snapshot, record });
  }

  function handleNewRace(): void {
    resetRaceReferences();
    dispatch({ kind: "return-to-setup" });
  }

  function handleRetryRace(): void {
    if (session.kind !== "failed") {
      return;
    }

    const seed = createSeed();
    const request: RaceRequest = Object.freeze({
      seed,
      roster: Object.freeze([...session.request.roster]),
      selectionMode: session.request.selectionMode,
    });
    const course = createCourse(seed);
    resetRaceReferences();
    audioRef.current?.startMusic(selectRaceMusicTrack(seed));
    dispatch({ kind: "retry-race", request, course });
  }

  function handleBackToSetup(): void {
    resetRaceReferences();
    dispatch({ kind: "return-to-setup" });
  }

  let content: ReactNode;
  if (session.kind === "setup") {
    content = (
      <SetupScreen
        cameraMode={cameraMode}
        onCameraModeChange={handleCameraModeChange}
        onRosterChange={handleRosterChange}
        onSelectionModeChange={handleSelectionModeChange}
        onStart={handleStart}
        roster={session.roster}
        selectionMode={session.selectionMode}
      />
    );
  } else if (session.kind === "racing") {
    content = (
      <BroadcastRace
        cameraMode={cameraMode}
        course={session.course}
        onContact={onRaceContact === undefined ? undefined : handleContact}
        onOutcome={handleOutcome}
        onSnapshot={handleSnapshot}
        request={session.request}
      />
    );
  } else if (session.kind === "result") {
    content = (
      <FrozenRace
        cameraMode={cameraMode}
        course={session.course}
        request={session.request}
        snapshot={session.snapshot}
      >
        {session.revealVisible ? (
          <ResultPanel
            finalRanking={session.record.finalRanking}
            finishOrder={session.record.finishOrder}
            onNewRace={handleNewRace}
            request={session.request}
            selectedMarbleIndex={session.record.selectedMarbleIndex}
            snapshot={session.snapshot}
          />
        ) : null}
      </FrozenRace>
    );
  } else {
    content = (
      <FrozenRace
        cameraMode={cameraMode}
        course={session.course}
        request={session.request}
        snapshot={session.snapshot}
      >
        <WatchdogPanel
          onBackToSetup={handleBackToSetup}
          onRetryRace={handleRetryRace}
          outcome={session.outcome}
          request={session.request}
        />
      </FrozenRace>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <p className="app-shell__brand">Marble Mayhem</p>
        <AudioToggle muted={muted} onMutedChange={handleMutedChange} />
      </header>
      {content}
    </div>
  );
}
