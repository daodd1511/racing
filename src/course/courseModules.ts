import { defaultParamValues, type ParamValues } from "../modules/params";
import { ALL_MODULES, type RegisteredModule } from "../modules/registry";
import type { Role } from "../modules/types";
import { SCALE } from "../race/scale";

// The Showcase owns each Module's isolated tuning. The Course uses only
// obstacles that can sit on a continuous channel and gives every one the
// same gentle downhill grade instead of inheriting its Showcase drop.
export const COURSE_GRADE = 0.12;

const COURSE_MODULE_IDS = new Set([
  "chute",
  "pin-field",
  "whoops",
  "staircase",
  "funnel-choke",
  "windmill",
]);

export const COURSE_MODULES: readonly RegisteredModule[] = ALL_MODULES.filter(({ id }) =>
  COURSE_MODULE_IDS.has(id),
);

export function courseModulesByRole(role: Role): readonly RegisteredModule[] {
  return COURSE_MODULES.filter((module) => module.role === role);
}

export function courseParamValues(module: RegisteredModule): ParamValues {
  const defaults = defaultParamValues(module.meta.params);
  if (module.id === "chute") {
    return Object.freeze({ ...defaults, grade: COURSE_GRADE });
  }
  if (module.id === "whoops") {
    return Object.freeze({
      ...defaults,
      amplitude: SCALE.marbleRadius,
      grade: COURSE_GRADE,
      length: 1.8,
    });
  }
  if (module.id === "staircase") {
    return Object.freeze({
      ...defaults,
      stepCount: 8,
      tread: 0.16,
      riseHeight: SCALE.marbleRadius * 2,
    });
  }
  if (module.id === "funnel-choke") {
    return Object.freeze({
      ...defaults,
      throatWidth: SCALE.marbleRadius * 6,
      length: 1.8,
      courseApproachRun: 1.15,
      courseThroatRun: 0.35,
      courseFlareRun: 0.25,
      courseGrade: COURSE_GRADE,
    });
  }
  if (module.id === "windmill") {
    return Object.freeze({
      ...defaults,
      bladeCount: 4,
      angularVelocity: 1.8,
      courseGrade: COURSE_GRADE,
    });
  }
  return Object.freeze({ ...defaults, courseGrade: COURSE_GRADE });
}
