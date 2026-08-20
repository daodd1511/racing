import { beforeAll, describe, expect, it } from "vitest";

import { frictionLanes, type FrictionLanesParams } from "./index";
import { chute } from "../chute";
import { defaultParamValues } from "../params";
import { validateModule, type ValidationReport } from "../../validator/validateModule";
import { MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND } from "../../validator/metrics";

// Dwell range: a short, brisk Module at this Module's defaults -- p50
// ~0.53s, p99 ~0.68s across the seed sweep below. Declared with margin, not
// pinned to those exact numbers.
const DWELL_P50_MAX_SECONDS = 1.2;
const DWELL_P99_MAX_SECONDS = 1.8;

describe("frictionLanes guardrails", () => {
  let report: ValidationReport;

  beforeAll(async () => {
    const params = defaultParamValues(frictionLanes.meta.params) as unknown as FrictionLanesParams;
    report = await validateModule(frictionLanes, params, {
      seedCount: 20,
      marbleCount: 5,
      maxSimulationSeconds: 6,
    });
  }, 30_000);

  it("zero stalls and visible motion across a 20-seed x 5-marble sweep", () => {
    expect(report.stalledMarbles).toBe(0);
    expect(report.minDisplacementPerSecond).toBeGreaterThan(MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND);
    expect(report.dwellSecondsP50).not.toBeNull();
    expect(report.dwellSecondsP50 as number).toBeLessThan(DWELL_P50_MAX_SECONDS);
    expect(report.dwellSecondsP99 as number).toBeLessThan(DWELL_P99_MAX_SECONDS);
  });

  // See staircase.test.ts's identical comment: "spread at entry" is ~0 by
  // construction, so this compares relative spread (p99/p50) against the
  // chute's own no-sort baseline instead of a trivial greater-than-zero
  // check.
  it("exit-time spread widens relative to a no-sort baseline, earning its sort Role", async () => {
    const chuteReport = await validateModule(
      chute,
      defaultParamValues(chute.meta.params) as never,
      { seedCount: 20, marbleCount: 5, maxSimulationSeconds: 6 },
    );

    expect(chuteReport.stalledMarbles).toBe(0);
    expect(report.stalledMarbles).toBe(0);

    const chuteRatio = (chuteReport.dwellSecondsP99 as number) / (chuteReport.dwellSecondsP50 as number);
    const frictionLanesRatio = (report.dwellSecondsP99 as number) / (report.dwellSecondsP50 as number);
    expect(frictionLanesRatio).toBeGreaterThan(chuteRatio);
  }, 30_000);
});
