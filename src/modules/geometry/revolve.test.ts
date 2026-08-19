import { describe, expect, it } from "vitest";

import { revolveProfile } from "./revolve";

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
