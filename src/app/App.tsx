import { useEffect, useReducer, useRef, useState } from "react";

import { createRaceAudio, type RaceAudio } from "../audio/createRaceAudio";
import { assembleCourse } from "../course/assembleCourse";
import type { Course } from "../course/types";
import type { RaceContactEvent, RaceOutcome, RaceRequest, RaceSnapshot } from "../race/liveTypes";
import type { SelectionMode } from "../race/types";
import { createRaceStore, type RaceStore } from "../storage/raceStore";
import { AudioToggle } from "../ui/AudioToggle";
import { BroadcastRace } from "../ui/BroadcastRace";
import { SetupScreen, type SetupRaceInput } from "../ui/SetupScreen";
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

function createBrowserStore(): RaceStore {
  return createRaceStore(window.localStorage);
}

function RaceReady({ request }: { readonly request: RaceRequest }) {
  return (
    <main className="app-shell__placeholder">
      <p>Race session ready</p>
      <strong>Seed {request.seed}</strong>
    </main>
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
  const audioRef = useRef<RaceAudio | null>(null);

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

  function handleStart(input: SetupRaceInput): void {
    const seed = createSeed();
    const request: RaceRequest = Object.freeze({
      seed,
      roster: Object.freeze([...input.roster]),
      selectionMode: input.selectionMode,
    });
    const course = createCourse(seed);
    store.saveRoster(request.roster);
    store.saveSettings({ selectionMode: request.selectionMode });
    dispatch({ kind: "start-race", request, course });
  }

  function handleSnapshot(snapshot: RaceSnapshot): void {
    if (session.kind === "racing") {
      dispatch({ kind: "record-snapshot", seed: session.request.seed, snapshot });
    }
  }

  function handleContact(event: RaceContactEvent): void {
    onRaceContact?.(event);
  }

  function handleOutcome(outcome: RaceOutcome): void {
    onRaceOutcome?.(outcome);
  }

  const content =
    session.kind === "setup" ? (
      <SetupScreen
        onRosterChange={handleRosterChange}
        onSelectionModeChange={handleSelectionModeChange}
        onStart={handleStart}
        roster={session.roster}
        selectionMode={session.selectionMode}
      />
    ) : session.kind === "racing" ? (
      <BroadcastRace
        course={session.course}
        onContact={handleContact}
        onOutcome={handleOutcome}
        onSnapshot={handleSnapshot}
        request={session.request}
        snapshot={session.snapshot}
      />
    ) : (
      <RaceReady request={session.request} />
    );

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <p className="app-shell__brand">Marble Race</p>
        <AudioToggle muted={muted} onMutedChange={handleMutedChange} />
      </header>
      {content}
    </div>
  );
}
