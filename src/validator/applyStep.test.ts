import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";

import { applyStep } from "./applyStep";
import { buildWorld } from "./buildWorld";
import type { Spec } from "../modules/types";

const IDENTITY_ROTATION: [number, number, number, number] = [0, 0, 0, 1];

function expectTupleClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], 5);
  });
}

const spec: Spec = {
  colliders: [
    {
      id: "fixed",
      shape: { kind: "cuboid", halfExtents: [0.1, 0.1, 0.1] },
      position: [0.75, 0, 0],
      rotation: IDENTITY_ROTATION,
      material: { friction: 0.08, restitution: 0.15 },
    },
    {
      id: "paddle",
      kinematic: true,
      shape: { kind: "cuboid", halfExtents: [0.1, 0.1, 0.1] },
      position: [0, 0, 0],
      rotation: IDENTITY_ROTATION,
      material: { friction: 0.08, restitution: 0.15 },
    },
  ],
  visuals: [],
  footprint: {
    cells: [],
    entry: { position: [0, 0, 0], tangent: [0, 0, 1], up: [0, 1, 0] },
    exit: { position: [0, 0, 1], tangent: [0, 0, 1], up: [0, 1, 0] },
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
  },
};

beforeAll(async () => {
  await RAPIER.init();
});

describe("applyStep", () => {
  it.each([
    { position: [0.2, 0.1, -0.3] as const, rotation: [0, 0, 0.5, Math.sqrt(0.75)] as const },
    { position: [-0.4, 0.25, 0.6] as const, rotation: [0.5, 0, 0, Math.sqrt(0.75)] as const },
  ])("writes the next kinematic transform %o without moving fixed bodies", (transform) => {
    const builtWorld = buildWorld([spec]);
    const paddle = builtWorld.kinematicBodies.get("paddle");
    if (paddle === undefined) {
      throw new Error("expected paddle kinematic body");
    }

    applyStep([{ id: "paddle", ...transform }], builtWorld.kinematicBodies);
    builtWorld.world.step();

    const translation = paddle.translation();
    const rotation = paddle.rotation();
    expectTupleClose([translation.x, translation.y, translation.z], transform.position);
    expectTupleClose([rotation.x, rotation.y, rotation.z, rotation.w], transform.rotation);

    const translations: number[][] = [];
    builtWorld.world.forEachRigidBody((body) => {
      const fixedTranslation = body.translation();
      translations.push([fixedTranslation.x, fixedTranslation.y, fixedTranslation.z]);
    });
    expect(translations).toContainEqual([0.75, 0, 0]);

    builtWorld.world.free();
  });

  it("retains omitted kinematic fields", () => {
    const builtWorld = buildWorld([spec]);
    const paddle = builtWorld.kinematicBodies.get("paddle");
    if (paddle === undefined) {
      throw new Error("expected paddle kinematic body");
    }

    applyStep(
      [{ id: "paddle", position: [0.2, 0.1, -0.3], rotation: [0, 0, 0.5, Math.sqrt(0.75)] }],
      builtWorld.kinematicBodies,
    );
    builtWorld.world.step();
    applyStep(
      [{ id: "paddle", rotation: [0.5, 0, 0, Math.sqrt(0.75)] }],
      builtWorld.kinematicBodies,
    );
    builtWorld.world.step();

    const translation = paddle.translation();
    const rotation = paddle.rotation();
    expectTupleClose([translation.x, translation.y, translation.z], [0.2, 0.1, -0.3]);
    expectTupleClose(
      [rotation.x, rotation.y, rotation.z, rotation.w],
      [0.5, 0, 0, Math.sqrt(0.75)],
    );

    builtWorld.world.free();
  });
});
