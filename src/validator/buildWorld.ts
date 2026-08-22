import RAPIER from "@dimforge/rapier3d-compat";

import type { ColliderSpec, Shape, Spec } from "../modules/types";
import { SCALE } from "../race/scale";

// Translates `ColliderSpec`s into a raw Rapier world -- no React, no
// `@react-three/rapier` -- per ADR 0002. This is the Validator's own
// construction path, independent of Phase 3's `<ModuleColliders>` renderer;
// both consume the same `Spec`, which is what keeps them honest.

function colliderDescForShape(shape: Shape): RAPIER.ColliderDesc {
  switch (shape.kind) {
    case "cuboid":
      return RAPIER.ColliderDesc.cuboid(
        shape.halfExtents[0],
        shape.halfExtents[1],
        shape.halfExtents[2],
      );
    case "cylinder":
      return RAPIER.ColliderDesc.cylinder(shape.halfHeight, shape.radius);
    case "ball":
      return RAPIER.ColliderDesc.ball(shape.radius);
    case "trimesh":
      return RAPIER.ColliderDesc.trimesh(
        new Float32Array(shape.vertices),
        new Uint32Array(shape.indices),
      );
  }
}

function colliderDesc(spec: ColliderSpec, relativeToSharedBody: boolean): RAPIER.ColliderDesc {
  const desc = colliderDescForShape(spec.shape)
    .setRestitution(spec.material.restitution)
    .setFriction(spec.material.friction)
    .setSensor(spec.sensor ?? false);
  if (relativeToSharedBody) {
    desc.setTranslation(spec.position[0], spec.position[1], spec.position[2]).setRotation({
      x: spec.rotation[0],
      y: spec.rotation[1],
      z: spec.rotation[2],
      w: spec.rotation[3],
    });
  }
  if (spec.sensor) {
    desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  }
  return desc;
}

function attachKinematicCollider(
  world: RAPIER.World,
  spec: ColliderSpec,
): { readonly body: RAPIER.RigidBody; readonly collider: RAPIER.Collider } {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spec.position[0], spec.position[1], spec.position[2])
      .setRotation({
        x: spec.rotation[0],
        y: spec.rotation[1],
        z: spec.rotation[2],
        w: spec.rotation[3],
      }),
  );
  return { body, collider: world.createCollider(colliderDesc(spec, false), body) };
}

export interface BuiltWorld {
  readonly world: RAPIER.World;
  readonly kinematicBodies: ReadonlyMap<string, RAPIER.RigidBody>;
  readonly colliders: ReadonlyMap<string, RAPIER.Collider>;
}

/** Builds a fresh Rapier world from one or more Modules' `Spec`s. Each Spec's
 * static colliders share one fixed body, matching ModuleColliders; every
 * kinematic collider receives its own addressable position-based body.
 * Assumes `RAPIER.init()` has already resolved -- callers own that. */
export function buildWorld(specs: readonly Spec[]): BuiltWorld {
  const world = new RAPIER.World({
    x: SCALE.gravity[0],
    y: SCALE.gravity[1],
    z: SCALE.gravity[2],
  });
  const kinematicBodies = new Map<string, RAPIER.RigidBody>();
  const colliders = new Map<string, RAPIER.Collider>();

  for (const spec of specs) {
    const staticColliders = spec.colliders.filter((collider) => !collider.kinematic);
    const fixedBody =
      staticColliders.length > 0 ? world.createRigidBody(RAPIER.RigidBodyDesc.fixed()) : undefined;
    for (const collider of spec.colliders) {
      if (collider.kinematic) {
        const attached = attachKinematicCollider(world, collider);
        colliders.set(collider.id, attached.collider);
        kinematicBodies.set(collider.id, attached.body);
      } else if (fixedBody) {
        colliders.set(collider.id, world.createCollider(colliderDesc(collider, true), fixedBody));
      }
    }
  }

  return { world, kinematicBodies, colliders };
}
