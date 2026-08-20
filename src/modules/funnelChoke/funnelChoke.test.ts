import { beforeAll, describe, expect, it } from "vitest";

import { funnelChoke, type FunnelChokeParams } from "./index";
import { defaultParamValues } from "../params";
import { SCALE } from "../../race/scale";
import { MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND } from "../../validator/metrics";
import { validateModule, type ValidationReport } from "../../validator/validateModule";

// The default full-pack sweep measures p50 ~0.82 s and p99 ~1.27 s. These
// retain meaningful headroom while keeping a Queue from turning into a slow
// holding area.
const DWELL_P50_MAX_SECONDS = 1.5;
const DWELL_P99_MAX_SECONDS = 2.2;

function applyQuaternion(vector: readonly number[], quaternion: readonly number[]): number[] {
  const [vx, vy, vz] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

function faceCentres(
  position: readonly number[],
  rotation: readonly number[],
  halfExtents: readonly number[],
): readonly number[][] {
  const axis = applyQuaternion([0, 0, 1], rotation);
  const offset = halfExtents[2];
  return [-1, 1].map((side) => [
    position[0] + axis[0] * offset * side,
    position[1] + axis[1] * offset * side,
    position[2] + axis[2] * offset * side,
  ]);
}

describe("funnelChoke guardrails", () => {
  const params = defaultParamValues(funnelChoke.meta.params) as unknown as FunnelChokeParams;
  let report: ValidationReport;

  beforeAll(async () => {
    report = await validateModule(funnelChoke, params, {
      seedCount: 20,
      marbleCount: 15,
      maxSimulationSeconds: 8,
    });
  }, 30_000);

  it("clears a 20-seed x 15-marble Queue with visible motion", () => {
    expect(report.stalledMarbles).toBe(0);
    expect(report.minDisplacementPerSecond).toBeGreaterThan(
      MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND,
    );
    expect(report.dwellSecondsP50).not.toBeNull();
    expect(report.dwellSecondsP50 as number).toBeLessThan(DWELL_P50_MAX_SECONDS);
    expect(report.dwellSecondsP99 as number).toBeLessThan(DWELL_P99_MAX_SECONDS);
  });

  it("reorders the pack and separates exit times, earning its queue Role", () => {
    expect(report.stalledMarbles).toBe(0);
    for (const coefficient of report.shuffleCoefficients) {
      expect(coefficient).toBeGreaterThan(0);
    }
    // The default field measures roughly 0.45 s from p50 to p99. Keep a
    // margin below that observed separation while rejecting a pack whose
    // exits collapse into one near-simultaneous release.
    expect((report.dwellSecondsP99 as number) - (report.dwellSecondsP50 as number)).toBeGreaterThan(
      0.4,
    );
  });

  it("uses two chained walls per side and preserves the six-diameter throat floor", () => {
    const throatField = funnelChoke.meta.params.fields.find(
      (candidate) => candidate.key === "throatWidth",
    );
    if (throatField?.kind !== "number") {
      throw new Error("expected a throatWidth number field");
    }
    expect(throatField.min).toBeGreaterThanOrEqual(SCALE.marbleRadius * 2 * 6);

    const walls = funnelChoke
      .buildSpec(params)
      .colliders.filter(
        (collider) =>
          collider.id.startsWith("funnel-approach-") || collider.id.startsWith("funnel-flare-"),
      );
    expect(walls.map((wall) => wall.id).sort()).toEqual([
      "funnel-approach-left",
      "funnel-approach-right",
      "funnel-flare-left",
      "funnel-flare-right",
    ]);

    for (const side of ["left", "right"]) {
      const approach = walls.find((wall) => wall.id === `funnel-approach-${side}`);
      const flare = walls.find((wall) => wall.id === `funnel-flare-${side}`);
      const approachShape = approach?.shape;
      const flareShape = flare?.shape;
      if (
        !approach ||
        !flare ||
        approachShape?.kind !== "cuboid" ||
        flareShape?.kind !== "cuboid"
      ) {
        throw new Error(`expected ${side} walls to be cuboids`);
      }

      const minimumFaceDistance = Math.min(
        ...faceCentres(approach.position, approach.rotation, approachShape.halfExtents).flatMap(
          (approachFace) =>
            faceCentres(flare.position, flare.rotation, flareShape.halfExtents).map((flareFace) =>
              Math.hypot(
                approachFace[0] - flareFace[0],
                approachFace[1] - flareFace[1],
                approachFace[2] - flareFace[2],
              ),
            ),
        ),
      );
      expect(minimumFaceDistance).toBeLessThan(1e-6);
    }
  });

  it("clears 15 marbles at every legal throat width", async () => {
    const field = funnelChoke.meta.params.fields.find(
      (candidate) => candidate.key === "throatWidth",
    );
    if (field?.kind !== "number") {
      throw new Error("expected a throatWidth number field");
    }

    for (
      let throatWidth = field.min;
      throatWidth <= field.max + Number.EPSILON;
      throatWidth += field.step
    ) {
      const throatReport = await validateModule(
        funnelChoke,
        { ...params, throatWidth },
        { seedCount: 20, marbleCount: 15, maxSimulationSeconds: 8 },
      );
      expect(throatReport.stalledMarbles).toBe(0);
    }
  }, 30_000);
});
