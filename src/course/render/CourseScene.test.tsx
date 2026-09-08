/** @vitest-environment happy-dom */

import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RaceSnapshot } from "../../race/liveTypes";
import { assembleCourse } from "../assembleCourse";
import { CourseScene } from "./CourseScene";

const renderCounts = vi.hoisted(() => ({
  board: 0,
  movingSpecs: 0,
  staticSpecs: 0,
  readTransforms: undefined as undefined | (() => readonly unknown[]),
}));

vi.mock("@react-three/fiber", () => ({
  useFrame() {},
}));

vi.mock("@react-three/drei", () => ({
  Html({ children }: { readonly children: ReactNode }) {
    return children;
  },
}));

vi.mock("../../modules/render/ModuleColliders", () => ({
  SpecVisuals({
    transforms,
    readTransforms,
  }: {
    readonly transforms?: readonly unknown[];
    readonly readTransforms?: () => readonly unknown[];
  }) {
    renderCounts.readTransforms = readTransforms;
    if (transforms !== undefined) {
      renderCounts.movingSpecs += 1;
    }
    return null;
  },
}));

vi.mock("../../modules/render/StaticSpecVisuals", () => ({
  StaticSpecVisuals() {
    renderCounts.staticSpecs += 1;
    return null;
  },
}));

vi.mock("./Board", () => ({
  Board() {
    renderCounts.board += 1;
    return null;
  },
}));

function snapshot(elapsedSeconds: number): RaceSnapshot {
  return {
    elapsedSeconds,
    marbleTransforms: [],
    ranking: [],
    decisiveMarbleIndex: 0,
    passedCheckpoints: [],
    splitTimes: [],
  };
}

beforeEach(() => {
  renderCounts.board = 0;
  renderCounts.movingSpecs = 0;
  renderCounts.staticSpecs = 0;
});

afterEach(cleanup);

describe("CourseScene", () => {
  it("does not reconcile static Course geometry when a live snapshot advances", () => {
    const course = assembleCourse(17);
    const view = render(<CourseScene course={course} snapshot={snapshot(1)} />);
    const initialStaticRenders = renderCounts.staticSpecs;

    expect(initialStaticRenders).toBeGreaterThan(0);
    expect(renderCounts.board).toBe(1);
    expect(renderCounts.movingSpecs).toBe(1);

    view.rerender(<CourseScene course={course} snapshot={snapshot(2)} />);

    expect(renderCounts.staticSpecs).toBe(initialStaticRenders);
    expect(renderCounts.board).toBe(1);
    expect(renderCounts.movingSpecs).toBe(2);
  });
});

it("reads gate motion from the current frame without another scene render", () => {
  const frameRef = { current: snapshot(0) };
  render(<CourseScene course={assembleCourse(17)} frameRef={frameRef} />);
  const initial = renderCounts.readTransforms!();
  const count = renderCounts.movingSpecs;
  frameRef.current = snapshot(3);
  expect(renderCounts.readTransforms!()).not.toEqual(initial);
  expect(renderCounts.movingSpecs).toBe(count);
});
