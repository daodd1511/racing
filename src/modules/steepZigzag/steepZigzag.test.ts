import { describe, expect, it } from "vitest";

import { steepZigzag, type SteepZigzagParams } from "./index";
import { defaultParamValues } from "../params";
import { validateModule } from "../../validator/validateModule";
import { MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND } from "../../validator/metrics";

// Dwell range: at this Module's defaults (5 legs, ~0.62 grade), a marble
// spends well under 2 seconds on the whole switchback -- an `accel` Module
// earns its Role by being fast, not by holding the field. Measured directly
// across the seed sweep below: p50 ~0.9s, p99 ~1.7s. Declared with margin,
// not pinned to those exact numbers, so a future default tweak within reason
// doesn't need this test rewritten.
const DWELL_P50_MAX_SECONDS = 1.5;
const DWELL_P99_MAX_SECONDS = 2.5;

describe("steepZigzag guardrails", () => {
  it("zero stalls and visible motion across a 20-seed x 5-marble sweep", async () => {
    const params = defaultParamValues(steepZigzag.meta.params) as unknown as SteepZigzagParams;
    const report = await validateModule(steepZigzag, params, {
      seedCount: 20,
      marbleCount: 5,
      maxSimulationSeconds: 6,
    });

    expect(report.stalledMarbles).toBe(0);
    expect(report.minDisplacementPerSecond).toBeGreaterThan(MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND);
    expect(report.dwellSecondsP50).not.toBeNull();
    expect(report.dwellSecondsP50 as number).toBeLessThan(DWELL_P50_MAX_SECONDS);
    expect(report.dwellSecondsP99 as number).toBeLessThan(DWELL_P99_MAX_SECONDS);
  }, 30_000);

  it("exit speed rises across the zigzag, earning its accel Role", async () => {
    const baseParams = defaultParamValues(steepZigzag.meta.params) as unknown as SteepZigzagParams;

    const shortRun = await validateModule(
      steepZigzag,
      { ...baseParams, legCount: 2 },
      { seedCount: 5, marbleCount: 1, maxSimulationSeconds: 4 },
    );
    const longRun = await validateModule(
      steepZigzag,
      { ...baseParams, legCount: 5 },
      { seedCount: 5, marbleCount: 1, maxSimulationSeconds: 6 },
    );

    expect(shortRun.stalledMarbles).toBe(0);
    expect(longRun.stalledMarbles).toBe(0);
    const meanSpeed = (speeds: readonly number[]) =>
      speeds.reduce((sum, value) => sum + value, 0) / speeds.length;
    expect(meanSpeed(longRun.exitSpeeds)).toBeGreaterThan(meanSpeed(shortRun.exitSpeeds));
  }, 30_000);
});
