import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { ALL_MODULES } from "../modules/registry";
import type { KinematicTransform, Spec } from "../modules/types";
import type { Quaternion, Vector3 } from "../race/types";
import { stepStartGate } from "./startFinish";
import type { Course } from "./types";

function vector(value: ThreeVector3): Vector3 {
  return [value.x, value.y, value.z];
}

function quaternion(value: ThreeQuaternion): Quaternion {
  return [value.x, value.y, value.z, value.w];
}

function stepRotatingSpec(spec: Spec, tSeconds: number): readonly KinematicTransform[] {
  return spec.colliders.flatMap((collider) => {
    const motion = collider.motion;
    if (!collider.kinematic || motion?.kind !== "rotation") return [];
    const delta = new ThreeQuaternion().setFromAxisAngle(
      new ThreeVector3(...motion.axis),
      motion.angularVelocity * tSeconds,
    );
    const pivot = new ThreeVector3(...motion.pivot);
    const position = new ThreeVector3(...collider.position)
      .sub(pivot)
      .applyQuaternion(delta)
      .add(pivot);
    const rotation = delta.multiply(new ThreeQuaternion(...collider.rotation)).normalize();
    return [{ id: collider.id, position: vector(position), rotation: quaternion(rotation) }];
  });
}

export function stepCourse(course: Course, tSeconds: number): readonly KinematicTransform[] {
  if (!Number.isFinite(tSeconds)) {
    throw new Error("Course step time must be finite");
  }

  const transforms: KinematicTransform[] = [...stepStartGate(course.start, tSeconds)];
  for (const placed of course.modules) {
    const module = ALL_MODULES.find(({ id }) => id === placed.moduleId);
    if (!module) {
      throw new Error(`Course references unknown Module ${placed.moduleId}`);
    }
    transforms.push(...module.step(placed.spec, tSeconds));
  }
  for (const connector of course.connectors) {
    transforms.push(...stepRotatingSpec(connector.spec, tSeconds));
  }
  return transforms;
}
