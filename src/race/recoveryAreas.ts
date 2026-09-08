import { Quaternion, Vector3 as ThreeVector3 } from "three";
import type { RecoveryBox } from "../modules/types";
import type { Vector3 } from "./types";

interface PreparedBox {
  readonly box: RecoveryBox;
  readonly inverse: Quaternion;
}

const prepared = new WeakMap<readonly RecoveryBox[], readonly PreparedBox[]>();
const BOUNDARY_EPSILON = 1e-9;

/** Collections are immutable Spec data; placement produces a new collection. */
export function containsRecoveryPoint(boxes: readonly RecoveryBox[], position: Vector3): boolean {
  if (boxes.length === 0) return false;
  let cached = prepared.get(boxes);
  if (!cached) {
    cached = boxes.map((box) => {
      if (
        ![...box.position, ...box.rotation, ...box.halfExtents].every(Number.isFinite) ||
        box.halfExtents.some((extent) => extent <= 0) ||
        Math.hypot(...box.rotation) === 0
      ) {
        throw new Error(
          "Recovery boxes require finite transforms, a nonzero rotation and positive half-extents",
        );
      }
      return { box, inverse: new Quaternion(...box.rotation).normalize().invert() };
    });
    prepared.set(boxes, cached);
  }
  const local = new ThreeVector3();
  return cached.some(({ box, inverse }) => {
    local
      .set(
        position[0] - box.position[0],
        position[1] - box.position[1],
        position[2] - box.position[2],
      )
      .applyQuaternion(inverse);
    return (
      Math.abs(local.x) <= box.halfExtents[0] + BOUNDARY_EPSILON &&
      Math.abs(local.y) <= box.halfExtents[1] + BOUNDARY_EPSILON &&
      Math.abs(local.z) <= box.halfExtents[2] + BOUNDARY_EPSILON
    );
  });
}
