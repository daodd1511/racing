import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";

import { assembleCourse } from "../course/assembleCourse";
import { assignStartPositions } from "../race/startAssignment";
import { buildCourseWorld } from "./buildCourseWorld";

beforeAll(async () => {
  await RAPIER.init();
});

describe("buildCourseWorld", () => {
  it("builds one shared Course with finite sensors and ordered marble bodies", () => {
    const course = assembleCourse(17);
    const assignments = assignStartPositions(29, 15);
    const built = buildCourseWorld(course, assignments);

    expect(built.marbleBodies.size).toBe(15);
    expect(built.marbleIndicesByColliderHandle.size).toBe(15);
    expect(built.checkpointSensorIds).toHaveLength(course.checkpoints.length);
    expect(
      built.colliderIdsByHandle.has(
        built.world.getCollider(
          [...built.colliderIdsByHandle].find(([, id]) => id === built.finishSensorId)![0],
        )!.handle,
      ),
    ).toBe(true);
    for (const sensorId of [...built.checkpointSensorIds, built.finishSensorId]) {
      const handle = [...built.colliderIdsByHandle].find(([, id]) => id === sensorId)?.[0];
      expect(handle).toBeDefined();
      expect(built.world.getCollider(handle!)?.isSensor()).toBe(true);
    }
    assignments.forEach(({ marbleIndex }) => {
      const body = built.marbleBodies.get(marbleIndex);
      expect(body).toBeDefined();
      const translation = body!.translation();
      expect([translation.x, translation.y, translation.z].every(Number.isFinite)).toBe(true);
    });

    built.eventQueue.free();
    built.world.free();
  });

  it("rejects missing and out-of-order assignments", () => {
    const course = assembleCourse(17);
    expect(() => buildCourseWorld(course, [])).toThrow(/assignments/);
    expect(() => buildCourseWorld(course, assignStartPositions(1, 2).toReversed())).toThrow(
      /assignments/,
    );
  });
});
