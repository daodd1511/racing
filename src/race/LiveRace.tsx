import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { Course } from "../course/types";
import { CoursePhysics } from "./CoursePhysics";
import type {
  RaceFrameRef,
  RaceContactEvent,
  RaceOutcome,
  RaceRequest,
  RaceSnapshot,
} from "./liveTypes";

export interface LiveRaceState {
  readonly frameRef: RaceFrameRef;
  readonly outcome: RaceOutcome | null;
}

export interface LiveRaceProps {
  readonly course: Course;
  readonly request: RaceRequest;
  readonly onSnapshot?: (snapshot: RaceSnapshot) => void;
  readonly onContact?: (event: RaceContactEvent) => void;
  readonly onOutcome?: (outcome: RaceOutcome) => void;
  readonly children?: (state: LiveRaceState) => ReactNode;
}

/** R3F child that owns only live Course progress. Persistence, audio, and
 * result UI remain consumers through callbacks. */
export function LiveRace({
  course,
  request,
  onSnapshot,
  onContact,
  onOutcome,
  children,
}: LiveRaceProps) {
  const frameRef = useMemo<RaceFrameRef>(() => ({ current: null }), [course, request]);
  const [completed, setCompleted] = useState<{
    frameRef: RaceFrameRef;
    outcome: RaceOutcome;
  } | null>(null);
  const outcome = completed?.frameRef === frameRef ? completed.outcome : null;
  useEffect(
    () => () => {
      frameRef.current = null;
    },
    [frameRef],
  );

  function handleSnapshot(snapshot: RaceSnapshot): void {
    frameRef.current = snapshot;
    onSnapshot?.(snapshot);
  }

  function handleOutcome(outcome: RaceOutcome): void {
    setCompleted({ frameRef, outcome });
    onOutcome?.(outcome);
  }

  return (
    <>
      <CoursePhysics
        key={`${request.seed}:${request.selectionMode}:${request.roster.join("\u0000")}`}
        course={course}
        request={request}
        onContact={onContact}
        onOutcome={handleOutcome}
        onSnapshot={handleSnapshot}
      />
      {children?.({ frameRef, outcome })}
    </>
  );
}
