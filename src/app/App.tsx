import { useEffect, useReducer, useRef, useState } from "react";

import { createRaceAudio, type RaceAudio } from "../audio/createRaceAudio";
import { assembleCourse } from "../course/assembleCourse";
import type { Course } from "../course/types";
import type { RaceRequest } from "../race/liveTypes";
import type { SelectionMode } from "../race/types";
import { createRaceStore, type RaceStore } from "../storage/raceStore";
import { AudioToggle } from "../ui/AudioToggle";
import { SetupScreen, type SetupRaceInput } from "../ui/SetupScreen";
import "../styles/app.css";
import { createRaceSeed, type RaceSeedSource } from "./createRaceSeed";
import { createInitialSession, reduceSession } from "./session";

export interface AppProps {
  readonly store?: RaceStore;
  readonly createAudio?: () => RaceAudio;
  readonly createSeed?: RaceSeedSource;
  readonly createCourse?: (seed: number) => Course;
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

  const content =
    session.kind === "setup" ? (
      <SetupScreen
        onRosterChange={handleRosterChange}
        onSelectionModeChange={handleSelectionModeChange}
        onStart={handleStart}
        roster={session.roster}
        selectionMode={session.selectionMode}
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
