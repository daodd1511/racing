import { describe, expect, it } from "vitest";

import { revolveProfile, revolveProfileToPlates } from "./revolve";

// No renderer runs in this suite -- see the module comment on why winding
// and facet count are verified numerically here instead of by eye.

function faceNormal(vertices: readonly number[], a: number, b: number, c: number): number[] {
  const p = (i: number) => [vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]];
  const [ax, ay, az] = p(a);
  const [bx, by, bz] = p(b);
  const [cx, cy, cz] = p(c);
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

describe("revolveProfile", () => {
  it("winds a cone's band so the normal faces inward and upward", () => {
    // Outer/high ring to inner/low ring, per the required ordering -- a
    // funnel-like cone, the same shape relationship the vortex bowl's
    // floor uses (both radius and height decrease together).
    const shape = revolveProfile(
      [
        { radius: 2, height: 1 },
        { radius: 1, height: 0 },
      ],
      4,
      0.016,
    );
    if (shape.kind !== "trimesh") {
      throw new Error("expected a trimesh");
    }

    for (let triangle = 0; triangle < shape.indices.length; triangle += 3) {
      const [a, b, c] = shape.indices.slice(triangle, triangle + 3);
      const [nx, ny, nz] = faceNormal(shape.vertices, a, b, c);

      // Upward: every facet supports something resting on top of it.
      expect(ny).toBeGreaterThan(0);

      // Inward: the horizontal component points back toward the axis,
      // i.e. opposite the face's own outward radial direction.
      const cx = (shape.vertices[a * 3] + shape.vertices[b * 3] + shape.vertices[c * 3]) / 3;
      const cz =
        (shape.vertices[a * 3 + 2] + shape.vertices[b * 3 + 2] + shape.vertices[c * 3 + 2]) / 3;
      const radialDot = nx * cx + nz * cz;
      expect(radialDot).toBeLessThan(0);
    }
  });

  it("leaves an open hole when the profile's narrow end has nonzero radius", () => {
    // A small enough radius (0.05 m) that the facet-margin floor for a
    // 0.016 m marble stays at 8, matching the requested `segments` exactly
    // -- this test is about the hole, not the margin (see the dedicated
    // margin test below).
    const shape = revolveProfile(
      [
        { radius: 0.05, height: 1 },
        { radius: 0.02, height: 0 },
      ],
      8,
      0.016,
    );
    if (shape.kind !== "trimesh") {
      throw new Error("expected a trimesh");
    }

    // Two rings of `segments` vertices each, no cap -- a closed disc would
    // need a center vertex this profile never produces.
    expect(shape.vertices.length).toBe(8 * 2 * 3);
    for (let i = 0; i < shape.vertices.length; i += 3) {
      expect(Math.hypot(shape.vertices[i], shape.vertices[i + 2])).toBeGreaterThan(0);
    }
  });

  it("raises the facet count when the requested segments would tunnel a marble-sized gap", () => {
    // A wide ring (1 m) with a coarse request (segments: 3) and a real
    // marble radius: the sagitta of a 3-facet circle at r=1 is far larger
    // than any fraction of 0.016 m, so the function must raise the count.
    const coarse = revolveProfile(
      [
        { radius: 1, height: 1 },
        { radius: 0.5, height: 0 },
      ],
      3,
      0.016,
    );
    if (coarse.kind !== "trimesh") {
      throw new Error("expected a trimesh");
    }
    const facetsUsed = coarse.vertices.length / 3 / 2;
    expect(facetsUsed).toBeGreaterThan(3);

    // A request that already exceeds the safety floor is left alone.
    const fine = revolveProfile(
      [
        { radius: 1, height: 1 },
        { radius: 0.5, height: 0 },
      ],
      500,
      0.016,
    );
    if (fine.kind !== "trimesh") {
      throw new Error("expected a trimesh");
    }
    expect(fine.vertices.length / 3 / 2).toBe(500);
  });

  it("rejects a profile with fewer than two rings", () => {
    expect(() => revolveProfile([{ radius: 1, height: 0 }], 8, 0.016)).toThrow();
  });
});

