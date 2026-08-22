import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import type {
  Anchor,
  ColliderSpec,
  Footprint,
  KinematicRotationMotion,
  Spec,
  VisualSpec,
} from "../modules/types";
import type { Quaternion, Vector3 } from "../race/types";
import type { CoursePlacement } from "./types";

function toVector(vector: ThreeVector3): Vector3 {
  return [vector.x, vector.y, vector.z];
}

function toQuaternion(quaternion: ThreeQuaternion): Quaternion {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function placementQuaternion(placement: CoursePlacement): ThreeQuaternion {
  const rotation = new ThreeQuaternion(...placement.rotation);
  if (rotation.lengthSq() === 0) {
    throw new Error("Course placement rotation must be non-zero");
  }
  return rotation.normalize();
}

function transformPoint(
  point: Vector3,
  placement: CoursePlacement,
  rotation: ThreeQuaternion,
): Vector3 {
  return toVector(
    new ThreeVector3(...point)
      .applyQuaternion(rotation)
      .add(new ThreeVector3(...placement.position)),
  );
}

function transformDirection(direction: Vector3, rotation: ThreeQuaternion): Vector3 {
  return toVector(new ThreeVector3(...direction).applyQuaternion(rotation).normalize());
}

function transformRotation(local: Quaternion, placement: ThreeQuaternion): Quaternion {
  const rotation = new ThreeQuaternion(...local);
  if (rotation.lengthSq() === 0) {
    throw new Error("Spec rotation must be non-zero");
  }
  return toQuaternion(placement.clone().multiply(rotation.normalize()).normalize());
}

function transformAnchor(
  anchor: Anchor,
  placement: CoursePlacement,
  rotation: ThreeQuaternion,
): Anchor {
  return {
    position: transformPoint(anchor.position, placement, rotation),
    tangent: transformDirection(anchor.tangent, rotation),
    up: transformDirection(anchor.up, rotation),
  };
}

function transformMotion(
  motion: KinematicRotationMotion,
  placement: CoursePlacement,
  rotation: ThreeQuaternion,
): KinematicRotationMotion {
  return {
    ...motion,
    axis: transformDirection(motion.axis, rotation),
    pivot: transformPoint(motion.pivot, placement, rotation),
  };
}

function transformBounds(
  bounds: Footprint["bounds"],
  placement: CoursePlacement,
  rotation: ThreeQuaternion,
): Footprint["bounds"] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const point = transformPoint([x, y, z], placement, rotation);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], point[axis]);
          max[axis] = Math.max(max[axis], point[axis]);
        }
      }
    }
  }

  return { min, max };
}

function namespacedId(idPrefix: string, id: string): string {
  if (idPrefix.length === 0) {
    throw new Error("transformSpec requires a non-empty idPrefix");
  }
  return `${idPrefix}:${id}`;
}

function transformCollider(
  collider: ColliderSpec,
  placement: CoursePlacement,
  rotation: ThreeQuaternion,
  idPrefix: string,
): ColliderSpec {
  return {
    ...collider,
    id: namespacedId(idPrefix, collider.id),
    position: transformPoint(collider.position, placement, rotation),
    rotation: transformRotation(collider.rotation, rotation),
    motion:
      collider.motion === undefined
        ? undefined
        : transformMotion(collider.motion, placement, rotation),
  };
}

function transformVisual(
  visual: VisualSpec,
  placement: CoursePlacement,
  rotation: ThreeQuaternion,
  idPrefix: string,
): VisualSpec {
  return {
    ...visual,
    id: namespacedId(idPrefix, visual.id),
    position: transformPoint(visual.position, placement, rotation),
    rotation: transformRotation(visual.rotation, rotation),
  };
}

export function transformSpec(spec: Spec, placement: CoursePlacement, idPrefix: string): Spec {
  const rotation = placementQuaternion(placement);
  return {
    colliders: spec.colliders.map((collider) =>
      transformCollider(collider, placement, rotation, idPrefix),
    ),
    visuals: spec.visuals.map((visual) => transformVisual(visual, placement, rotation, idPrefix)),
    footprint: {
      cells: [...spec.footprint.cells],
      entry: transformAnchor(spec.footprint.entry, placement, rotation),
      exit: transformAnchor(spec.footprint.exit, placement, rotation),
      route: spec.footprint.route.map((point) => transformPoint(point, placement, rotation)),
      bounds: transformBounds(spec.footprint.bounds, placement, rotation),
    },
  };
}
