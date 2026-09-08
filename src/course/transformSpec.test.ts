import { describe, expect, it } from "vitest";

import { loadAuthoredAsset } from "../assets/catalog";
import { buildAuthoredSpec } from "../assets/buildAuthoredSpec";
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

it("places recovery boxes independently of geometry and preserves the source", () => {
  const source = {
    ...chute.buildSpec({ length: 0.6, grade: 0.25, width: 0.5 }),
    recoveryBoxes: [
      {
        position: [0, 0, 1] as const,
        rotation: [0, 0, 0, 1] as const,
        halfExtents: [0.4, 0.2, 0.7] as const,
      },
    ],
  };
  const placed = transformSpec(source, { position: [1, 2, 3], rotation: YAW_RIGHT }, "area");
  expectVectorClose(placed.recoveryBoxes![0].position, [2, 2, 3]);
  placed.recoveryBoxes![0].rotation.forEach((value, axis) =>
    expect(value).toBeCloseTo(YAW_RIGHT[axis], 10),
  );
  expect(placed.recoveryBoxes![0].halfExtents).toEqual([0.4, 0.2, 0.7]);
  expect(source.recoveryBoxes[0].position).toEqual([0, 0, 1]);
});

it("places authored mesh frames without changing GLB node or local bindings", () => {
  const source = buildAuthoredSpec(loadAuthoredAsset("chute"));
  const position: Vector3 = [1, 2, 3];
  const placed = transformSpec(source, { position, rotation: YAW_RIGHT }, "authored");
  placed.visuals.forEach((visual, index) => {
    const local = source.visuals[index];
    expect(visual.id).toBe(`authored:${local.id}`);
    expect(visual.authored).toBe(local.authored);
    expectVectorClose(visual.position, [
      position[0] + local.position[2],
      position[1] + local.position[1],
      position[2] - local.position[0],
    ]);
    expect(visual.shape).toBe(local.shape);
  });
});
