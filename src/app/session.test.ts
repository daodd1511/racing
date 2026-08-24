import { describe, expect, it } from "vitest";

import type { Course } from "../course/types";
import type { RaceOutcome, RaceRequest, RaceSnapshot } from "../race/liveTypes";
import type { CommittedRaceRecord, PickerStateV1 } from "../race/types";
import { createInitialSession, reduceSession, type AppSession } from "./session";

const state: PickerStateV1 = Object.freeze({
  version: 1,
  roster: Object.freeze(["Avery", "Blake"]),
  settings: Object.freeze({ selectionMode: "first" }),
  history: Object.freeze([]),
});

const course = Object.freeze({ seed: 7 }) as Course;

function request(seed = 7): RaceRequest {
  return Object.freeze({ seed, roster: Object.freeze(["Avery", "Blake"]), selectionMode: "first" });
}

const snapshot: RaceSnapshot = Object.freeze({
  elapsedSeconds: 4,
  marbleTransforms: Object.freeze([]),
  ranking: Object.freeze([0, 1]),
  decisiveMarbleIndex: 0,
  passedCheckpoints: Object.freeze([0, 0]),
  splitTimes: Object.freeze([Object.freeze([null]), Object.freeze([null])]),
});

const completedOutcome: Extract<RaceOutcome, { readonly kind: "completed" }> = Object.freeze({
  kind: "completed",
  seed: 7,
  selectedMarbleIndex: 0,
  finishOrder: Object.freeze([0]),
  finalRanking: Object.freeze([0, 1]),
  elapsedSeconds: 4,
});

const watchdogOutcome: Extract<RaceOutcome, { readonly kind: "watchdog" }> = Object.freeze({
  kind: "watchdog",
  seed: 7,
  unfinishedMarbleIndices: Object.freeze([0, 1]),
  elapsedSeconds: 120,
});

const record: CommittedRaceRecord = Object.freeze({
  seed: 7,
  committedAtEpochMs: 1,
  roster: Object.freeze(["Avery", "Blake"]),
  selectionMode: "first",
  selectedMarbleIndex: 0,
  selectedName: "Avery",
  finishOrder: Object.freeze([0]),
  finalRanking: Object.freeze([0, 1]),
});

function racingSession(): AppSession {
  return reduceSession(createInitialSession(state), {
    kind: "start-race",
    request: request(),
    course,
  });
}

describe("createInitialSession", () => {
  it("copies saved setup data into an immutable setup session", () => {
    const session = createInitialSession(state);

    expect(session).toEqual({ kind: "setup", roster: ["Avery", "Blake"], selectionMode: "first" });
    expect(session).not.toBe(state);
    expect(session.kind === "setup" && Object.isFrozen(session.roster)).toBe(true);
  });
});

describe("reduceSession", () => {
  it("updates setup only before the race starts", () => {
    const setup = reduceSession(createInitialSession(state), {
      kind: "set-roster",
      roster: ["Casey", "Casey"],
    });
    const racing = racingSession();

    expect(setup).toEqual({ kind: "setup", roster: ["Casey", "Casey"], selectionMode: "first" });
    expect(reduceSession(racing, { kind: "set-selection-mode", selectionMode: "last" })).toBe(
      racing,
    );
  });

  it("ignores terminal outcomes for a stale race", () => {
    const active = racingSession();
    const staleOutcome = { ...completedOutcome, seed: 8 } as const;

    expect(
      reduceSession(active, {
        kind: "complete-race",
        outcome: staleOutcome,
        snapshot,
        record: { ...record, seed: 8 },
      }),
    ).toBe(active);
  });

  it("enters a hidden result only for the active completed race", () => {
    const result = reduceSession(racingSession(), {
      kind: "complete-race",
      outcome: completedOutcome,
      snapshot,
      record,
    });

    expect(result).toMatchObject({ kind: "result", revealVisible: false, record });
    expect(reduceSession(result, { kind: "show-result", seed: 7 })).toMatchObject({
      kind: "result",
      revealVisible: true,
    });
    expect(
      reduceSession(result, {
        kind: "complete-race",
        outcome: completedOutcome,
        snapshot,
        record,
      }),
    ).toBe(result);
  });

  it("requires a new matching request when retrying a watchdog race", () => {
    const failed = reduceSession(racingSession(), {
      kind: "fail-race",
      outcome: watchdogOutcome,
      snapshot,
    });
    const sameSeed = reduceSession(failed, { kind: "retry-race", request: request(), course });
    const retried = reduceSession(failed, {
      kind: "retry-race",
      request: request(9),
      course: Object.freeze({ seed: 9 }) as Course,
    });

    expect(sameSeed).toBe(failed);
    expect(retried).toMatchObject({ kind: "racing", request: { seed: 9 } });
  });

  it("returns terminal states to the saved race setup", () => {
    const result = reduceSession(racingSession(), {
      kind: "complete-race",
      outcome: completedOutcome,
      snapshot,
      record,
    });

    expect(reduceSession(result, { kind: "return-to-setup" })).toEqual({
      kind: "setup",
      roster: ["Avery", "Blake"],
      selectionMode: "first",
    });
  });
});
