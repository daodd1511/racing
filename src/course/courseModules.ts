import type { ParamValues } from "../modules/params";
import { ALL_MODULES, type RegisteredModule } from "../modules/registry";
import type { Role } from "../modules/types";

export { COURSE_GRADE } from "../modules/registry";

export const COURSE_MODULES: readonly RegisteredModule[] = ALL_MODULES.filter(
  (module) => module.course !== undefined,
);

export function courseModulesByRole(role: Role): readonly RegisteredModule[] {
  return COURSE_MODULES.filter((module) => module.role === role);
}

export function courseParamValues(module: RegisteredModule): ParamValues {
  if (!module.course) throw new Error(`Module ${module.id} has no Course defaults`);
  return module.course.defaults;
}
