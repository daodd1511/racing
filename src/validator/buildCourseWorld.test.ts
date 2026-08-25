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
    const firstPosition = built.marbleBodies.get(0)!.translation();
    expect(firstPosition.y).toBeCloseTo(course.entry.position[1] + assignments[0].position[1], 6);

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

  it("does not subscribe marbles to contact-force events when collection is disabled", () => {
    const built = buildCourseWorld(assembleCourse(17), assignStartPositions(29, 2), false);

    for (const handle of built.marbleIndicesByColliderHandle.keys()) {
      expect(built.world.getCollider(handle)?.activeEvents()).toBe(
        RAPIER.ActiveEvents.COLLISION_EVENTS,
      );
    }

    built.eventQueue.free();
    built.world.free();
  });
});
