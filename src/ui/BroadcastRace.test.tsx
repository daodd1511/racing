/** @vitest-environment happy-dom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Course } from "../course/types";
import type { RaceContactEvent, RaceOutcome, RaceSnapshot } from "../race/liveTypes";
import { BroadcastRace } from "./BroadcastRace";

const runtime = vi.hoisted(() => ({
  snapshot: Object.freeze({
    elapsedSeconds: 4.2,
    marbleTransforms: Object.freeze([]),
    ranking: Object.freeze([1, 0]),
    decisiveMarbleIndex: 1,
    passedCheckpoints: Object.freeze([0, 1]),
    splitTimes: Object.freeze([Object.freeze([1.1]), Object.freeze([1.2])]),
  }),
  nearSnapshot: Object.freeze({
    elapsedSeconds: 4.25,
    marbleTransforms: Object.freeze([]),
    ranking: Object.freeze([1, 0]),
    decisiveMarbleIndex: 1,
    passedCheckpoints: Object.freeze([0, 1]),
    splitTimes: Object.freeze([Object.freeze([1.1]), Object.freeze([1.2])]),
  }),
  laterSnapshot: Object.freeze({
    elapsedSeconds: 4.31,
    marbleTransforms: Object.freeze([]),
    ranking: Object.freeze([1, 0]),
    decisiveMarbleIndex: 1,
    passedCheckpoints: Object.freeze([0, 1]),
    splitTimes: Object.freeze([Object.freeze([1.1]), Object.freeze([1.2])]),
  }),
  contact: Object.freeze({ elapsedSeconds: 4.2, marbleIndices: Object.freeze([0]), impulse: 2 }),
  outcome: Object.freeze({
    kind: "completed" as const,
    seed: 11,
    selectedMarbleIndex: 1,
    finishOrder: Object.freeze([1]),
    finalRanking: Object.freeze([1, 0]),
    elapsedSeconds: 4.2,
  }),
}));

vi.mock("@react-three/fiber", () => ({
  Canvas({ children }: { readonly children: ReactNode }) {
    return <div data-testid="canvas">{children}</div>;
  },
}));

vi.mock("../race/LiveRace", () => ({
  LiveRace({
    children,
    onContact,
    onOutcome,
    onSnapshot,
  }: {
    readonly children?: (state: {
      readonly snapshot: RaceSnapshot;
      readonly outcome: null;
    }) => ReactNode;
    readonly onContact?: (event: RaceContactEvent) => void;
    readonly onOutcome?: (outcome: RaceOutcome) => void;
    readonly onSnapshot?: (snapshot: RaceSnapshot) => void;
  }) {
    function emitSnapshot(): void {
      onSnapshot?.(runtime.snapshot);
    }

    function emitContact(): void {
      onContact?.(runtime.contact);
    }

    function emitNearSnapshot(): void {
      onSnapshot?.(runtime.nearSnapshot);
    }

    function emitLaterSnapshot(): void {
      onSnapshot?.(runtime.laterSnapshot);
    }

    function emitOutcome(): void {
      onOutcome?.(runtime.outcome);
    }

    return (
      <>
        <button onClick={emitSnapshot} type="button">
          Emit snapshot
        </button>
        <button onClick={emitContact} type="button">
          Emit contact
        </button>
        <button onClick={emitNearSnapshot} type="button">
          Emit near snapshot
        </button>
        <button onClick={emitLaterSnapshot} type="button">
          Emit later snapshot
        </button>
        <button onClick={emitOutcome} type="button">
          Emit outcome
        </button>
        {children?.({ snapshot: runtime.snapshot, outcome: null })}
      </>
    );
  },
}));

vi.mock("../course/render/CourseScene", () => ({
  CourseScene({
    snapshot,
    stagedMarbleTransforms = [],
  }: {
    readonly snapshot: RaceSnapshot | null;
    readonly stagedMarbleTransforms?: RaceSnapshot["marbleTransforms"];
  }) {
    return (
      <>
        <output>Course scene {snapshot?.elapsedSeconds ?? "pending"}</output>
        <output>Staged marbles {stagedMarbleTransforms.length}</output>
      </>
    );
  },
}));

vi.mock("../race/DecisiveCamera", () => ({
  DecisiveCamera({
    snapshot,
    startingGridSize,
  }: {
    readonly snapshot: RaceSnapshot | null;
    readonly startingGridSize?: number;
  }) {
    return (
      <output>
        Camera {snapshot?.decisiveMarbleIndex ?? "pending"} grid {startingGridSize}
      </output>
    );
  },
}));

vi.mock("../race/CourseMinimap", () => ({
  CourseMinimap({ snapshot }: { readonly snapshot: RaceSnapshot | null }) {
    return <output>Minimap {snapshot?.elapsedSeconds ?? "pending"}</output>;
  },
}));

const course = Object.freeze({
  board: Object.freeze({}),
  checkpoints: Object.freeze([Object.freeze({}), Object.freeze({})]),
  entry: Object.freeze({
    position: Object.freeze([0, 0, 0]),
    tangent: Object.freeze([1, 0, 0]),
    up: Object.freeze([0, 1, 0]),
  }),
}) as Course;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BroadcastRace", () => {
  it("renders the Course, camera, minimap, and standings from one live snapshot", () => {
    vi.useFakeTimers();
    render(
      <BroadcastRace
        course={course}
        request={{ seed: 11, roster: ["Avery", "Blake"], selectionMode: "first" }}
      />,
    );

    expect(screen.getByTestId("canvas")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Course scene pending")).toBeTruthy();
    expect(screen.getByText("Staged marbles 2")).toBeTruthy();
    expect(screen.getByText("Camera pending grid 2")).toBeTruthy();
    act(() => vi.advanceTimersByTime(2_250));
    expect(screen.getByText("GO!")).toBeTruthy();
    expect(screen.getByText("Course scene 4.2")).toBeTruthy();
    expect(screen.getByText("Camera 1 grid 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Emit snapshot" }));

    expect(screen.getByText("Minimap 4.2")).toBeTruthy();
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("Blake");

    fireEvent.click(screen.getByRole("button", { name: "Emit near snapshot" }));
    expect(screen.getByText("Minimap 4.2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Emit later snapshot" }));
    expect(screen.getByText("Minimap 4.31")).toBeTruthy();
  });

  it("forwards contact and outcome callbacks without deriving runtime state", () => {
    vi.useFakeTimers();
    const onContact = vi.fn();
    const onOutcome = vi.fn();
    render(
      <BroadcastRace
        course={course}
        onContact={onContact}
        onOutcome={onOutcome}
        request={{ seed: 11, roster: ["Avery", "Blake"], selectionMode: "first" }}
      />,
    );
    act(() => vi.advanceTimersByTime(2_250));

    fireEvent.click(screen.getByRole("button", { name: "Emit contact" }));
    fireEvent.click(screen.getByRole("button", { name: "Emit outcome" }));

    expect(onContact).toHaveBeenCalledWith(runtime.contact);
    expect(onOutcome).toHaveBeenCalledWith(runtime.outcome);
  });

  it("labels the mode-aware decisive marble as the tracked leader or trailer", () => {
    render(
      <BroadcastRace
        course={course}
        frozen
        request={{ seed: 11, roster: ["Avery", "Blake"], selectionMode: "last" }}
        snapshot={runtime.snapshot}
      />,
    );

    expect(screen.getByText("Tracking trailer")).toBeTruthy();
    expect(screen.getAllByText("Blake")).toHaveLength(2);
    expect(screen.getByText("Last pick")).toBeTruthy();
  });

  it("uses the immutable app-owned snapshot for broadcast telemetry and chrome", () => {
    render(
      <BroadcastRace
        course={course}
        request={{ seed: 11, roster: ["Avery", "Blake"], selectionMode: "first" }}
        snapshot={runtime.snapshot}
      />,
    );

    expect(screen.getByText("00:04.20")).toBeTruthy();
    expect(screen.getByText("Minimap 4.2")).toBeTruthy();
  });

  it("renders a frozen terminal snapshot without mounting the live solver", () => {
    render(
      <BroadcastRace
        course={course}
        frozen
        request={{ seed: 11, roster: ["Avery", "Blake"], selectionMode: "first" }}
        snapshot={runtime.snapshot}
      />,
    );

    expect(screen.getByText("Course scene 4.2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Emit snapshot" })).toBeNull();
  });
});
