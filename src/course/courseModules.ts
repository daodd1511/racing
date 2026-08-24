import { defaultParamValues, type ParamValues } from "../modules/params";
import { ALL_MODULES, type RegisteredModule } from "../modules/registry";
import type { Role } from "../modules/types";
import { SCALE } from "../race/scale";

// The Showcase owns each Module's isolated tuning. The Course uses only
// obstacles that can sit on a continuous channel and gives every one the
// same gentle downhill grade instead of inheriting its Showcase drop.
export const COURSE_GRADE = 0.12;

const COURSE_MODULE_IDS = new Set(["chute", "pin-field", "whoops", "staircase"]);

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
      length: 2.4,
      wavelength: 0.4,
    });
  }
  if (module.id === "staircase") {
    return Object.freeze({
      ...defaults,
      stepCount: 10,
      tread: 0.2,
      riseHeight: SCALE.marbleRadius * 3,
    });
  }
  return Object.freeze({ ...defaults, courseGrade: COURSE_GRADE });
}
