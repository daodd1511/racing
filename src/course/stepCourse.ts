import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";

import { ALL_MODULES } from "../modules/registry";
import type { KinematicTransform, Spec } from "../modules/types";
import type { Quaternion, Vector3 } from "../race/types";
import { stepStartGate } from "./startFinish";
import type { Course } from "./types";

interface CourseMotionPlan {
  readonly modules: readonly {
    readonly spec: Spec;
    readonly step: (spec: Spec, tSeconds: number) => readonly KinematicTransform[];
  }[];
  readonly connectors: readonly Spec[];
}

const motionPlans = new WeakMap<Course, CourseMotionPlan>();

function hasKinematicCollider(spec: Spec): boolean {
  return spec.colliders.some(({ kinematic }) => kinematic === true);
}

function motionPlanFor(course: Course): CourseMotionPlan {
  const cached = motionPlans.get(course);
  if (cached !== undefined) return cached;

  const modules = course.modules.flatMap(({ moduleId, spec }) => {
    const module = ALL_MODULES.find(({ id }) => id === moduleId);
    if (!module) {
      throw new Error(`Course references unknown Module ${moduleId}`);
    }
    if (!hasKinematicCollider(spec)) return [];
    return [{ spec, step: module.step }];
  });
  const connectors = course.connectors.flatMap(({ spec }) =>
    hasKinematicCollider(spec) ? [spec] : [],
  );
  const plan = { modules, connectors };
  motionPlans.set(course, plan);
  return plan;
}

function vector(value: ThreeVector3): Vector3 {
  return [value.x, value.y, value.z];
}

function quaternion(value: ThreeQuaternion): Quaternion {
  return [value.x, value.y, value.z, value.w];
}

export function stepRotatingSpec(spec: Spec, tSeconds: number): readonly KinematicTransform[] {
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
  const plan = motionPlanFor(course);
  for (const module of plan.modules) {
    transforms.push(...module.step(module.spec, tSeconds));
  }
  for (const connector of plan.connectors) {
    transforms.push(...stepRotatingSpec(connector, tSeconds));
  }
  return transforms;
}
