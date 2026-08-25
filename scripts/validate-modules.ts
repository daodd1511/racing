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
  readonly legacyReport: ModuleValidationReport;
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

function quantile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

function distribution(values: readonly number[]): string {
  return [quantile(values, 0.05), quantile(values, 0.5), quantile(values, 0.95)]
    .map(formatNumber)
    .join(" / ");
}

function deterministicRandom(): () => number {
  let state = 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function bootstrapMeanInterval(values: readonly number[]): string {
  if (values.length < 2) return "unavailable";
  const random = deterministicRandom();
  const means = Array.from({ length: 2_000 }, () => {
    let total = 0;
    for (let index = 0; index < values.length; index += 1) {
      total += values[Math.floor(random() * values.length)];
    }
    return total / values.length;
  });
  return `${formatNumber(quantile(means, 0.025))}–${formatNumber(quantile(means, 0.975))}`;
}

function seedMeans(
  seeds: readonly number[],
  values: readonly { readonly seed: number; readonly value: number }[],
): readonly number[] {
  return seeds.flatMap((seed) => {
    const selected = values.filter((entry) => entry.seed === seed).map(({ value }) => value);
    return selected.length === 0
      ? []
      : [selected.reduce((total, value) => total + value, 0) / selected.length];
  });
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
      "Legacy pre-correction comparison (invalid as acceptance authority): " +
        `${validation.legacyReport.completedMarbles} / ${validation.legacyReport.totalMarbles} completed; ` +
        `${validation.legacyReport.stalledMarbles} stalls; Dwell p50 ${formatNumber(validation.legacyReport.dwellSecondsP50)}; ` +
        `Dwell p99 label ${formatNumber(validation.legacyReport.dwellSecondsP99)}.`,
      "",
      "| Profile | Seeds | Completed / total | Excluded | Stalls | Timeouts | Dwell p05 / p50 / p95 | Control Dwell p95 | Dwell p95 ratio | Exit speed p05 / p50 / p95 | Dwell seed-mean 95% CI | Exit-speed seed-mean 95% CI | Maximum Dwell | Role evidence |",
      "|---|---:|---:|---:|---:|---:|---|---:|---:|---|---|---|---:|---|",
    );
    for (const profile of validation.report.profiles) {
      const dwellValues = profile.runs.flatMap(({ observation }) =>
        observation.dwellSeconds === null ? [] : [observation.dwellSeconds],
      );
      const exitSpeedValues = profile.roleRuns.map(({ exitSpeed }) => exitSpeed);
      const dwellSeedMeans = seedMeans(
        profile.seeds,
        profile.runs.flatMap(({ seed, observation }) =>
          observation.dwellSeconds === null ? [] : [{ seed, value: observation.dwellSeconds }],
        ),
      );
      const speedSeedMeans = seedMeans(
        profile.seeds,
        profile.roleRuns.map(({ seed, exitSpeed }) => ({ seed, value: exitSpeed })),
      );
      const dwellRatio =
        profile.dwell.dwellSecondsP95 !== null &&
        profile.controlDwell.dwellSecondsP95 !== null &&
        profile.controlDwell.dwellSecondsP95 !== 0
          ? profile.dwell.dwellSecondsP95 / profile.controlDwell.dwellSecondsP95
          : null;
      lines.push(
        `| ${profile.profile} | ${profile.seeds.join(", ")} | ${profile.completedMarbles} / ${profile.totalMarbles} | ${profile.totalMarbles - profile.completedMarbles} | ${profile.stalledMarbles} | ${profile.timedOutMarbles} | ${distribution(dwellValues)} | ${formatNumber(profile.controlDwell.dwellSecondsP95)} | ${formatNumber(dwellRatio)} | ${distribution(exitSpeedValues)} | ${bootstrapMeanInterval(dwellSeedMeans)} | ${bootstrapMeanInterval(speedSeedMeans)} | ${formatNumber(profile.dwell.maximumDwellSeconds)} | \`${JSON.stringify(profile.evidence)}\` |`,
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
      const [report, legacyReport] = await Promise.all([
        validateModule(module, params, { matrix: options.matrix }),
        validateModule(module, params, {
          seedCount: options.matrix === "full" ? 20 : 2,
          marbleCount: 15,
          maxSimulationSeconds: 15,
        }),
      ]);
      validations.push(
        Object.freeze({
          moduleId: module.id,
          params,
          computeSeconds: (performance.now() - started) / 1_000,
          report,
          legacyReport,
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
