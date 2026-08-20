import { beforeAll, describe, expect, it } from "vitest";

import { pinField, type PinFieldParams } from "./index";
import { defaultParamValues } from "../params";
import { validateModule, type ValidationReport } from "../../validator/validateModule";
import { MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND } from "../../validator/metrics";

// Dwell range: a `scatter` Module isn't racing to a fast exit like the
// zigzag, but it isn't holding the field like a queue either -- 5 rows at
// this Module's defaults measure p50 ~1.2s, p99 ~2.0s across the seed sweep
// below. Declared with margin, not pinned to those exact numbers.
const DWELL_P50_MAX_SECONDS = 2;
const DWELL_P99_MAX_SECONDS = 3.5;

describe("pinField guardrails", () => {
  let report: ValidationReport;

  beforeAll(async () => {
    const params = defaultParamValues(pinField.meta.params) as unknown as PinFieldParams;
    report = await validateModule(pinField, params, {
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

  it("shuffleCoefficient is non-zero across seeds, earning its scatter Role", () => {
    expect(report.stalledMarbles).toBe(0);
    for (const coefficient of report.shuffleCoefficients) {
      expect(coefficient).toBeGreaterThan(0);
    }
  });
});
