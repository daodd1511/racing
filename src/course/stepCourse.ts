import { ALL_MODULES } from "../modules/registry";
import type { KinematicTransform } from "../modules/types";
import { stepStartGate } from "./startFinish";
import type { Course } from "./types";

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
  return transforms;
}
