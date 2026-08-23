/** @vitest-environment happy-dom */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CoursePhysics } from "./CoursePhysics";

const runtime = vi.hoisted(() => {
  const initialSnapshot = Object.freeze({
    elapsedSeconds: 0,
    marbleTransforms: Object.freeze([]),
    ranking: Object.freeze([0]),
    decisiveMarbleIndex: 0,
    passedCheckpoints: Object.freeze([0]),
    splitTimes: Object.freeze([Object.freeze([null])]),
  });
  const terminalSnapshot = Object.freeze({
    ...initialSnapshot,
    elapsedSeconds: 4,
    splitTimes: Object.freeze([Object.freeze([4])]),
  });
  const outcome = Object.freeze({
    kind: "completed" as const,
    seed: 7,
    selectedMarbleIndex: 0,
    finishOrder: Object.freeze([0]),
    finalRanking: Object.freeze([0]),
    elapsedSeconds: 4,
  });

  return {
    frame: undefined as undefined | ((state: unknown, deltaSeconds: number) => void),
    initialSnapshot,
    terminalSnapshot,
    outcome,
  };
});

vi.mock("@dimforge/rapier3d-compat", () => ({ default: { init: vi.fn(async () => undefined) } }));

vi.mock("@react-three/fiber", () => ({
  useFrame(callback: (state: unknown, deltaSeconds: number) => void) {
    runtime.frame = callback;
  },
}));

vi.mock("./fixedStepBacklog", () => ({
  INITIAL_FIXED_STEP_BACKLOG: Object.freeze({ accumulatorSeconds: 0 }),
  advanceFixedStepBacklog: vi.fn(() => ({ backlog: Object.freeze({ accumulatorSeconds: 0 }), stepTimes: [4] })),
}));

vi.mock("./CourseRaceRuntime", () => ({
  CourseRaceRuntime: class {
    #completed = false;

    get currentSnapshot() {
      return runtime.initialSnapshot;
    }

    get outcome() {
      return this.#completed ? runtime.outcome : null;
    }

    step() {
      this.#completed = true;
      return Object.freeze({
        snapshot: runtime.terminalSnapshot,
        contactEvents: Object.freeze([]),
        outcome: runtime.outcome,
      });
    }

    dispose() {}
  },
}));

afterEach(() => {
  cleanup();
  runtime.frame = undefined;
});

describe("CoursePhysics", () => {
  it("emits the terminal snapshot before its completed outcome", async () => {
    const events: readonly string[] = [];
    const onSnapshot = vi.fn((snapshot: { readonly elapsedSeconds: number }) => {
      (events as string[]).push(`snapshot:${snapshot.elapsedSeconds}`);
    });
    const onOutcome = vi.fn(() => {
      (events as string[]).push("outcome");
    });

    render(
      <CoursePhysics
        course={{} as never}
        onContact={vi.fn()}
        onOutcome={onOutcome}
        onSnapshot={onSnapshot}
        request={{ seed: 7, roster: ["Avery"], selectionMode: "first" }}
      />,
    );

    await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(runtime.initialSnapshot));
    if (runtime.frame === undefined) throw new Error("Expected a registered frame callback");

    act(() => {
      runtime.frame?.({}, 1 / 60);
    });

    expect(events).toEqual(["snapshot:0", "snapshot:4", "outcome"]);
  });
});
