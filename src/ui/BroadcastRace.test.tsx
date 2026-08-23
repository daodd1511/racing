/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    readonly children?: (state: { readonly snapshot: RaceSnapshot; readonly outcome: null }) => ReactNode;
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
        <button onClick={emitOutcome} type="button">
          Emit outcome
        </button>
        {children?.({ snapshot: runtime.snapshot, outcome: null })}
      </>
    );
  },
}));

vi.mock("../course/render/CourseScene", () => ({
  CourseScene({ snapshot }: { readonly snapshot: RaceSnapshot | null }) {
    return <output>Course scene {snapshot?.elapsedSeconds ?? "pending"}</output>;
  },
}));

vi.mock("../race/DecisiveCamera", () => ({
  DecisiveCamera({ snapshot }: { readonly snapshot: RaceSnapshot | null }) {
    return <output>Camera {snapshot?.decisiveMarbleIndex ?? "pending"}</output>;
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
}) as Course;

afterEach(cleanup);

describe("BroadcastRace", () => {
  it("renders the Course, camera, minimap, and standings from one live snapshot", async () => {
    const user = userEvent.setup();
    render(
      <BroadcastRace
        course={course}
        request={{ seed: 11, roster: ["Avery", "Blake"], selectionMode: "first" }}
      />,
    );

    expect(screen.getByTestId("canvas")).toBeTruthy();
    expect(screen.getByText("Course scene 4.2")).toBeTruthy();
    expect(screen.getByText("Camera 1")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Emit snapshot" }));

    expect(screen.getByText("Minimap 4.2")).toBeTruthy();
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("Blake");
  });

  it("forwards contact and outcome callbacks without deriving runtime state", async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole("button", { name: "Emit contact" }));
    await user.click(screen.getByRole("button", { name: "Emit outcome" }));

    expect(onContact).toHaveBeenCalledWith(runtime.contact);
    expect(onOutcome).toHaveBeenCalledWith(runtime.outcome);
  });
});
