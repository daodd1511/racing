import { describe, expect, it } from "vitest";

import { sweepProfileToMesh, sweepProfileToPlates } from "./sweep";
import type { Vector3 } from "../../race/types";

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

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

const CENTRELINE: readonly Vector3[] = [
  [0, 0, 0],
  [0, 0.02, 0.1],
  [0, -0.04, 0.2],
  [0, -0.08, 0.3],
];
const WIDTH = 0.5;
const MARBLE_RADIUS = 0.016;

describe("sweep profile geometry", () => {
  it("orients every plate as a unit, orthonormal, upward-facing basis", () => {
    const plates = sweepProfileToPlates(CENTRELINE, WIDTH, MARBLE_RADIUS, "whoops");

    for (const plate of plates) {
      const lateral = applyQuaternion([1, 0, 0], plate.rotation);
      const normal = applyQuaternion([0, 1, 0], plate.rotation);
      const tangent = applyQuaternion([0, 0, 1], plate.rotation);

      expect(Math.hypot(...lateral)).toBeCloseTo(1, 9);
      expect(Math.hypot(...normal)).toBeCloseTo(1, 9);
      expect(Math.hypot(...tangent)).toBeCloseTo(1, 9);
      expect(normal[1]).toBeGreaterThan(0);
      expect(dot(lateral, normal)).toBeCloseTo(0, 9);
      expect(dot(lateral, tangent)).toBeCloseTo(0, 9);
      expect(dot(normal, tangent)).toBeCloseTo(0, 9);
    }
  });

  it("uses one plate per mesh cell over the identical centreline", () => {
    const mesh = sweepProfileToMesh(CENTRELINE, WIDTH);
    if (mesh.kind !== "trimesh") {
      throw new Error("expected a trimesh");
    }

    const plates = sweepProfileToPlates(CENTRELINE, WIDTH, MARBLE_RADIUS, "whoops");
    expect(mesh.indices.length / 6).toBe(CENTRELINE.length - 1);
    expect(plates).toHaveLength(mesh.indices.length / 6);
  });

  it("keeps each sampled floor corner within the marble-radius sagitta margin", () => {
    const plates = sweepProfileToPlates(CENTRELINE, WIDTH, MARBLE_RADIUS, "whoops");
    const tolerance = MARBLE_RADIUS * 0.25;
    let maxDeviation = 0;

    for (let index = 0; index < plates.length; index += 1) {
      const plate = plates[index];
      const normal = applyQuaternion([0, 1, 0], plate.rotation);
      const topFace = [
        plate.position[0] + normal[0] * plate.halfExtents[1],
        plate.position[1] + normal[1] * plate.halfExtents[1],
        plate.position[2] + normal[2] * plate.halfExtents[1],
      ];
      const corners = [
        [CENTRELINE[index][0] - WIDTH / 2, CENTRELINE[index][1], CENTRELINE[index][2]],
        [CENTRELINE[index][0] + WIDTH / 2, CENTRELINE[index][1], CENTRELINE[index][2]],
        [CENTRELINE[index + 1][0] - WIDTH / 2, CENTRELINE[index + 1][1], CENTRELINE[index + 1][2]],
        [CENTRELINE[index + 1][0] + WIDTH / 2, CENTRELINE[index + 1][1], CENTRELINE[index + 1][2]],
      ];

      for (const corner of corners) {
        maxDeviation = Math.max(
          maxDeviation,
          Math.abs(
            (corner[0] - topFace[0]) * normal[0] +
              (corner[1] - topFace[1]) * normal[1] +
              (corner[2] - topFace[2]) * normal[2],
          ),
        );
      }
    }

    expect(maxDeviation).toBeLessThan(tolerance);
  });

  it("rejects a centreline with fewer than two samples", () => {
    expect(() => sweepProfileToMesh([[0, 0, 0]], WIDTH)).toThrow();
    expect(() => sweepProfileToPlates([[0, 0, 0]], WIDTH, MARBLE_RADIUS, "whoops")).toThrow();
  });
});
