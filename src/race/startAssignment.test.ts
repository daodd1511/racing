import { describe, expect, it } from "vitest";

import { START_POSITIONS } from "../course/startFinish";
import { createSeededRandom, deriveRaceSeed } from "./random";
import { assignStartPositions } from "./startAssignment";

describe("assignStartPositions", () => {
  it("deterministically assigns unique positions from the tagged Start stream", () => {
    const expected = assignStartPositions(193, 15);
    const courseRandom = createSeededRandom(deriveRaceSeed(193, "course"));
    for (let draw = 0; draw < 100; draw += 1) {
      courseRandom();
    }

    expect(assignStartPositions(193, 15)).toEqual(expected);
    expect(new Set(expected.map(({ startPositionIndex }) => startPositionIndex)).size).toBe(15);
    expected.forEach((assignment, marbleIndex) => {
      expect(assignment.marbleIndex).toBe(marbleIndex);
      expect(assignment.position).toBe(START_POSITIONS[assignment.startPositionIndex]);
      expect(Object.isFrozen(assignment)).toBe(true);
    });
    expect(Object.isFrozen(expected)).toBe(true);
  });

  it.each([0, 16, 1.5, Number.NaN])("rejects invalid Roster size %s", (rosterSize) => {
    expect(() => assignStartPositions(1, rosterSize)).toThrow(/Roster size/);
  });
});
