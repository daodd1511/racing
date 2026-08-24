import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";

import { CourseScene } from "../course/render/CourseScene";
import type { Course } from "../course/types";
import { CourseMinimap } from "../race/CourseMinimap";
import { DecisiveCamera } from "../race/DecisiveCamera";
import { LiveRace } from "../race/LiveRace";
import type { RaceContactEvent, RaceOutcome, RaceRequest, RaceSnapshot } from "../race/liveTypes";
import type { CameraMode } from "../race/types";
import { startingGridTransforms } from "../race/startAssignment";
import { createMarbleStyles } from "../render/marbleStyles";
import { formatRaceTime, Standings } from "./Standings";

const INITIAL_CAMERA = Object.freeze({ fov: 42, position: [0, 0, 6] as const });
const COUNTDOWN_STEP_MS = 750;
const TELEMETRY_STEP_SECONDS = 0.1;

function useRaceCountdown(seed: number, frozen: boolean): number {
  const [countdown, setCountdown] = useState(frozen ? -1 : 3);

  useEffect(() => {
    if (frozen) {
      setCountdown(-1);
      return;
    }

    setCountdown(3);
    const timers = [2, 1, 0, -1].map((value, index) =>
      window.setTimeout(() => setCountdown(value), COUNTDOWN_STEP_MS * (index + 1)),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [frozen, seed]);

  return countdown;
}

export interface BroadcastRaceProps {
  readonly course: Course;
  readonly request: RaceRequest;
  readonly snapshot?: RaceSnapshot | null;
  readonly frozen?: boolean;
  readonly cameraMode?: CameraMode;
  readonly onSnapshot?: (snapshot: RaceSnapshot) => void;
  readonly onContact?: (event: RaceContactEvent) => void;
  readonly onOutcome?: (outcome: RaceOutcome) => void;
}

export function BroadcastRace({
  course,
  request,
  snapshot: externalSnapshot,
  frozen = false,
  cameraMode = "broadcast",
  onSnapshot,
  onContact,
  onOutcome,
}: BroadcastRaceProps) {
  const [latestSnapshot, setLatestSnapshot] = useState<RaceSnapshot | null>(null);
  const telemetrySnapshotRef = useRef<RaceSnapshot | null>(null);
  const [marbleStyles] = useState(() => createMarbleStyles(request.roster.length));
  const stagedMarbleTransforms = startingGridTransforms(
    course,
    request.seed,
    request.roster.length,
  );
  const snapshot = externalSnapshot ?? latestSnapshot;
  const countdown = useRaceCountdown(request.seed, frozen);
  const raceStarted = frozen || countdown <= 0;
  const marbleNames = cameraMode === "close-up" && raceStarted ? request.roster : undefined;
  const decisiveMarbleIndex = snapshot?.decisiveMarbleIndex ?? null;
  const trackedName =
    decisiveMarbleIndex === null
      ? "Waiting for release"
      : (request.roster[decisiveMarbleIndex] ?? `Marble ${decisiveMarbleIndex + 1}`);
  const trackingLabel = request.selectionMode === "first" ? "Tracking leader" : "Tracking trailer";
  const courseContent = frozen ? (
    <>
      <CourseScene
        course={course}
        marbleNames={marbleNames}
        marbleStyles={marbleStyles}
        snapshot={snapshot}
      />
      <DecisiveCamera
        course={course}
        mode={cameraMode}
        snapshot={snapshot}
        startingGridSize={request.roster.length}
      />
    </>
  ) : raceStarted ? (
    <LiveRace
      course={course}
      onContact={handleContact}
      onOutcome={handleOutcome}
      onSnapshot={handleSnapshot}
      request={request}
    >
      {({ snapshot: liveSnapshot }) => (
        <>
          <CourseScene
            course={course}
            marbleNames={marbleNames}
            marbleStyles={marbleStyles}
            snapshot={liveSnapshot}
          />
          <DecisiveCamera
            course={course}
            mode={cameraMode}
            snapshot={liveSnapshot}
            startingGridSize={request.roster.length}
          />
        </>
      )}
    </LiveRace>
  ) : (
    <>
      <CourseScene
        course={course}
        marbleStyles={marbleStyles}
        snapshot={null}
        stagedMarbleTransforms={stagedMarbleTransforms}
      />
      <DecisiveCamera
        course={course}
        mode={cameraMode}
        snapshot={null}
        startingGridSize={request.roster.length}
      />
    </>
  );

  function handleSnapshot(nextSnapshot: RaceSnapshot): void {
    onSnapshot?.(nextSnapshot);
    const previous = telemetrySnapshotRef.current;
    if (
      previous === null ||
      nextSnapshot.elapsedSeconds < previous.elapsedSeconds ||
      nextSnapshot.elapsedSeconds - previous.elapsedSeconds >= TELEMETRY_STEP_SECONDS
    ) {
      telemetrySnapshotRef.current = nextSnapshot;
      setLatestSnapshot(nextSnapshot);
    }
  }

  function handleContact(event: RaceContactEvent): void {
    onContact?.(event);
  }

  function handleOutcome(outcome: RaceOutcome): void {
    onOutcome?.(outcome);
  }

  return (
    <main className="broadcast-race">
      <header aria-label="Race telemetry" className="broadcast-race__telemetry">
        <p className="broadcast-race__live" data-state={countdown >= 0 ? "grid" : "live"}>
          <span>Race status</span>
          <strong>{countdown >= 0 ? "Starting grid" : "Live"}</strong>
        </p>
        <p>
          <span>Mode</span>
          <strong>{request.selectionMode === "first" ? "First finisher" : "Last finisher"}</strong>
        </p>
        <p>
          <span>Simulation time</span>
          <strong>{formatRaceTime(snapshot?.elapsedSeconds ?? 0)}</strong>
        </p>
        <p>
          <span>Seed</span>
          <strong>{request.seed}</strong>
        </p>
      </header>
      <section aria-label="Live Course" className="broadcast-race__course">
        <Canvas
          camera={INITIAL_CAMERA}
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          shadows="percentage"
        >
          <color attach="background" args={["#17304b"]} />
          <ambientLight intensity={1.05} />
          <directionalLight castShadow intensity={2.2} position={[4, 8, 8]} />
          {courseContent}
        </Canvas>
        <div className="broadcast-race__tracking" aria-live="polite">
          <span>{trackingLabel}</span>
          <strong>{trackedName}</strong>
        </div>
        {countdown >= 0 ? (
          <div aria-live="assertive" className="broadcast-race__countdown" role="status">
            <span>Marbles ready</span>
            <strong>{countdown === 0 ? "GO!" : countdown}</strong>
          </div>
        ) : null}
      </section>
      <aside aria-label="Broadcast information" className="broadcast-race__chrome">
        <CourseMinimap
          board={course.board}
          course={course}
          marbleStyles={marbleStyles}
          roster={request.roster}
          snapshot={snapshot}
        />
        <Standings
          course={course}
          marbleStyles={marbleStyles}
          roster={request.roster}
          selectionMode={request.selectionMode}
          snapshot={snapshot}
        />
      </aside>
    </main>
  );
}
