import type { Course } from "../course/types";
import type { RaceOutcome, RaceRequest, RaceSnapshot } from "../race/liveTypes";
import type { CommittedRaceRecord, PickerStateV1, SelectionMode } from "../race/types";

export interface SetupSession {
  readonly kind: "setup";
  readonly roster: readonly string[];
  readonly selectionMode: SelectionMode;
}

export interface RacingSession {
  readonly kind: "racing";
  readonly request: RaceRequest;
  readonly course: Course;
  readonly snapshot: RaceSnapshot | null;
}

export interface ResultSession {
  readonly kind: "result";
  readonly request: RaceRequest;
  readonly course: Course;
  readonly snapshot: RaceSnapshot;
  readonly record: CommittedRaceRecord;
  readonly revealVisible: boolean;
}

export interface FailedSession {
  readonly kind: "failed";
  readonly request: RaceRequest;
  readonly course: Course;
  readonly snapshot: RaceSnapshot;
  readonly outcome: Extract<RaceOutcome, { readonly kind: "watchdog" }>;
}

export type AppSession = SetupSession | RacingSession | ResultSession | FailedSession;

export type AppAction =
  | { readonly kind: "set-roster"; readonly roster: readonly string[] }
  | { readonly kind: "set-selection-mode"; readonly selectionMode: SelectionMode }
  | { readonly kind: "start-race"; readonly request: RaceRequest; readonly course: Course }
  | { readonly kind: "record-snapshot"; readonly seed: number; readonly snapshot: RaceSnapshot }
  | {
      readonly kind: "complete-race";
      readonly outcome: Extract<RaceOutcome, { readonly kind: "completed" }>;
      readonly snapshot: RaceSnapshot;
      readonly record: CommittedRaceRecord;
    }
  | {
      readonly kind: "fail-race";
      readonly outcome: Extract<RaceOutcome, { readonly kind: "watchdog" }>;
      readonly snapshot: RaceSnapshot;
    }
  | { readonly kind: "show-result"; readonly seed: number }
  | { readonly kind: "retry-race"; readonly request: RaceRequest; readonly course: Course }
  | { readonly kind: "return-to-setup" };

function immutableRoster(roster: readonly string[]): readonly string[] {
  return Object.freeze([...roster]);
}

function immutableRequest(request: RaceRequest): RaceRequest {
  return Object.freeze({ ...request, roster: immutableRoster(request.roster) });
}

function immutableRecord(record: CommittedRaceRecord): CommittedRaceRecord {
  return Object.freeze({
    ...record,
    roster: immutableRoster(record.roster),
    finishOrder: Object.freeze([...record.finishOrder]),
    finalRanking: Object.freeze([...record.finalRanking]),
  });
}

function setupSession(roster: readonly string[], selectionMode: SelectionMode): SetupSession {
  return Object.freeze({ kind: "setup", roster: immutableRoster(roster), selectionMode });
}

function racingSession(request: RaceRequest, course: Course): RacingSession {
  return Object.freeze({
    kind: "racing",
    request: immutableRequest(request),
    course,
    snapshot: null,
  });
}

function sameRace(session: RacingSession, seed: number): boolean {
  return session.request.seed === seed;
}

function canRetry(session: FailedSession, request: RaceRequest): boolean {
  return (
    request.seed !== session.request.seed &&
    request.selectionMode === session.request.selectionMode &&
    request.roster.length === session.request.roster.length &&
    request.roster.every((name, index) => name === session.request.roster[index])
  );
}

export function createInitialSession(state: PickerStateV1): AppSession {
  return setupSession(state.roster, state.settings.selectionMode);
}

export function reduceSession(session: AppSession, action: AppAction): AppSession {
  switch (action.kind) {
    case "set-roster":
      return session.kind === "setup"
        ? setupSession(action.roster, session.selectionMode)
        : session;
    case "set-selection-mode":
      return session.kind === "setup"
        ? setupSession(session.roster, action.selectionMode)
        : session;
    case "start-race":
      return session.kind === "setup" ? racingSession(action.request, action.course) : session;
    case "record-snapshot":
      return session.kind === "racing" && sameRace(session, action.seed)
        ? Object.freeze({ ...session, snapshot: action.snapshot })
        : session;
    case "complete-race":
      if (session.kind !== "racing" || !sameRace(session, action.outcome.seed)) {
        return session;
      }
      return Object.freeze({
        kind: "result",
        request: session.request,
        course: session.course,
        snapshot: action.snapshot,
        record: immutableRecord(action.record),
        revealVisible: false,
      });
    case "fail-race":
      if (session.kind !== "racing" || !sameRace(session, action.outcome.seed)) {
        return session;
      }
      return Object.freeze({
        kind: "failed",
        request: session.request,
        course: session.course,
        snapshot: action.snapshot,
        outcome: action.outcome,
      });
    case "show-result":
      if (
        session.kind !== "result" ||
        session.request.seed !== action.seed ||
        session.revealVisible
      ) {
        return session;
      }
      return Object.freeze({ ...session, revealVisible: true });
    case "retry-race":
      return session.kind === "failed" && canRetry(session, action.request)
        ? racingSession(action.request, action.course)
        : session;
    case "return-to-setup":
      return session.kind === "setup"
        ? session
        : setupSession(session.request.roster, session.request.selectionMode);
  }
}
