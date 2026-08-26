import { describe, expect, it } from "vitest";

import { chute } from "../modules/chute";
import type { ParamSchema } from "../modules/types";
import { SCALE } from "../race/scale";
import { enumerateParamConfigurations, validateModule, validationSeedsFor } from "./validateModule";

describe("Module Validator policies", () => {
  it("keeps the PR subset smaller than the complete acceptance matrix", () => {
    expect(validationSeedsFor("full", "burst15")).toHaveLength(20);
    expect(validationSeedsFor("full", "continuous")).toHaveLength(10);
    expect(validationSeedsFor("full", "single")).toHaveLength(60);
    expect(validationSeedsFor("pr", "burst15").length).toBeLessThan(20);
    expect(validationSeedsFor("pr", "continuous").length).toBeLessThan(10);
    expect(validationSeedsFor("pr", "single").length).toBeLessThan(60);
  });

  it("streams every schema-defined legal parameter combination", () => {
    const schema: ParamSchema = {
      fields: [
        {
          kind: "number",
          key: "grade",
          label: "Grade",
          min: 0.1,
          max: 0.2,
          step: 0.1,
          default: 0.1,
        },
        { kind: "boolean", key: "enabled", label: "Enabled", default: true },
      ],
    };

    expect([...enumerateParamConfigurations(schema)]).toEqual([
      { grade: 0.1, enabled: false },
      { grade: 0.1, enabled: true },
      { grade: 0.2, enabled: false },
      { grade: 0.2, enabled: true },
    ]);
  });
});

describe("chute profile validation", () => {
  it("records reproducible Burst, Continuous, and Single evidence separately", async () => {
    const report = await validateModule(
      chute,
      { length: 0.6, grade: 0.25, width: 0.5 },
      {
        matrix: "pr",
        seedsByProfile: { burst15: [0], continuous: [0], single: [0] },
        maxSimulationSeconds: 4,
      },
    );

    expect(report.rapierVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(report.profiles.map(({ profile }) => profile)).toEqual([
      "burst15",
      "continuous",
      "single",
    ]);
    expect(report.profiles.map(({ totalMarbles }) => totalMarbles)).toEqual([15, 30, 1]);
    expect(report.profiles.every(({ seeds }) => seeds.every((seed) => seed === 0))).toBe(true);
    expect(report.profiles.every(({ dwell }) => dwell.maximumDwellSeconds !== null)).toBe(true);
    expect(report.profiles.map(({ dwell }) => dwell.validity.minimumCompletedRuns)).toEqual([
      12, 24, 1,
    ]);
    expect(
      report.profiles[0].runs.every(({ gateHoldDisplacementMeters }) =>
        gateHoldDisplacementMeters === null ? false : gateHoldDisplacementMeters < 1e-8,
      ),
    ).toBe(true);
    expect(report.timedOutMarbles).toBe(0);
    expect(report.stalledMarbles).toBe(0);
    expect(report.exitSpeeds).toHaveLength(report.completedMarbles);
  }, 30_000);

  it("applies the timeout from each Continuous marble's own release", async () => {
    const report = await validateModule(
      chute,
      { length: 0.6, grade: 0.25, width: 0.5 },
      {
        matrix: "pr",
        profiles: ["continuous"],
        seedsByProfile: { continuous: [0] },
        maxSimulationSeconds: 0.05,
      },
    );

    expect(report.completedMarbles).toBe(0);
    expect(report.timedOutMarbles).toBe(30);
    expect(report.profiles[0].evidence).toBeNull();
  }, 30_000);

  it("uses the same constrained nominal input at both physical entry planes", async () => {
    const width = SCALE.marbleRadius * 5;
    const report = await validateModule(
      chute,
      { length: 0.6, grade: 0.25, width: 0.5 },
      {
        matrix: "pr",
        profiles: ["continuous"],
        seedsByProfile: { continuous: [0] },
        entryConstraintWidth: width,
        minimumCompletedRuns: 1,
        maxSimulationSeconds: 4,
      },
    );
    const profile = report.profiles[0];

    expect(profile.roleRuns.length).toBeGreaterThan(0);
    expect(profile.controlRoleRuns.length).toBe(profile.roleRuns.length);
    expect(
      [...profile.roleRuns, ...profile.controlRoleRuns].every(
        ({ entryLateral }) => Math.abs(entryLateral) <= width / 2 + 1e-6,
      ),
    ).toBe(true);
  }, 30_000);

  it("withholds Role evidence below the requested completion floor", async () => {
    const report = await validateModule(
      chute,
      { length: 0.6, grade: 0.25, width: 0.5 },
      {
        matrix: "pr",
        profiles: ["single"],
        seedsByProfile: { single: [0] },
        minimumCompletedRuns: 2,
        maxSimulationSeconds: 4,
      },
    );

    expect(report.profiles[0].dwell.validity.behaviorAvailable).toBe(false);
    expect(report.profiles[0].controlDwell.validity.behaviorAvailable).toBe(false);
    expect(report.profiles[0].evidence).toBeNull();
  }, 30_000);
});
