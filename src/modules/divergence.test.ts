import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";

import { assembleCourse } from "../course/assembleCourse";
import { stepStartGate } from "../course/startFinish";
import { stepCourse, stepRotatingSpec } from "../course/stepCourse";
import {
  INITIAL_KINEMATIC_CLOCK,
  KINEMATIC_FIXED_STEP_SECONDS,
  advanceKinematicClock,
  kinematicSeconds,
  kinematicTransformsAt,
  transformForAnchor,
  type KinematicStep,
} from "./kinematics";
import type { Spec } from "./types";
import { applyStep } from "../validator/applyStep";
import { buildWorld } from "../validator/buildWorld";

const IDENTITY_ROTATION: [number, number, number, number] = [0, 0, 0, 1];

const spec: Spec = {
  colliders: [
    {
      id: "paddle",
      kinematic: true,
      shape: { kind: "cuboid", halfExtents: [0.08, 0.01, 0.2] },
      position: [0, 0.1, 0.3],
      rotation: IDENTITY_ROTATION,
      material: { friction: 0.08, restitution: 0.15 },
    },
    {
      id: "floor",
      shape: { kind: "cuboid", halfExtents: [0.3, 0.01, 0.6] },
      position: [0, 0, 0.6],
      rotation: IDENTITY_ROTATION,
      material: { friction: 0.08, restitution: 0.15 },
    },
  ],
  visuals: [],
  footprint: {
    cells: [],
    entry: { position: [0, 0, 0], tangent: [0, 0, 1], up: [0, 1, 0] },
    exit: { position: [0, 0, 1], tangent: [0, 0, 1], up: [0, 1, 0] },
    route: [
      [0, 0, 0],
      [0, 0, 1],
    ],
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
  },
};

const step: KinematicStep = (_spec, tSeconds) => {
  const halfAngle = tSeconds * 0.75;
  return [
    {
      id: "paddle",
      position: [0, 0.1, 0.3],
      rotation: [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)],
    },
  ];
};

function expectTupleClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], 5);
  });
}

beforeAll(async () => {
  await RAPIER.init();
});

describe("kinematic renderer and Validator agreement", () => {
  it("evaluates the same fixed-step transform and applies it to the same body state", () => {
    let clock = INITIAL_KINEMATIC_CLOCK;
    for (let index = 0; index < 3; index += 1) {
      clock = advanceKinematicClock(clock);
    }
    const tSeconds = kinematicSeconds(clock);
    const rendererTransforms = kinematicTransformsAt(step, spec, tSeconds);
    const validatorTransforms = step(spec, tSeconds);
    expect(rendererTransforms).toEqual(validatorTransforms);

    const builtWorld = buildWorld([spec]);
    const paddle = builtWorld.kinematicBodies.get("paddle");
    if (paddle === undefined) {
      throw new Error("expected paddle kinematic body");
    }
    applyStep(validatorTransforms, builtWorld.kinematicBodies);
    builtWorld.world.step();

    const expected = rendererTransforms[0];
    if (expected?.position === undefined || expected.rotation === undefined) {
      throw new Error("expected the renderer transform to move and rotate the paddle");
    }
    const translation = paddle.translation();
    const rotation = paddle.rotation();
    expectTupleClose([translation.x, translation.y, translation.z], expected.position);
    expectTupleClose([rotation.x, rotation.y, rotation.z, rotation.w], expected.rotation);

    builtWorld.world.free();
  });

  it("converts local collider transforms through a scene anchor without changing the visual local transform", () => {
    const local = { id: "paddle", position: [0, 0.1, 0.3] as const, rotation: IDENTITY_ROTATION };
    const world = transformForAnchor(local, {
      position: [1, 2, 3],
      rotation: [0, Math.sqrt(0.5), 0, Math.sqrt(0.5)],
    });

    expectTupleClose(world.position ?? [], [1.3, 2.1, 3]);
    expectTupleClose(world.rotation ?? [], [0, Math.sqrt(0.5), 0, Math.sqrt(0.5)]);
    expect(local).toEqual({
      id: "paddle",
      position: [0, 0.1, 0.3],
      rotation: IDENTITY_ROTATION,
    });
  });

  it("applies Start and connector transforms identically at fixed Course steps", () => {
    const course = assembleCourse(29);
    const builtWorld = buildWorld([course.start, ...course.connectors.map(({ spec }) => spec)]);
    for (const stepCount of [0, 1, 6, 30]) {
      const tSeconds = stepCount * KINEMATIC_FIXED_STEP_SECONDS;
      const liveTransforms = [
        ...kinematicTransformsAt(stepStartGate, course.start, tSeconds),
        ...course.connectors.flatMap(({ spec }) => stepRotatingSpec(spec, tSeconds)),
      ];
      const headlessTransforms = stepCourse(course, tSeconds);
      expect(headlessTransforms).toEqual(liveTransforms);
      expect(stepCourse(course, tSeconds)).toEqual(headlessTransforms);

      applyStep(headlessTransforms, builtWorld.kinematicBodies);
      builtWorld.world.step();
      for (const transform of liveTransforms) {
        const body = builtWorld.kinematicBodies.get(transform.id);
        if (!body || !transform.position || !transform.rotation) {
          throw new Error(`expected complete kinematic transform for ${transform.id}`);
        }
        const translation = body.translation();
        const rotation = body.rotation();
        expectTupleClose([translation.x, translation.y, translation.z], transform.position);
        expectTupleClose([rotation.x, rotation.y, rotation.z, rotation.w], transform.rotation);
      }
    }
    builtWorld.world.free();
  });
});
