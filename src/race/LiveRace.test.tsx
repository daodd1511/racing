/** @vitest-environment happy-dom */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Course } from "../course/types";
import type { CoursePhysicsProps } from "./CoursePhysics";
import type { RaceFrameRef, RaceSnapshot } from "./liveTypes";
import { LiveRace } from "./LiveRace";

const runtime = vi.hoisted(() => ({ props: null as CoursePhysicsProps | null }));
vi.mock("./CoursePhysics", () => ({
  CoursePhysics(props: CoursePhysicsProps) {
    runtime.props = props;
    return null;
  },
}));
afterEach(cleanup);
const request = { seed: 7, roster: ["A"], selectionMode: "last" as const };
const course = {} as Course;
const snapshot: RaceSnapshot = {
  elapsedSeconds: 1,
  marbleTransforms: [],
  ranking: [0],
  decisiveMarbleIndex: 0,
  passedCheckpoints: [],
  splitTimes: [],
};

it("publishes frames without rendering children, but publishes outcomes through React", () => {
  const children = vi.fn(() => null);
  const onSnapshot = vi.fn();
  render(
    <LiveRace course={course} request={request} onSnapshot={onSnapshot}>
      {children}
    </LiveRace>,
  );
  const renderCount = children.mock.calls.length;
  act(() => runtime.props!.onSnapshot(snapshot));
  expect(children).toHaveBeenCalledTimes(renderCount);
  expect(onSnapshot).toHaveBeenCalledWith(snapshot);
  act(() =>
    runtime.props!.onOutcome({
      kind: "completed",
      seed: 7,
      selectedMarbleIndex: 0,
      finishOrder: [0],
      finalRanking: [0],
      elapsedSeconds: 1,
    }),
  );
  expect(children.mock.calls.length).toBeGreaterThan(renderCount);
});

it("replaces the channel on request change and clears old channels on cleanup", () => {
  const channels: RaceFrameRef[] = [];
  const children = ({ frameRef }: { frameRef: RaceFrameRef }) => {
    channels.push(frameRef);
    return null;
  };
  const view = render(
    <LiveRace course={course} request={request}>
      {children}
    </LiveRace>,
  );
  act(() => runtime.props!.onSnapshot(snapshot));
  const old = channels.at(-1)!;
  expect(old.current).toBe(snapshot);
  view.rerender(
    <LiveRace course={course} request={{ ...request, seed: 8 }}>
      {children}
    </LiveRace>,
  );
  const next = channels.at(-1)!;
  expect(next).not.toBe(old);
  expect(old.current).toBeNull();
  expect(next.current).toBeNull();
  act(() => runtime.props!.onSnapshot(snapshot));
  view.unmount();
  expect(next.current).toBeNull();
});
