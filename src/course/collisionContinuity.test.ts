import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { Vector3 as ThreeVector3 } from "three";

import { FLOOR_THICKNESS } from "../modules/geometry/channel";
import { SCALE } from "../race/scale";
import { assignStartPositions } from "../race/startAssignment";
import { applyStep } from "../validator/applyStep";
import { buildCourseWorld } from "../validator/buildCourseWorld";
import { buildWorld } from "../validator/buildWorld";
import { assembleCourse } from "./assembleCourse";
import { stepCourse } from "./stepCourse";

beforeAll(async () => {
  await RAPIER.init();
});

describe("Course collision continuity", () => {
  it("keeps every connector exit below the visible-kick threshold", () => {
    const course = assembleCourse(3452377378);
    const moduleBySlot = new Map(course.modules.map((module) => [module.slotIndex, module]));
    const samples = course.connectors
      .flatMap((connector) => {
        const nextSpec =
          connector.toSlotIndex === course.checkpoints.length - 1
            ? course.finish
            : moduleBySlot.get(connector.toSlotIndex)?.spec;
        return nextSpec
          ? [
              {
                seam: `connector->${connector.toSlotIndex}`,
                specs: [connector.spec, nextSpec] as const,
                anchor: connector.spec.footprint.exit,
              },
            ]
          : [];
      })
      .map(({ seam, specs, anchor }) => {
        const built = buildWorld(specs);
        built.world.timestep = 1 / 60;
        const tangent = new ThreeVector3(...anchor.tangent).normalize();
        const up = new ThreeVector3(...anchor.up).normalize();
        const start = new ThreeVector3(...anchor.position)
          .addScaledVector(tangent, -SCALE.marbleRadius * 3)
          .addScaledVector(up, SCALE.marbleRadius + FLOOR_THICKNESS / 2);
        const body = built.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(start.x, start.y, start.z)
            .setLinvel(tangent.x * 1.5, tangent.y * 1.5, tangent.z * 1.5)
            .setCcdEnabled(true),
        );
        built.world.createCollider(
          RAPIER.ColliderDesc.ball(SCALE.marbleRadius)
            .setRestitution(SCALE.defaultRestitution)
            .setFriction(SCALE.defaultFriction),
          body,
        );

        let previousVelocity = body.linvel();
        let maximumUpwardImpulse = Number.NEGATIVE_INFINITY;
        let maximumDirectionChange = Number.NEGATIVE_INFINITY;
        for (let step = 0; step < 6; step += 1) {
          built.world.step();
          const position = body.translation();
          const velocity = body.linvel();
          const boundaryDistance =
            (position.x - anchor.position[0]) * tangent.x +
            (position.y - anchor.position[1]) * tangent.y +
            (position.z - anchor.position[2]) * tangent.z;
          if (Math.abs(boundaryDistance) <= SCALE.marbleRadius * 3) {
            maximumUpwardImpulse = Math.max(
              maximumUpwardImpulse,
              (velocity.x - previousVelocity.x) * up.x +
                (velocity.y - previousVelocity.y) * up.y +
                (velocity.z - previousVelocity.z) * up.z,
            );
            const previousDirection = new ThreeVector3(
              previousVelocity.x,
              previousVelocity.y,
              previousVelocity.z,
            ).normalize();
            maximumDirectionChange = Math.max(
              maximumDirectionChange,
              previousDirection.angleTo(
                new ThreeVector3(velocity.x, velocity.y, velocity.z).normalize(),
              ),
            );
          }
          previousVelocity = velocity;
        }
        built.world.free();
        return { seam, maximumUpwardImpulse, maximumDirectionChange };
      });

    expect(samples.length).toBeGreaterThan(0);
    const diagnostics = JSON.stringify(samples, null, 2);
    expect(
      Math.max(...samples.map(({ maximumUpwardImpulse }) => maximumUpwardImpulse)),
      diagnostics,
    ).toBeLessThan(0.05);
    expect(
      Math.max(...samples.map(({ maximumDirectionChange }) => maximumDirectionChange)),
      diagnostics,
    ).toBeLessThan(0.07);
  });

  it("does not launch a packed field upward at hairpin rail contacts", () => {
    const seed = 3445150921;
    const course = assembleCourse(seed);
    const built = buildCourseWorld(course, assignStartPositions(seed, 15));
    let maximum:
      | {
          readonly elapsedSeconds: number;
          readonly marbleIndex: number;
          readonly colliderId: string;
          readonly yVelocity: number;
        }
      | undefined;

    for (let step = 1; step <= 35 * 60; step += 1) {
      const elapsedSeconds = step / 60;
      applyStep(stepCourse(course, elapsedSeconds), built.kinematicBodies);
      built.world.step(built.eventQueue);
      built.eventQueue.drainContactForceEvents((event) => {
        const handles = [event.collider1(), event.collider2()];
        const marbleHandle = handles.find((handle) =>
          built.marbleIndicesByColliderHandle.has(handle),
        );
        const courseHandle = handles.find(
          (handle) => !built.marbleIndicesByColliderHandle.has(handle),
        );
        if (marbleHandle === undefined || courseHandle === undefined) return;
        const colliderId = built.colliderIdsByHandle.get(courseHandle);
        if (!colliderId?.startsWith("connector-")) return;
        const marbleIndex = built.marbleIndicesByColliderHandle.get(marbleHandle)!;
        const yVelocity = built.marbleBodies.get(marbleIndex)!.linvel().y;
        if (maximum === undefined || yVelocity > maximum.yVelocity) {
          maximum = { elapsedSeconds, marbleIndex, colliderId, yVelocity };
        }
      });
      built.eventQueue.drainCollisionEvents(() => {});
    }

    built.eventQueue.free();
    built.world.free();
    expect(maximum).toBeDefined();
    expect(maximum!.yVelocity, JSON.stringify(maximum, null, 2)).toBeLessThan(0.08);
  }, 30_000);
});
