import { Canvas } from "@react-three/fiber";
import { StrictMode, useMemo, useState, type ReactNode, type ChangeEvent } from "react";
import { createRoot } from "react-dom/client";

import { assembleCourse } from "../course/assembleCourse";
import { CourseScene } from "../course/render/CourseScene";
import { CourseMinimap } from "../race/CourseMinimap";
import { DecisiveCamera } from "../race/DecisiveCamera";
import { startingGridTransforms } from "../race/startAssignment";
import { LiveRace } from "../race/LiveRace";
import type { RaceOutcome, RaceSnapshot } from "../race/liveTypes";
import { createMarbleStyles } from "../render/marbleStyles";
import type { CameraMode, SelectionMode } from "../race/types";
import "../styles/course.css";

export const FIXED_ROSTER = Object.freeze([
  "Avery",
  "Blake",
  "Casey",
  "Devon",
  "Emery",
  "Finley",
  "Gray",
  "Harper",
  "Indigo",
  "Jules",
  "Kai",
  "Logan",
  "Morgan",
  "Noel",
  "Oakley",
]);

function validSeed(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function raceStatus(snapshot: RaceSnapshot | null, outcome: RaceOutcome | null): string {
  if (outcome?.kind === "completed") {
    return `Completed in ${outcome.elapsedSeconds.toFixed(2)} seconds`;
  }
  if (outcome?.kind === "watchdog") {
    return `Watchdog at ${outcome.elapsedSeconds.toFixed(2)} seconds; ${outcome.unfinishedMarbleIndices.length} unfinished`;
  }
  return snapshot ? `Racing — ${snapshot.elapsedSeconds.toFixed(2)} seconds` : "Ready to race";
}

export interface CourseControlsProps {
  readonly children?: ReactNode;
  readonly seed: number;
  readonly selectionMode: SelectionMode;
  readonly onSeedChange: (seed: number) => void;
  readonly onSelectionModeChange: (selectionMode: SelectionMode) => void;
  readonly onStart: () => void;
}

export function CourseControls({
  children,
  seed,
  selectionMode,
  onSeedChange,
  onSelectionModeChange,
  onStart,
}: CourseControlsProps) {
  function handleSeedChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = Number(event.target.value);
    if (validSeed(next)) onSeedChange(next);
  }

  function handleSelectionModeChange(event: ChangeEvent<HTMLSelectElement>): void {
    onSelectionModeChange(event.target.value as SelectionMode);
  }

  return (
    <section aria-label="Course race controls" className="course-preview__controls">
      <label>
        Seed
        <input min="0" onChange={handleSeedChange} step="1" type="number" value={seed} />
      </label>
      <label>
        Selection mode
        <select onChange={handleSelectionModeChange} value={selectionMode}>
          <option value="first">First finisher</option>
          <option value="last">Last finisher</option>
        </select>
      </label>
      {children}
      <button onClick={onStart} type="button">
        Start or restart
      </button>
    </section>
  );
}

export function CoursePreview() {
  const [cameraMode, setCameraMode] = useState<CameraMode>("close-up");
  const [pendingSeed, setPendingSeed] = useState(7);
  const [pendingSelectionMode, setPendingSelectionMode] = useState<SelectionMode>("last");
  const [activeSeed, setActiveSeed] = useState(7);
  const [activeSelectionMode, setActiveSelectionMode] = useState<SelectionMode>("last");
  const [runNumber, setRunNumber] = useState(0);
  const [snapshot, setSnapshot] = useState<RaceSnapshot | null>(null);
  const [outcome, setOutcome] = useState<RaceOutcome | null>(null);
  const course = useMemo(() => assembleCourse(activeSeed), [activeSeed]);
  const request = useMemo(
    () => ({ seed: activeSeed, roster: FIXED_ROSTER, selectionMode: activeSelectionMode }),
    [activeSeed, activeSelectionMode],
  );
  const marbleStyles = useMemo(() => createMarbleStyles(FIXED_ROSTER.length), []);

  const stagedMarbleTransforms = useMemo(
    () => startingGridTransforms(course, request.seed, request.roster.length),
    [course, request],
  );
  function handleSnapshot(next: RaceSnapshot): void {
    setSnapshot((previous) =>
      previous === null ||
      next.elapsedSeconds < previous.elapsedSeconds ||
      next.elapsedSeconds - previous.elapsedSeconds >= 0.1
        ? next
        : previous,
    );
  }

  function startRace(): void {
    setActiveSeed(pendingSeed);
    setActiveSelectionMode(pendingSelectionMode);
    setSnapshot(null);
    setOutcome(null);
    setRunNumber((previous) => previous + 1);
  }

  return (
    <main className="course-preview">
      <header className="course-preview__header">
        <div>
          <p className="course-preview__eyebrow">Development harness</p>
          <h1>Course review</h1>
        </div>
        <p aria-live="polite" className="course-preview__status" role="status">
          {raceStatus(snapshot, outcome)}
        </p>
      </header>
      <CourseControls
        onSeedChange={setPendingSeed}
        onSelectionModeChange={setPendingSelectionMode}
        onStart={startRace}
        seed={pendingSeed}
        selectionMode={pendingSelectionMode}
      >
        <label>
          Camera
          <select
            value={cameraMode}
            onChange={(event) => setCameraMode(event.target.value as CameraMode)}
          >
            <option value="close-up">Close up</option>
            <option value="broadcast">Broadcast</option>
          </select>
        </label>
      </CourseControls>
      <section aria-label="Live Course" className="course-preview__stage">
        <Canvas camera={{ fov: 42, position: [0, 0, 6] }} shadows="percentage">
          <color attach="background" args={["#12171c"]} />
          <ambientLight intensity={0.8} />
          <directionalLight castShadow intensity={1.8} position={[4, 8, 6]} />
          <LiveRace
            key={runNumber}
            course={course}
            request={request}
            onOutcome={setOutcome}
            onSnapshot={handleSnapshot}
          >
            {({ frameRef }) => (
              <>
                <CourseScene
                  course={course}
                  marbleStyles={marbleStyles}
                  frameRef={frameRef}
                  stagedMarbleTransforms={stagedMarbleTransforms}
                />
                <DecisiveCamera course={course} frameRef={frameRef} mode={cameraMode} />
              </>
            )}
          </LiveRace>
        </Canvas>
      </section>
      <section aria-label="Course overview" className="course-preview__overview">
        <CourseMinimap
          board={course.board}
          course={course}
          marbleStyles={marbleStyles}
          roster={FIXED_ROSTER}
          snapshot={snapshot}
        />
        <ol aria-label="Fixed roster" className="course-preview__roster">
          {FIXED_ROSTER.map((name, marbleIndex) => (
            <li key={name}>
              <span aria-hidden="true">{marbleIndex + 1}</span>
              {name}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

const root = document.querySelector<HTMLDivElement>("#app");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <CoursePreview />
    </StrictMode>,
  );
}
