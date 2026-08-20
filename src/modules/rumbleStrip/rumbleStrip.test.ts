import { describe, expect, it } from "vitest";

import { rumbleStrip, type RumbleStripParams } from "./index";
import { defaultParamValues } from "../params";
import { validateModule } from "../../validator/validateModule";
import { MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND } from "../../validator/metrics";

// Dwell range: this Module is disruption, not a holding pattern -- its own
// module comment says the job happens in "a fraction of a second" per bar,
// and 10 bars back to back still measure p50 ~2.1s, p99 ~2.8s across the
// seed sweep below (dominated by the LEAD_IN run-up, not the bars
// themselves). A well-under-a-second *budget* here would misdescribe what
// the sweep actually measures; the ceiling below is generous on purpose --
// what "well under a second" constrains is each individual bar's own
// disruption, not this Module's total transit time.
const DWELL_P50_MAX_SECONDS = 3;
const DWELL_P99_MAX_SECONDS = 4;

describe("rumbleStrip guardrails", () => {
  it("zero stalls and visible motion across a 20-seed x 5-marble sweep", async () => {
    const params = defaultParamValues(rumbleStrip.meta.params) as unknown as RumbleStripParams;
    const report = await validateModule(rumbleStrip, params, {
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

  it("shuffleCoefficient is non-zero across seeds, earning its scatter Role", async () => {
    const params = defaultParamValues(rumbleStrip.meta.params) as unknown as RumbleStripParams;
    const report = await validateModule(rumbleStrip, params, {
      seedCount: 20,
      marbleCount: 5,
      maxSimulationSeconds: 6,
    });

    expect(report.stalledMarbles).toBe(0);
    for (const coefficient of report.shuffleCoefficients) {
      expect(coefficient).toBeGreaterThan(0);
    }
  }, 30_000);
});
