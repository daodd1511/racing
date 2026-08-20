import type RAPIER from "@dimforge/rapier3d-compat";

import type { KinematicTransform } from "../modules/types";

/** Writes a Module's next pure transform into the kinematic bodies created
 * from the same `Spec`. Unknown ids deliberately do nothing: one transform
 * can target both a collider and its matching live visual, while the
 * Validator owns colliders only. Omitted position/rotation fields retain the
 * body's prior value, as `KinematicTransform` promises. */
export function applyStep(
  transforms: readonly KinematicTransform[],
  bodies: ReadonlyMap<string, RAPIER.RigidBody>,
): void {
  for (const transform of transforms) {
    const body = bodies.get(transform.id);
    if (body === undefined) {
      continue;
    }
    if (transform.position !== undefined) {
      body.setNextKinematicTranslation({
        x: transform.position[0],
        y: transform.position[1],
        z: transform.position[2],
      });
    }
    if (transform.rotation !== undefined) {
      body.setNextKinematicRotation({
        x: transform.rotation[0],
        y: transform.rotation[1],
        z: transform.rotation[2],
        w: transform.rotation[3],
      });
    }
  }
}
