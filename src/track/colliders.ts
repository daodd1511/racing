import RAPIER from "@dimforge/rapier3d-compat";

import type { TrackBox, TrackDefinition } from "./definition";

function colliderDescForShape(box: TrackBox): RAPIER.ColliderDesc {
  switch (box.shape.kind) {
    case "cuboid":
      return RAPIER.ColliderDesc.cuboid(
        box.shape.halfExtents[0],
        box.shape.halfExtents[1],
        box.shape.halfExtents[2],
      );
    case "cylinder":
      return RAPIER.ColliderDesc.cylinder(box.shape.halfHeight, box.shape.radius);
    case "ball":
      return RAPIER.ColliderDesc.ball(box.shape.radius);
  }
}

function attachBoxCollider(world: RAPIER.World, box: TrackBox): void {
  const rigidBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(box.center[0], box.center[1], box.center[2])
      .setRotation({
        x: box.rotation[0],
        y: box.rotation[1],
        z: box.rotation[2],
        w: box.rotation[3],
      }),
  );
  const collider = colliderDescForShape(box)
    .setRestitution(box.material.restitution)
    .setFriction(box.material.friction);

  world.createCollider(collider, rigidBody);
}

export function attachTrackColliders(world: RAPIER.World, track: TrackDefinition): void {
  const surfaceBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      new Float32Array(track.surface.vertices),
      new Uint32Array(track.surface.indices),
    )
      .setRestitution(track.surface.material.restitution)
      .setFriction(track.surface.material.friction),
    surfaceBody,
  );

  for (const box of track.boxes) {
    attachBoxCollider(world, box);
  }
}
