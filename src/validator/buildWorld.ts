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

function attachCollider(world: RAPIER.World, spec: ColliderSpec): void {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
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
    .setFriction(spec.material.friction);

  world.createCollider(desc, body);
}

/** Builds a fresh Rapier world from one or more Modules' `Spec`s, with every
 * collider attached as a fixed body. Assumes `RAPIER.init()` has already
 * resolved -- callers (`validateModule`) own that. */
export function buildWorld(specs: readonly Spec[]): RAPIER.World {
  const world = new RAPIER.World({
    x: SCALE.gravity[0],
    y: SCALE.gravity[1],
    z: SCALE.gravity[2],
  });

  for (const spec of specs) {
    for (const collider of spec.colliders) {
      attachCollider(world, collider);
    }
  }

  return world;
}
