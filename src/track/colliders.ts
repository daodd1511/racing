import RAPIER from "@dimforge/rapier3d-compat";

import type { TrackBox, TrackDefinition } from "./definition";

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
  const collider = RAPIER.ColliderDesc.cuboid(
    box.halfExtents[0],
    box.halfExtents[1],
    box.halfExtents[2],
  )
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

  for (const bumper of track.bumpers) {
    const rigidBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        bumper.center[0],
        bumper.center[1],
        bumper.center[2],
      ),
    );
    const collider = RAPIER.ColliderDesc.ball(bumper.radius)
      .setRestitution(bumper.material.restitution)
      .setFriction(bumper.material.friction);

    world.createCollider(collider, rigidBody);
  }
}
