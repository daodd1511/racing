import { describe, expect, it } from "vitest";

import {
  UNFROZEN_THRESHOLD_VERSION,
  parseValidateModulesArgs,
  renderCalibrationReport,
  type ConfigurationValidation,
} from "../../scripts/validate-modules";
import type { ModuleValidationReport } from "./validateModule";

describe("validate-modules arguments", () => {
  it("parses matrix, Module, parameter, report, and verification flags", () => {
    expect(
      parseValidateModulesArgs([
        "--matrix",
        "full",
        "--module",
        "chute",
        "--all-params",
        "--report",
        "report.md",
        "--verify-thresholds",
      ]),
    ).toEqual({
      matrix: "full",
      moduleId: "chute",
      reportPath: "report.md",
      allParams: true,
      verifyThresholds: true,
    });
  });

  it.each([["--matrix", "large"], ["--module"], ["--unknown"]])(
    "rejects invalid arguments %j",
    (...args) => {
      expect(() => parseValidateModulesArgs(args)).toThrow();
    },
  );
});

describe("calibration report", () => {
  it("records seeds, configuration, Rapier, compute cost, and threshold version", () => {
    const report = {
      moduleId: "chute",
      role: "accel",
      matrix: "pr",
      rapierVersion: "0.19.2",
      profiles: [
        {
          profile: "single",
          seeds: [1, 2],
          totalMarbles: 2,
          completedMarbles: 2,
          stalledMarbles: 0,
          timedOutMarbles: 0,
          controlTimedOutMarbles: 0,
          dwell: {
            validity: {
              totalRuns: 2,
              completedRuns: 2,
              minimumCompletedRuns: 1,
              behaviorAvailable: true,
            },
            dwellSecondsP95: 1.2,
            maximumDwellSeconds: 1.3,
          },
          evidence: null,
          controlEvidence: null,
          runs: [],
          roleRuns: [],
          controlRoleRuns: [],
        },
      ],
      totalMarbles: 2,
      completedMarbles: 2,
      stalledMarbles: 0,
      timedOutMarbles: 0,
      dwellSecondsP50: 1.1,
      dwellSecondsP95: 1.2,
      dwellSecondsP99: 1.3,
      maximumDwellSeconds: 1.3,
      exitSpeeds: [2, 2.1],
      minDisplacementPerSecond: 0.2,
      shuffleCoefficients: [0],
      seeds: 2,
    } satisfies ModuleValidationReport;
    const validation: ConfigurationValidation = {
      moduleId: "chute",
      params: { grade: 0.25 },
      computeSeconds: 2.5,
      report,
      legacyReport: report,
    };
    const markdown = renderCalibrationReport("pr", [validation]);

    expect(markdown).toContain(`Threshold table version: \`${UNFROZEN_THRESHOLD_VERSION}\``);
    expect(markdown).toContain("Rapier version: `0.19.2`");
    expect(markdown).toContain("Parameters: `{");
    expect(markdown).toContain("Legacy pre-correction comparison");
    expect(markdown).toContain("| single | 1, 2 | 2 / 2 | 0 | 0 | 0 |");
    expect(markdown).toContain("95% CI");
    expect(markdown).toContain("Compute seconds: 2.500");
  });
});
