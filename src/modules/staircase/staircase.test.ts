import { beforeAll, describe, expect, it } from "vitest";

import { staircase, type StaircaseParams } from "./index";
import { chute } from "../chute";
import { defaultParamValues } from "../params";
import { validateModule, type ValidationReport } from "../../validator/validateModule";
import { MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND } from "../../validator/metrics";

// Dwell range: 5 steps at this Module's defaults measure p50 ~1.45s, p99
// ~1.77s across the seed sweep below. Declared with margin, not pinned to
// those exact numbers.
const DWELL_P50_MAX_SECONDS = 2.2;
const DWELL_P99_MAX_SECONDS = 3;

describe("staircase guardrails", () => {
  let report: ValidationReport;

  beforeAll(async () => {
    const params = defaultParamValues(staircase.meta.params) as unknown as StaircaseParams;
    report = await validateModule(staircase, params, {
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

  // A `sort` Module must actually spread the field, not just move it along.
  // "Spread at entry" is ~0 by construction (every marble's own run starts
  // at t=0 in validateModule's own frame), so a raw exit-spread-greater-
  // than-zero check is trivial -- instead this compares the relative spread
  // (p99/p50, a scale-independent ratio) against the chute's own, a Module
  // with no sort mechanism at all. A `sort` Module earns its Role by
  // widening that ratio past what plain travel-time variance alone produces.
  it("exit-time spread widens relative to a no-sort baseline, earning its sort Role", async () => {
    const chuteReport = await validateModule(
      chute,
      defaultParamValues(chute.meta.params) as never,
      { seedCount: 20, marbleCount: 5, maxSimulationSeconds: 6 },
    );

    expect(chuteReport.stalledMarbles).toBe(0);
    expect(report.stalledMarbles).toBe(0);

    const chuteRatio = (chuteReport.dwellSecondsP99 as number) / (chuteReport.dwellSecondsP50 as number);
    const staircaseRatio = (report.dwellSecondsP99 as number) / (report.dwellSecondsP50 as number);
    expect(staircaseRatio).toBeGreaterThan(chuteRatio);
  }, 30_000);
});
