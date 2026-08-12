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
  for (const box of track.boxes) {
    attachBoxCollider(world, box);
  }

  for (const peg of track.pegs) {
    const rigidBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(peg.center[0], peg.center[1], peg.center[2]),
    );
    const collider = RAPIER.ColliderDesc.ball(peg.radius)
      .setRestitution(peg.material.restitution)
      .setFriction(peg.material.friction);

    world.createCollider(collider, rigidBody);
  }
}
