import { describe, expect, it } from "vitest";

import { startGridPositions } from "../course/startFinish";
import type { Course } from "../course/types";
import {
  assignStartPositions,
  startingGridCameraTarget,
  startingGridTransforms,
} from "./startAssignment";

describe("assignStartPositions", () => {
  it("deterministically randomizes marble identities across only the occupied grid", () => {
    const assignments = assignStartPositions(193, 7);
    const repeated = assignStartPositions(193, 7);
    const gridPositions = startGridPositions(7);

    expect(repeated).toEqual(assignments);
    expect(assignments.map(({ position }) => position)).not.toEqual(gridPositions);
    expect(new Set(assignments.map(({ position }) => position))).toEqual(new Set(gridPositions));
    assignments.forEach((assignment, marbleIndex) => {
      expect(assignment.marbleIndex).toBe(marbleIndex);
      expect(Object.isFrozen(assignment)).toBe(true);
    });
    expect(Object.isFrozen(assignments)).toBe(true);
  });

  it("keeps five marbles together on the front row", () => {
    const assignments = assignStartPositions(42, 5);

    expect(new Set(assignments.map(({ position }) => position[2])).size).toBe(1);
    expect(new Set(assignments.map(({ position }) => position)).size).toBe(5);
  });

  it.each([0, 16, 1.5, Number.NaN])("rejects invalid Roster size %s", (rosterSize) => {
    expect(() => assignStartPositions(1, rosterSize)).toThrow(/Roster size/);
  });

  it("projects the staged grid and camera target into the Course Start frame", () => {
    const course = {
      entry: { position: [10, 20, 30], tangent: [1, 0, 0], up: [0, 1, 0] },
    } satisfies Pick<Course, "entry">;
    const transforms = startingGridTransforms(course, 193, 7);
    const target = startingGridCameraTarget(course, 7);

    expect(transforms).toHaveLength(7);
    expect(transforms.every(({ position }) => position[0] > 10)).toBe(true);
    expect(target.forward).toEqual([1, 0, 0]);
    expect(target.position[0]).toBeGreaterThan(10);
    expect(Object.isFrozen(transforms)).toBe(true);
  });
});
