import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { Vector3 as ThreeVector3 } from "three";

import { FLOOR_THICKNESS } from "../modules/geometry/channel";
import { SCALE } from "../race/scale";
import { buildWorld } from "../validator/buildWorld";
import { assembleCourse } from "./assembleCourse";

beforeAll(async () => {
  await RAPIER.init();
});

describe("Course collision continuity", () => {
  it("keeps smooth-entry Module transitions below the visible-kick threshold", () => {
    const course = assembleCourse(3452377378);
    const smoothEntryModuleIds = new Set(["chute", "pin-field", "staircase"]);
    const moduleBySlot = new Map(
      course.modules
        .filter(({ moduleId }) => smoothEntryModuleIds.has(moduleId))
        .map((module) => [module.slotIndex, module]),
    );
    const samples = course.connectors.flatMap((connector) => {
      const nextModule = moduleBySlot.get(connector.toSlotIndex);
      if (!nextModule) return [];

      const built = buildWorld([connector.spec, nextModule.spec]);
      built.world.timestep = 1 / 60;
      const anchor = connector.spec.footprint.exit;
      const tangent = new ThreeVector3(...anchor.tangent).normalize();
      const up = new ThreeVector3(...anchor.up).normalize();
      const start = new ThreeVector3(...anchor.position)
        .addScaledVector(tangent, -SCALE.marbleRadius * 6)
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
      for (let step = 0; step < 12; step += 1) {
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
      return [
        {
          connector: connector.id,
          module: nextModule.moduleId,
          maximumUpwardImpulse,
          maximumDirectionChange,
        },
      ];
    });

    expect(samples.length).toBeGreaterThan(0);
    const diagnostics = JSON.stringify(samples, null, 2);
    expect(
      Math.max(...samples.map(({ maximumUpwardImpulse }) => maximumUpwardImpulse)),
      diagnostics,
    ).toBeLessThan(0.02);
    expect(
      Math.max(...samples.map(({ maximumDirectionChange }) => maximumDirectionChange)),
      diagnostics,
    ).toBeLessThan(0.07);
  });
});