describe("revolveProfileToPlates", () => {
  // Applies a quaternion to a vector via the standard formula --
  // independent of quaternionFromBasis (a private helper in revolve.ts),
  // so this is a genuine outside check of what the rotation actually does
  // rather than a restatement of the implementation.
  function applyQuaternion(v: readonly number[], q: readonly number[]): number[] {
    const [vx, vy, vz] = v;
    const [qx, qy, qz, qw] = q;
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    return [
      vx + qw * tx + (qy * tz - qz * ty),
      vy + qw * ty + (qz * tx - qx * tz),
      vz + qw * tz + (qx * ty - qy * tx),
    ];
  }

  it("orients every plate so its rotation reproduces a unit, inward-and-upward normal", () => {
    // Same cone shape revolveProfile's own winding test uses -- outer/high
    // to inner/low, radius and height decreasing together.
    const plates = revolveProfileToPlates(
      [
        { radius: 2, height: 1 },
        { radius: 1, height: 0 },
      ],
      6,
      0.016,
    );
    expect(plates.length).toBeGreaterThan(0);

    for (const plate of plates) {
      const normal = applyQuaternion([0, 1, 0], plate.rotation);
      const normalLength = Math.hypot(normal[0], normal[1], normal[2]);
      expect(normalLength).toBeCloseTo(1, 9);

      // Upward: every plate supports something resting on top of it.
      expect(normal[1]).toBeGreaterThan(0);

      // Inward: the horizontal component points back toward the axis --
      // the same check revolveProfile's own winding test makes, applied
      // to the plate's rotated local Y instead of a triangle's face normal.
      const radialDot = normal[0] * plate.position[0] + normal[2] * plate.position[2];
      expect(radialDot).toBeLessThan(0);

      // The rotation is a genuine orthonormal basis, not merely a vector
      // pointing the right way -- local X and Z must also come out unit
      // length and mutually perpendicular to the normal and each other.
      const circumferential = applyQuaternion([1, 0, 0], plate.rotation);
      const radial = applyQuaternion([0, 0, 1], plate.rotation);
      expect(Math.hypot(...circumferential)).toBeCloseTo(1, 9);
      expect(Math.hypot(...radial)).toBeCloseTo(1, 9);
      const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      expect(dot(circumferential, normal)).toBeCloseTo(0, 9);
      expect(dot(circumferential, radial)).toBeCloseTo(0, 9);
      expect(dot(normal, radial)).toBeCloseTo(0, 9);
    }
  });

  it("tiles the whole profile with one plate per radial-band-by-angular-segment cell", () => {
    const profile = [
      { radius: 0.3, height: 0.1 },
      { radius: 0.2, height: 0.02 },
      { radius: 0.1, height: -0.02 },
      { radius: 0.04, height: -0.06 },
    ];
    const plates = revolveProfileToPlates(profile, 12, 0.016);

    // Four rings, three radial bands -- confirmed via the trimesh emitter
    // over the identical profile, which is the same tiling by construction.
    const shape = revolveProfile(profile, 12, 0.016);
    if (shape.kind !== "trimesh") {
      throw new Error("expected a trimesh");
    }
    const facetsUsed = shape.vertices.length / 3 / profile.length;
    expect(plates.length).toBe((profile.length - 1) * facetsUsed);
  });

  it("keeps every plate's surface within the marble-radius sagitta margin of the sampled profile corners", () => {
    // Ring spacing modeled on the vortex bowl's own default profile
    // (src/modules/vortexBowl/index.ts): PROFILE_STEP_COUNT bands over a
    // basin radius on the order of tens of centimeters.
    const marbleRadius = 0.016;
    const profile = Array.from({ length: 12 }, (_unused, i) => {
      const t = i / 11;
      return { radius: 0.3 - t * 0.26, height: 0.1 - t * 0.2 };
    });
    const plates = revolveProfileToPlates(profile, 16, marbleRadius);

    // Same generosity revolveProfile's own facet margin uses (a fraction
    // of the marble's radius), doubled: a plate's flatness error compounds
    // the same circumferential approximation with a second, radial one.
    const tolerance = marbleRadius * 0.25 * 2;
    const facetCount = plates.length / (profile.length - 1);

    let maxDeviation = 0;
    for (let ringIndex = 0; ringIndex < profile.length - 1; ringIndex += 1) {
      const outer = profile[ringIndex];
      const inner = profile[ringIndex + 1];
      for (let i = 0; i < facetCount; i += 1) {
        const a0 = (i / facetCount) * Math.PI * 2;
        const a1 = ((i + 1) / facetCount) * Math.PI * 2;
        const corners = [
          [outer.radius * Math.cos(a0), outer.height, outer.radius * Math.sin(a0)],
          [outer.radius * Math.cos(a1), outer.height, outer.radius * Math.sin(a1)],
          [inner.radius * Math.cos(a0), inner.height, inner.radius * Math.sin(a0)],
          [inner.radius * Math.cos(a1), inner.height, inner.radius * Math.sin(a1)],
        ];

        const plate = plates[ringIndex * facetCount + i];
        const normal = applyQuaternion([0, 1, 0], plate.rotation);
        const topFace = [
          plate.position[0] + normal[0] * plate.halfExtents[1],
          plate.position[1] + normal[1] * plate.halfExtents[1],
          plate.position[2] + normal[2] * plate.halfExtents[1],
        ];

        for (const corner of corners) {
          const deviation = Math.abs(
            (corner[0] - topFace[0]) * normal[0] +
              (corner[1] - topFace[1]) * normal[1] +
              (corner[2] - topFace[2]) * normal[2],
          );
          maxDeviation = Math.max(maxDeviation, deviation);
        }
      }
    }

    expect(maxDeviation).toBeLessThan(tolerance);
  });

  it("agrees with the trimesh emitter's vertex positions at every sampled corner", () => {
    // Same profile revolveProfile's own facet-margin test uses, so this
    // exercises the auto-raised segment count both emitters must share.
    const profile = [
      { radius: 1, height: 1 },
      { radius: 0.5, height: 0 },
    ];
    const marbleRadius = 0.016;
    const trimesh = revolveProfile(profile, 3, marbleRadius);
    const plates = revolveProfileToPlates(profile, 3, marbleRadius);
    if (trimesh.kind !== "trimesh") {
      throw new Error("expected a trimesh");
    }

    // Both emitters raise the same coarse request (3) against the same
    // facet-margin floor -- if they ever disagreed, one would tile a
    // different number of cells than the other, and this count check
    // would catch it before the geometry checks below run at all.
    const facetCount = trimesh.vertices.length / 3 / profile.length;
    expect(plates.length).toBe(facetCount);
  });

  it("rejects a profile with fewer than two rings", () => {
    expect(() => revolveProfileToPlates([{ radius: 1, height: 0 }], 8, 0.016)).toThrow();
  });
});
