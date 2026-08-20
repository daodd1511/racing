import { describe, expect, it } from "vitest";

import { chute } from "../modules/chute";
import { validateModule } from "./validateModule";

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe("chute Validator sweep", () => {
  it("every marble exits, with zero stalls, across a seed sweep", async () => {
    const report = await validateModule(
      chute,
      { length: 0.6, grade: 0.25, width: 0.5 },
      { seedCount: 8, marbleCount: 4, maxSimulationSeconds: 3 },
    );

    expect(report.totalMarbles).toBe(32);
    expect(report.stalledMarbles).toBe(0);
    expect(report.exitSpeeds).toHaveLength(32);
    expect(report.dwellSecondsP50).not.toBeNull();
    expect(report.dwellSecondsP99).not.toBeNull();
    expect(report.minDisplacementPerSecond).toBeGreaterThan(0);
  }, 30_000);

  it("exit speed rises with grade", async () => {
    const shallow = await validateModule(
      chute,
      { length: 0.6, grade: 0.12, width: 0.5 },
      { seedCount: 5, marbleCount: 1, maxSimulationSeconds: 4 },
    );
    const steep = await validateModule(
      chute,
      { length: 0.6, grade: 0.45, width: 0.5 },
      { seedCount: 5, marbleCount: 1, maxSimulationSeconds: 4 },
    );

    expect(shallow.stalledMarbles).toBe(0);
    expect(steep.stalledMarbles).toBe(0);
    expect(mean(steep.exitSpeeds)).toBeGreaterThan(mean(shallow.exitSpeeds));
  }, 30_000);
});
