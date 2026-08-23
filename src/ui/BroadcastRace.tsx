import { Canvas } from "@react-three/fiber";
import { useState } from "react";

import { CourseScene } from "../course/render/CourseScene";
import type { Course } from "../course/types";
import { CourseMinimap } from "../race/CourseMinimap";
import { DecisiveCamera } from "../race/DecisiveCamera";
import { LiveRace } from "../race/LiveRace";
import type { RaceContactEvent, RaceOutcome, RaceRequest, RaceSnapshot } from "../race/liveTypes";
import { createMarbleStyles } from "../render/marbleStyles";
import { formatRaceTime, Standings } from "./Standings";

const INITIAL_CAMERA = Object.freeze({ fov: 42, position: [0, 0, 6] as const });

export interface BroadcastRaceProps {
  readonly course: Course;
  readonly request: RaceRequest;
  readonly snapshot?: RaceSnapshot | null;
  readonly onSnapshot?: (snapshot: RaceSnapshot) => void;
  readonly onContact?: (event: RaceContactEvent) => void;
  readonly onOutcome?: (outcome: RaceOutcome) => void;
}

export function BroadcastRace({
  course,
  request,
  snapshot: externalSnapshot,
  onSnapshot,
  onContact,
  onOutcome,
}: BroadcastRaceProps) {
  const [latestSnapshot, setLatestSnapshot] = useState<RaceSnapshot | null>(null);
  const [marbleStyles] = useState(() => createMarbleStyles(request.roster.length));
  const snapshot = externalSnapshot ?? latestSnapshot;

  function handleSnapshot(nextSnapshot: RaceSnapshot): void {
    setLatestSnapshot(nextSnapshot);
    onSnapshot?.(nextSnapshot);
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
        <Canvas camera={INITIAL_CAMERA} shadows>
          <color attach="background" args={["#12171c"]} />
          <ambientLight intensity={0.8} />
          <directionalLight castShadow intensity={1.8} position={[4, 8, 6]} />
          <LiveRace
            course={course}
            onContact={handleContact}
            onOutcome={handleOutcome}
            onSnapshot={handleSnapshot}
            request={request}
          >
            {({ snapshot: liveSnapshot }) => (
              <>
                <CourseScene course={course} marbleStyles={marbleStyles} snapshot={liveSnapshot} />
                <DecisiveCamera board={course.board} snapshot={liveSnapshot} />
              </>
            )}
          </LiveRace>
        </Canvas>
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
          snapshot={snapshot}
        />
      </aside>
    </main>
  );
}
