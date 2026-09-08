import type { ModuleId, ModuleSettings } from "../assets/types";
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

export function courseParamValues(
  module: RegisteredModule,
  settings?: ModuleSettings,
): ParamValues {
  if (!module.course) throw new Error(`Module ${module.id} has no Course defaults`);
  if (settings) {
    if (!Object.hasOwn(settings, module.id)) throw new Error(`Missing settings for ${module.id}`);
    return { ...settings[module.id as ModuleId] };
  }
  return module.course.defaults;
}
