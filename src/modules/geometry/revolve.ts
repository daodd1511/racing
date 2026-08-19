import type { Shape } from "../types";

// A general-purpose surface-of-revolution builder: the geometry primitive
// the vortex bowl needs (Phase 4) and no earlier Module did, per PLAN.md ->
// "the only [Module] needing revolved geometry rather than boxes". Returns a
// `Shape`, not a `ColliderSpec`/`VisualSpec` -- `Shape` is already the union
// shared by both (types.ts's comment: "one union serves both rather than
// duplicating shape math per concern"), so a caller wraps the same triangle
// data once for the collider and once for the mesh instead of triangulating
// twice. (Phase 4's plan sketched this as returning `ColliderSpec[]`; this
// is the correction -- see EXECUTION.md's Phase 4 "Produces" line.)

/** One ring of the profile being revolved around the local Y axis, in the
 * caller's own local space -- `radius` how far out, `height` how high. */
export interface ProfileRing {
  readonly radius: number;
  readonly height: number;
}

/** How much a facet's chord is allowed to depart from the true circle it
 * approximates, as a fraction of the marble's radius. A revolved collider
 * is only as round as its facet count -- too coarse, and a marble moving
 * fast along the rim catches a facet's corner instead of the smooth
 * surface the profile describes, exactly the failure mode the old vanilla
 * bowl's funnel geometry ran into with sharp interior seams. This is a
 * safety floor, not the requested resolution: `revolveProfile` raises the
 * facet count for the profile's widest ring, but never lowers a caller's
 * request below it. */
const MAX_SAGITTA_FRACTION_OF_MARBLE_RADIUS = 0.25;

/** Smallest facet count keeping a ring's sagitta (the gap between one flat
 * triangle and the true circle) under `maxSagitta`. Derived from
 * sagitta = r * (1 - cos(pi / n)) => n = pi / acos(1 - sagitta / r). */
function minimumSegmentsForRadius(radius: number, maxSagitta: number): number {
  if (radius <= 0 || maxSagitta <= 0) {
    return 3;
  }
  const ratio = Math.min(1, maxSagitta / radius);
  return Math.max(3, Math.ceil(Math.PI / Math.acos(1 - ratio)));
}

/** Revolves a profile around the local Y axis into one closed-band trimesh
 * `Shape`. Order rings from the revolution's outside/top to its
 * inside/bottom -- each ring's radius and height no greater than the
 * previous ring's -- so the resulting surface's normal faces the axis and
 * upward, the side a marble resting inside the shape touches (see the
 * winding note below). A profile that never reaches radius 0 leaves an
 * open circular hole at its narrow end -- used deliberately by the vortex
 * bowl's drain, not a bug to guard against.
 *
 * `segments` is a requested minimum, not the final count: it is raised
 * automatically if the profile's widest ring would otherwise let a marble
 * of `marbleRadius` catch a facet corner (see `MAX_SAGITTA_FRACTION_OF_MARBLE_RADIUS`
 * above). Pass the real `SCALE.marbleRadius`, not a guess -- this is the
 * "facet-chord margin sized against SCALE.marbleRadius" Phase 4 requires. */
export function revolveProfile(
  profile: readonly ProfileRing[],
  segments: number,
  marbleRadius: number,
): Shape {
  if (profile.length < 2) {
    throw new Error("revolveProfile needs at least two rings");
  }

  const maxRadius = Math.max(...profile.map((ring) => ring.radius));
  const maxSagitta = marbleRadius * MAX_SAGITTA_FRACTION_OF_MARBLE_RADIUS;
  const facetCount = Math.max(segments, minimumSegmentsForRadius(maxRadius, maxSagitta));

  const vertices: number[] = [];
  const indices: number[] = [];

  for (const ring of profile) {
    for (let i = 0; i < facetCount; i += 1) {
      const angle = (i / facetCount) * Math.PI * 2;
      vertices.push(ring.radius * Math.cos(angle), ring.height, ring.radius * Math.sin(angle));
    }
  }

  for (let ringIndex = 0; ringIndex < profile.length - 1; ringIndex += 1) {
    const start = ringIndex * facetCount;
    const nextStart = (ringIndex + 1) * facetCount;
    for (let i = 0; i < facetCount; i += 1) {
      const next = (i + 1) % facetCount;
      const a = start + i;
      const b = start + next;
      const c = nextStart + i;
      const d = nextStart + next;
      // Wound for the convention every caller of this file must follow:
      // rings ordered from the revolution's outside/top toward its
      // inside/bottom (each ring's radius and height both <= the previous
      // ring's), which produces a surface normal facing toward the axis
      // and upward -- the side a marble resting inside the revolved shape
      // touches. Verified by revolve.test.ts against a known cone's face
      // normals rather than trusted by inspection, since nothing here
      // renders to check by eye.
      indices.push(a, c, b, b, c, d);
    }
  }

  return { kind: "trimesh", vertices, indices };
}
