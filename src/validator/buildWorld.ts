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

interface AttachedCollider {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
}

function attachCollider(world: RAPIER.World, spec: ColliderSpec): AttachedCollider {
  const body = world.createRigidBody(
    (spec.kinematic ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed())
      .setTranslation(spec.position[0], spec.position[1], spec.position[2])
      .setRotation({
        x: spec.rotation[0],
        y: spec.rotation[1],
        z: spec.rotation[2],
        w: spec.rotation[3],
      }),
  );
  const desc = colliderDescForShape(spec.shape)
    .setRestitution(spec.material.restitution)
    .setFriction(spec.material.friction)
    .setSensor(spec.sensor ?? false);
  if (spec.sensor) {
    desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  }

  return { body, collider: world.createCollider(desc, body) };
}

export interface BuiltWorld {
  readonly world: RAPIER.World;
  readonly kinematicBodies: ReadonlyMap<string, RAPIER.RigidBody>;
  readonly colliders: ReadonlyMap<string, RAPIER.Collider>;
}

/** Builds a fresh Rapier world from one or more Modules' `Spec`s. Each
 * kinematic collider receives its own position-based body, addressable by
 * `ColliderSpec.id`; all other colliders stay fixed. Assumes `RAPIER.init()`
 * has already resolved -- callers (`validateModule`) own that. */
export function buildWorld(specs: readonly Spec[]): BuiltWorld {
  const world = new RAPIER.World({
    x: SCALE.gravity[0],
    y: SCALE.gravity[1],
    z: SCALE.gravity[2],
  });
  const kinematicBodies = new Map<string, RAPIER.RigidBody>();
  const colliders = new Map<string, RAPIER.Collider>();

  for (const spec of specs) {
    for (const collider of spec.colliders) {
      const attached = attachCollider(world, collider);
      colliders.set(collider.id, attached.collider);
      if (collider.kinematic) {
        kinematicBodies.set(collider.id, attached.body);
      }
    }
  }

  return { world, kinematicBodies, colliders };
}
