import { useState, type ReactNode } from "react";

import type { Course } from "../course/types";
import { CoursePhysics } from "./CoursePhysics";
import type { RaceContactEvent, RaceOutcome, RaceRequest, RaceSnapshot } from "./liveTypes";

export interface LiveRaceState {
  readonly snapshot: RaceSnapshot | null;
  readonly outcome: RaceOutcome | null;
}

export interface LiveRaceProps {
  readonly course: Course;
  readonly request: RaceRequest;
  readonly onContact?: (event: RaceContactEvent) => void;
  readonly onOutcome?: (outcome: RaceOutcome) => void;
  readonly children?: (state: LiveRaceState) => ReactNode;
}

const EMPTY_RACE_STATE: LiveRaceState = Object.freeze({ snapshot: null, outcome: null });

/** R3F child that owns only live Course progress. Persistence, audio, and
 * result UI remain consumers through callbacks. */
export function LiveRace({ course, request, onContact, onOutcome, children }: LiveRaceProps) {
  const [state, setState] = useState(EMPTY_RACE_STATE);

  function handleSnapshot(snapshot: RaceSnapshot): void {
    setState((previous) => Object.freeze({ ...previous, snapshot }));
  }

  function handleContact(event: RaceContactEvent): void {
    onContact?.(event);
  }

  function handleOutcome(outcome: RaceOutcome): void {
    setState((previous) => Object.freeze({ ...previous, outcome }));
    onOutcome?.(outcome);
  }

  return (
    <>
      <CoursePhysics
        key={`${request.seed}:${request.selectionMode}:${request.roster.join("\u0000")}`}
        course={course}
        request={request}
        onContact={handleContact}
        onOutcome={handleOutcome}
        onSnapshot={handleSnapshot}
      />
      {children?.(state)}
    </>
  );
}
