import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { defaultParamValues, type ParamValues } from "../src/modules/params";
import { ALL_MODULES, type RegisteredModule } from "../src/modules/registry";
import {
  enumerateParamConfigurations,
  validateModule,
  type ModuleValidationReport,
  type ValidationMatrix,
} from "../src/validator/validateModule";

export const UNFROZEN_THRESHOLD_VERSION = "unfrozen";

export interface ValidateModulesCliOptions {
  readonly matrix: ValidationMatrix;
  readonly moduleId: string | null;
  readonly reportPath: string | null;
  readonly allParams: boolean;
  readonly verifyThresholds: boolean;
}

export interface ConfigurationValidation {
  readonly moduleId: string;
  readonly params: ParamValues;
  readonly computeSeconds: number;
  readonly report: ModuleValidationReport;
}

function readValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseValidateModulesArgs(args: readonly string[]): ValidateModulesCliOptions {
  let matrix: ValidationMatrix = "pr";
  let moduleId: string | null = null;
  let reportPath: string | null = null;
  let allParams = false;
  let verifyThresholds = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "--matrix": {
        const value = readValue(args, index, argument);
        if (value !== "pr" && value !== "full") throw new Error("--matrix must be pr or full");
        matrix = value;
        index += 1;
        break;
      }
      case "--module":
        moduleId = readValue(args, index, argument);
        index += 1;
        break;
      case "--report":
        reportPath = readValue(args, index, argument);
        index += 1;
        break;
      case "--all-params":
        allParams = true;
        break;
      case "--verify-thresholds":
        verifyThresholds = true;
        break;
      default:
        throw new Error(`Unknown argument ${argument}`);
    }
  }

  return Object.freeze({ matrix, moduleId, reportPath, allParams, verifyThresholds });
}

function modulesFor(moduleId: string | null): readonly RegisteredModule[] {
  if (moduleId === null) return ALL_MODULES;
  const module = ALL_MODULES.find(({ id }) => id === moduleId);
  if (!module) throw new Error(`Unknown Module ${moduleId}`);
  return [module];
}

function configurationsFor(module: RegisteredModule, allParams: boolean): Iterable<ParamValues> {
  return allParams
    ? enumerateParamConfigurations(module.meta.params)
    : [defaultParamValues(module.meta.params)];
}

function formatNumber(value: number | null): string {
  return value === null ? "unavailable" : value.toFixed(6);
}

export function renderCalibrationReport(
  matrix: ValidationMatrix,
  validations: readonly ConfigurationValidation[],
): string {
  const rapierVersions = [...new Set(validations.map(({ report }) => report.rapierVersion))];
  const lines = [
    "# Module calibration report",
    "",
    `Matrix: \`${matrix}\`. Threshold table version: \`${UNFROZEN_THRESHOLD_VERSION}\`.`,
    `Rapier version: \`${rapierVersions.join(", ")}\`.`,
    `Compute seconds: ${validations.reduce((total, value) => total + value.computeSeconds, 0).toFixed(3)}.`,
    "",
  ];

  for (const validation of validations) {
    lines.push(
      `## ${validation.moduleId}`,
      "",
      `Parameters: \`${JSON.stringify(validation.params)}\`.`,
      `Compute seconds: ${validation.computeSeconds.toFixed(3)}.`,
      "",
      "| Profile | Seeds | Completed / total | Stalls | Timeouts | Dwell p95 | Maximum Dwell | Role evidence |",
      "|---|---:|---:|---:|---:|---:|---:|---|",
    );
    for (const profile of validation.report.profiles) {
      lines.push(
        `| ${profile.profile} | ${profile.seeds.join(", ")} | ${profile.completedMarbles} / ${profile.totalMarbles} | ${profile.stalledMarbles} | ${profile.timedOutMarbles} | ${formatNumber(profile.dwell.dwellSecondsP95)} | ${formatNumber(profile.dwell.maximumDwellSeconds)} | \`${JSON.stringify(profile.evidence)}\` |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export async function runValidateModules(
  options: ValidateModulesCliOptions,
): Promise<readonly ConfigurationValidation[]> {
  if (options.verifyThresholds) {
    throw new Error("Role thresholds are not frozen; complete the calibration approval checkpoint");
  }
  const validations: ConfigurationValidation[] = [];
  for (const module of modulesFor(options.moduleId)) {
    for (const params of configurationsFor(module, options.allParams)) {
      const started = performance.now();
      const report = await validateModule(module, params, { matrix: options.matrix });
      validations.push(
        Object.freeze({
          moduleId: module.id,
          params,
          computeSeconds: (performance.now() - started) / 1_000,
          report,
        }),
      );
    }
  }
  return Object.freeze(validations);
}

export async function main(args: readonly string[]): Promise<void> {
  const options = parseValidateModulesArgs(args);
  const validations = await runValidateModules(options);
  const report = renderCalibrationReport(options.matrix, validations);
  if (options.reportPath) {
    const reportPath = resolve(options.reportPath);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, report, "utf8");
  } else {
    process.stdout.write(report);
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (entryPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
