import { describe, expect, it } from "vitest";
import type { RecoveryBox } from "../modules/types";
import { containsRecoveryPoint } from "./recoveryAreas";

const box: RecoveryBox = { position: [0, 0, 0], rotation: [0, 0, 0, 1], halfExtents: [2, 1, 0.5] };

describe("recovery areas", () => {
  it("includes union boundaries while excluding gaps and empty collections", () => {
    const boxes = [box, { ...box, position: [6, 0, 0] as const }];
    expect(containsRecoveryPoint(boxes, [2, 1, 0.5])).toBe(true);
    expect(containsRecoveryPoint(boxes, [6, 0, 0])).toBe(true);
    expect(containsRecoveryPoint(boxes, [3, 0, 0])).toBe(false);
    expect(containsRecoveryPoint(boxes, [2.001, 0, 0])).toBe(false);
    expect(containsRecoveryPoint([], [0, 0, 0])).toBe(false);
  });

  it("uses the placed orientation instead of its enclosing axis-aligned bounds", () => {
    const boxes = [
      {
        ...box,
        position: [4, 2, 1] as const,
        rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const,
      },
    ];
    expect(containsRecoveryPoint(boxes, [4, 2, 2.9])).toBe(true);
    expect(containsRecoveryPoint(boxes, [5, 2, 1])).toBe(false);
    expect(containsRecoveryPoint(boxes, [4, 2, 2.9])).toBe(true);
  });

  it("rejects invalid box data instead of silently preventing recovery", () => {
    expect(() => containsRecoveryPoint([{ ...box, halfExtents: [-1, 1, 1] }], [0, 0, 0])).toThrow(
      /positive half-extents/,
    );
    expect(() => containsRecoveryPoint([{ ...box, rotation: [0, 0, 0, 0] }], [0, 0, 0])).toThrow(
      /nonzero rotation/,
    );
  });
});
