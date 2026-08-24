/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Course } from "../course/types";
import type { RaceSnapshot } from "../race/liveTypes";
import { createStandingsRows, formatRaceTime, Standings } from "./Standings";

const course = Object.freeze({
  checkpoints: Object.freeze([Object.freeze({}), Object.freeze({}), Object.freeze({})]),
}) as Course;

const snapshot: RaceSnapshot = Object.freeze({
  elapsedSeconds: 8.4,
  marbleTransforms: Object.freeze([]),
  ranking: Object.freeze([1, 0, 2]),
  decisiveMarbleIndex: 1,
  passedCheckpoints: Object.freeze([1, 2, -1]),
  splitTimes: Object.freeze([
    Object.freeze([1.25, null, null]),
    Object.freeze([1.1, 3.4, null]),
    Object.freeze([null, null, null]),
  ]),
});

afterEach(cleanup);

describe("formatRaceTime", () => {
  it("formats finite simulation seconds as fixed split times", () => {
    expect(formatRaceTime(63.4)).toBe("01:03.40");
    expect(formatRaceTime(Number.NaN)).toBe("—");
  });
});

describe("createStandingsRows", () => {
  it("uses final ranking without inventing absent split times", () => {
    const rows = createStandingsRows({
      roster: ["Avery", "Blake", "Casey"],
      snapshot,
      finalRanking: [2, 0, 1],
    });

    expect(rows.map(({ name }) => name)).toEqual(["Casey", "Avery", "Blake"]);
    expect(rows[0]).toMatchObject({ checkpoint: 0, latestSplitSeconds: null });
  });

  it("preserves Roster order before the first snapshot", () => {
    const rows = createStandingsRows({ roster: ["Avery", "Blake"], snapshot: null });

    expect(rows.map(({ marbleIndex }) => marbleIndex)).toEqual([0, 1]);
    expect(
      rows.every(
        ({ checkpoint, latestSplitSeconds }) => checkpoint === null && latestSplitSeconds === null,
      ),
    ).toBe(true);
  });
});

describe("Standings", () => {
  it("renders the ranked Roster, decisive marker, checkpoint, and latest split", () => {
    render(<Standings course={course} roster={["Avery", "Blake", "Casey"]} snapshot={snapshot} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("Blake");
    expect(items[0].textContent).toContain("Leader pick");
    expect(items[0].textContent).toContain("CP 3 / 3");
    expect(items[0].textContent).toContain("00:03.40");
  });

  it("renders all fifteen possible Roster entries", () => {
    const roster = Array.from({ length: 15 }, (_, index) => `Marble ${index + 1}`);
    render(<Standings course={course} roster={roster} snapshot={null} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(15);
    expect(screen.getAllByText("Pending")).toHaveLength(15);
  });
});
