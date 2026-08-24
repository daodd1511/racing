import { describe, expect, it } from "vitest";

import { chute } from "../modules/chute";
import type { Quaternion, Vector3 } from "../race/types";
import { transformSpec } from "./transformSpec";

const YAW_RIGHT: Quaternion = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
const YAW_LEFT: Quaternion = [0, -Math.SQRT1_2, 0, Math.SQRT1_2];

function expectVectorClose(actual: Vector3, expected: Vector3): void {
  actual.forEach((value, axis) => expect(value).toBeCloseTo(expected[axis], 10));
}

describe("transformSpec", () => {
  it("places a chute left or right with yaw only and namespaces every id", () => {
    const source = chute.buildSpec({ length: 0.6, grade: 0.25, width: 0.5 });
    const snapshot = structuredClone(source);
    const position: Vector3 = [1, 2, 3];
    const right = transformSpec(source, { position, rotation: YAW_RIGHT }, "slot-1");
    const left = transformSpec(source, { position, rotation: YAW_LEFT }, "slot-2");

    expectVectorClose(right.footprint.entry.position, position);
    expectVectorClose(right.footprint.exit.position, [1.6, 1.85, 3]);
    expectVectorClose(left.footprint.exit.position, [0.4, 1.85, 3]);
    expect(right.colliders.every(({ id }) => id.startsWith("slot-1:"))).toBe(true);
    expect(right.visuals.every(({ id }) => id.startsWith("slot-1:"))).toBe(true);
    expect(right.footprint.route[0]).toEqual(right.footprint.entry.position);
    expectVectorClose(right.footprint.route.at(-1)!, right.footprint.exit.position);
    expect(source).toEqual(snapshot);
  });

  it("rejects an empty namespace and zero placement quaternion", () => {
    const source = chute.buildSpec({ length: 0.6, grade: 0.25, width: 0.5 });
    expect(() => transformSpec(source, { position: [0, 0, 0], rotation: YAW_RIGHT }, "")).toThrow(
      /idPrefix/,
    );
    expect(() =>
      transformSpec(source, { position: [0, 0, 0], rotation: [0, 0, 0, 0] }, "slot-1"),
    ).toThrow(/non-zero/);
  });
});
