import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";

import { whoops, type WhoopsParams } from "./index";
import { defaultParamValues } from "../params";
import { SCALE } from "../../race/scale";
import { buildWorld } from "../../validator/buildWorld";
import { MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND } from "../../validator/metrics";
import { validateModule, type ValidationReport } from "../../validator/validateModule";

// Dwell range: four toy-scale humps at the default grade measure p50 ~0.98s
// and p99 ~1.32s across this 20-seed sweep. A Whoops Module should reshape
// the field briskly, not become a Queue, so the ceilings retain real margin
// without accepting the multi-second residence time of a blocked channel.
const DWELL_P50_MAX_SECONDS = 1.5;
const DWELL_P99_MAX_SECONDS = 2;

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

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

describe("whoops guardrails", () => {
  const params = defaultParamValues(whoops.meta.params) as unknown as WhoopsParams;
  let report: ValidationReport;

  beforeAll(async () => {
    report = await validateModule(whoops, params, {
      seedCount: 20,
      marbleCount: 5,
      maxSimulationSeconds: 6,
    });
  }, 30_000);

  it("zero stalls and visible motion across a 20-seed x 5-marble sweep", () => {
    expect(report.stalledMarbles).toBe(0);
    expect(report.minDisplacementPerSecond).toBeGreaterThan(
      MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND,
    );
    expect(report.dwellSecondsP50).not.toBeNull();
    expect(report.dwellSecondsP50 as number).toBeLessThan(DWELL_P50_MAX_SECONDS);
    expect(report.dwellSecondsP99 as number).toBeLessThan(DWELL_P99_MAX_SECONDS);
  });

  it("shuffleCoefficient is non-zero across seeds, earning its shuffle Role", () => {
    expect(report.stalledMarbles).toBe(0);
    for (const coefficient of report.shuffleCoefficients) {
      expect(coefficient).toBeGreaterThan(0);
    }
  });

  it.each<Partial<WhoopsParams>>([
    { amplitude: 0.006 },
    { amplitude: 0.016 },
    { wavelength: 0.28 },
    { wavelength: 0.5 },
    { length: 0.6 },
    { length: 1.8 },
    { grade: 0.45 },
    { grade: 0.7 },
    { amplitude: 0.016, wavelength: 0.28, length: 1.8, grade: 0.45 },
  ])(
    "keeps universal guardrails at schema extreme %o",
    async (overrides) => {
      const extremeReport = await validateModule(
        whoops,
        { ...params, ...overrides },
        { seedCount: 5, marbleCount: 5, maxSimulationSeconds: 6 },
      );

      expect(extremeReport.stalledMarbles).toBe(0);
      expect(extremeReport.minDisplacementPerSecond).toBeGreaterThan(
        MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND,
      );
    },
    30_000,
  );

  it("keeps every sampled sine arc within the marble-radius sagitta margin", () => {
    const spec = whoops.buildSpec(params);
    const plates = spec.colliders.filter((collider) => collider.id.startsWith("whoops-plate-"));
    const waveNumber = (Math.PI * 2) / params.wavelength;
    const tolerance = SCALE.marbleRadius * 0.25;
    let maximumDeviation = 0;

    for (let index = 0; index < plates.length; index += 1) {
      const plate = plates[index];
      if (plate.shape.kind !== "cuboid") {
        throw new Error("expected a cuboid plate");
      }
      const normal = applyQuaternion([0, 1, 0], plate.rotation);
      const topFace = [
        plate.position[0] + normal[0] * plate.shape.halfExtents[1],
        plate.position[1] + normal[1] * plate.shape.halfExtents[1],
        plate.position[2] + normal[2] * plate.shape.halfExtents[1],
      ];
      const start = (params.length * index) / plates.length;
      const end = (params.length * (index + 1)) / plates.length;

      for (const fraction of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
        const distance = start + (end - start) * fraction;
        const point = [
          0,
          -params.grade * distance + params.amplitude * Math.sin(waveNumber * distance),
          distance,
        ];
        maximumDeviation = Math.max(
          maximumDeviation,
          Math.abs(
            (point[0] - topFace[0]) * normal[0] +
              (point[1] - topFace[1]) * normal[1] +
              (point[2] - topFace[2]) * normal[2],
          ),
        );
      }
    }

    expect(maximumDeviation).toBeLessThan(tolerance);
  });

  it("keeps a pack inside the channel laterally through every crest", async () => {
    await RAPIER.init();
    const spec = whoops.buildSpec(params);
    const world = buildWorld([spec]);
    const { entry } = spec.footprint;
    const lateral = cross(entry.tangent, entry.up);
    const lateralOffsets = [-0.18, -0.09, 0, 0.09, 0.18];
    const marbles = lateralOffsets.map((offset, index) => {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(
            entry.position[0] +
              entry.tangent[0] * SCALE.marbleRadius * 3 +
              entry.up[0] * SCALE.marbleRadius * 2 +
              lateral[0] * offset,
            entry.position[1] +
              entry.tangent[1] * SCALE.marbleRadius * 3 +
              entry.up[1] * SCALE.marbleRadius * 2 +
              lateral[1] * offset +
              index * SCALE.marbleRadius * 2.5,
            entry.position[2] +
              entry.tangent[2] * SCALE.marbleRadius * 3 +
              entry.up[2] * SCALE.marbleRadius * 2 +
              lateral[2] * offset,
          )
          .setLinearDamping(SCALE.linearDamping)
          .setAngularDamping(SCALE.angularDamping)
          .setCcdEnabled(true),
      );
      world.createCollider(
        RAPIER.ColliderDesc.ball(SCALE.marbleRadius)
          .setRestitution(SCALE.defaultRestitution)
          .setFriction(SCALE.defaultFriction)
          .setDensity(2.4),
        body,
      );
      return body;
    });

    let maximumLateralDistance = 0;
    for (let step = 0; step < 6 * 60; step += 1) {
      world.step();
      for (const marble of marbles) {
        maximumLateralDistance = Math.max(maximumLateralDistance, Math.abs(marble.translation().x));
      }
    }
    world.free();

    // The centre may reach one marble radius beyond the rail's outer face
    // while contacting it; anything farther has genuinely left the channel.
    expect(maximumLateralDistance).toBeLessThanOrEqual(params.width / 2 + SCALE.marbleRadius);
  }, 30_000);
});
