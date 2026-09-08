import { assembleCourse } from "../course/assembleCourse";
import { parseModuleSettings } from "./settings";
import type { ModuleSettings } from "./types";

/** Geometry-only preflight through the same Assembler; assembly never calls this function. */
export function validateCourseSettings(settings: ModuleSettings): void {
  assembleCourse(0, { source: "authored", settings: parseModuleSettings(settings) });
}
