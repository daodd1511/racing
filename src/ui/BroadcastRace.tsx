import { Canvas } from "@react-three/fiber";
import { useState } from "react";

import { CourseScene } from "../course/render/CourseScene";
import type { Course } from "../course/types";
import { CourseMinimap } from "../race/CourseMinimap";
import { DecisiveCamera } from "../race/DecisiveCamera";
import { LiveRace } from "../race/LiveRace";
import type { RaceContactEvent, RaceOutcome, RaceRequest, RaceSnapshot } from "../race/liveTypes";
import { createMarbleStyles } from "../render/marbleStyles";
import { Standings } from "./Standings";

const INITIAL_CAMERA = Object.freeze({ fov: 42, position: [0, 0, 6] as const });

export interface BroadcastRaceProps {
  readonly course: Course;
  readonly request: RaceRequest;
  readonly onSnapshot?: (snapshot: RaceSnapshot) => void;
  readonly onContact?: (event: RaceContactEvent) => void;
  readonly onOutcome?: (outcome: RaceOutcome) => void;
}

export function BroadcastRace({ course, request, onSnapshot, onContact, onOutcome }: BroadcastRaceProps) {
  const [snapshot, setSnapshot] = useState<RaceSnapshot | null>(null);
  const marbleStyles = createMarbleStyles(request.roster.length);

  function handleSnapshot(nextSnapshot: RaceSnapshot): void {
    setSnapshot(nextSnapshot);
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
                <CourseScene
                  course={course}
                  marbleStyles={marbleStyles}
                  snapshot={liveSnapshot}
                />
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
        <Standings course={course} marbleStyles={marbleStyles} roster={request.roster} snapshot={snapshot} />
      </aside>
    </main>
  );
}
