import RAPIER from "@dimforge/rapier3d-compat";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";

import type { Course } from "../course/types";
import { CourseRaceRuntime } from "./CourseRaceRuntime";
import { INITIAL_FIXED_STEP_BACKLOG, advanceFixedStepBacklog } from "./fixedStepBacklog";
import type { RaceContactEvent, RaceOutcome, RaceRequest, RaceSnapshot } from "./liveTypes";

const MAXIMUM_STEPS_PER_FRAME = 8;
export const LIVE_RACE_PLAYBACK_RATE = 0.72;
let rapierReady: Promise<void> | null = null;

function initializeRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

export interface CoursePhysicsProps {
  readonly course: Course;
  readonly request: RaceRequest;
  readonly onSnapshot: (snapshot: RaceSnapshot) => void;
  readonly onContact: (event: RaceContactEvent) => void;
  readonly onOutcome: (outcome: RaceOutcome) => void;
}

interface CallbackRefs {
  readonly onSnapshot: (snapshot: RaceSnapshot) => void;
  readonly onContact: (event: RaceContactEvent) => void;
  readonly onOutcome: (outcome: RaceOutcome) => void;
}

/** Advances the raw Course world from R3F's render loop while preserving
 * fixed-step backlog semantics. It renders nothing; `CourseScene` consumes
 * the immutable snapshots it emits. */
export function CoursePhysics({
  course,
  request,
  onSnapshot,
  onContact,
  onOutcome,
}: CoursePhysicsProps) {
  const runtimeRef = useRef<CourseRaceRuntime | null>(null);
  const backlogRef = useRef(INITIAL_FIXED_STEP_BACKLOG);
  const emittedOutcomeRef = useRef<RaceOutcome | null>(null);
  const callbacksRef = useRef<CallbackRefs>({ onSnapshot, onContact, onOutcome });
  callbacksRef.current = { onSnapshot, onContact, onOutcome };

  useEffect(() => {
    let active = true;
    void initializeRapier().then(() => {
      if (!active) return;
      const runtime = new CourseRaceRuntime(course, request);
      runtimeRef.current = runtime;
      backlogRef.current = INITIAL_FIXED_STEP_BACKLOG;
      emittedOutcomeRef.current = null;
      callbacksRef.current.onSnapshot(runtime.currentSnapshot);
    });
    return () => {
      active = false;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [course, request]);

  useFrame((_, deltaSeconds) => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.outcome) return;

    const advance = advanceFixedStepBacklog(
      backlogRef.current,
      deltaSeconds * LIVE_RACE_PLAYBACK_RATE,
      MAXIMUM_STEPS_PER_FRAME,
    );
    backlogRef.current = advance.backlog;
    let latestSnapshot: RaceSnapshot | null = null;
    let terminalOutcome: RaceOutcome | null = null;
    for (const elapsedSeconds of advance.stepTimes) {
      const step = runtime.step(elapsedSeconds);
      latestSnapshot = step.snapshot;
      step.contactEvents.forEach(callbacksRef.current.onContact);
      if (step.outcome && emittedOutcomeRef.current === null) {
        emittedOutcomeRef.current = step.outcome;
        terminalOutcome = step.outcome;
        break;
      }
    }
    if (latestSnapshot) callbacksRef.current.onSnapshot(latestSnapshot);
    if (terminalOutcome) callbacksRef.current.onOutcome(terminalOutcome);
  });

  return null;
}
