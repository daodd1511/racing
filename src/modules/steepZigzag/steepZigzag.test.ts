import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { SCALE } from "../../race/scale";
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
  it("adds high outer catch caps while keeping the centre open", () => {
    const params = defaultParamValues(steepZigzag.meta.params) as unknown as SteepZigzagParams;
    const spec = steepZigzag.buildSpec(params);
    const catchCaps = spec.colliders.filter((collider) => collider.id.startsWith("leg-catch-"));

    expect(catchCaps).toHaveLength(params.legCount * 2);
    expect(spec.visuals.filter((visual) => visual.id.startsWith("leg-catch-"))).toHaveLength(
      params.legCount * 2,
    );

    for (let index = 0; index < params.legCount; index += 1) {
      const leftCap = catchCaps.find((collider) => collider.id === `leg-catch-left-${index}`);
      const rightCap = catchCaps.find((collider) => collider.id === `leg-catch-right-${index}`);
      const leftGuard = spec.colliders.find((collider) => collider.id === `leg-guard-left-${index}`);
      const rightGuard = spec.colliders.find(
        (collider) => collider.id === `leg-guard-right-${index}`,
      );

      expect(leftCap?.shape.kind).toBe("cuboid");
      expect(rightCap?.shape.kind).toBe("cuboid");
      expect(leftGuard).toBeDefined();
      expect(rightGuard).toBeDefined();

      if (
        !leftCap ||
        !rightCap ||
        !leftGuard ||
        !rightGuard ||
        leftCap.shape.kind !== "cuboid" ||
        rightCap.shape.kind !== "cuboid"
      ) {
        throw new Error("default zigzag must provide paired cuboid catch caps and guards");
      }

      const capWidth = leftCap.shape.halfExtents[0] * 2;
      const centralGap = new Vector3(...leftCap.position)
        .distanceTo(new Vector3(...rightCap.position)) - capWidth;
      expect(centralGap).toBeGreaterThanOrEqual(SCALE.marbleRadius * 4);
      expect(leftCap.position[1]).toBeGreaterThan(leftGuard.position[1]);
      expect(rightCap.position[1]).toBeGreaterThan(rightGuard.position[1]);
    }
  });

  it("zero stalls and visible motion across a 20-seed x 5-marble sweep", async () => {
    const params = defaultParamValues(steepZigzag.meta.params) as unknown as SteepZigzagParams;
    const report = await validateModule(steepZigzag, params, {
      seedCount: 20,
      marbleCount: 5,
      maxSimulationSeconds: 6,
    });

    expect(report.stalledMarbles).toBe(0);
    expect(report.minDisplacementPerSecond).toBeGreaterThan(
      MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND,
    );
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
