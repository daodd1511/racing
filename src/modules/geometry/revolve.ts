import type { Shape } from "../types";
import type { Quaternion, Vector3 } from "../../race/types";

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

// ---------------------------------------------------------------------------
// Collider construction: a ring of cuboid plates over the same profile.
//
// A concave revolved trimesh -- the shape `revolveProfile` above builds --
// ejected every marble that entered the rim of the vortex bowl with speed,
// across every wall height, bank angle, transition width, entry speed,
// friction, tilt, timestep, and CCD setting tried. A flat trimesh holds a
// marble correctly and the chute's cuboids always have, so the defect is the
// curved concave mesh's internal edges, not the shape it approximates -- see
// docs/adr/0003-cuboid-colliders-under-revolved-visuals.md. `revolveProfile`
// therefore stays as the smooth *visual* source; this is the *collider*
// source over the identical `ProfileRing[]`, so the two always describe the
// same surface.

/** One flat cuboid plate's placement: `halfExtents` in the plate's own local
 * frame (X = circumferential, Y = the surface normal, Z = radial -- the same
 * order `rotation` orients into the caller's space), `position` and
 * `rotation` in the profile's own local space, pre-tilt, matching every other
 * local placement this file and its callers produce. */
export interface PlatePlacement {
  readonly halfExtents: Vector3;
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

/** Thickness of every plate, meters -- thin enough not to visibly distort the
 * bowl's shape, thick enough to be a resolvable (non-degenerate) cuboid.
 * Matches the entry ramp's own floor thickness in vortexBowl/index.ts. */
const PLATE_THICKNESS = 0.01;

/** Each plate is sized slightly larger than its exact sampled footprint --
 * an overlap between neighbors is physically harmless (Rapier resolves
 * overlapping static colliders without incident), while a gap from rounding
 * or the flat approximation's own error is exactly the kind of seam a fast
 * marble can catch on. Err generous. */
const PLATE_OVERSIZE_FACTOR = 1.08;

function subtract(a: Vector3, b: Vector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: Vector3, b: Vector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v: Vector3, s: number): Vector3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function length(v: Vector3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize(v: Vector3): Vector3 {
  const len = length(v);
  return len === 0 ? v : scale(v, 1 / len);
}

/** Builds a quaternion from an orthonormal right-handed basis (u, v, w) --
 * the rotation taking local +X to `u`, local +Y to `v`, local +Z to `w`.
 * Standard rotation-matrix-to-quaternion conversion (the branch on the
 * matrix's trace avoids a division by a near-zero term for any input
 * rotation); verified in revolve.test.ts by applying the result back to the
 * local axes and checking it reproduces u/v/w, not trusted by inspection. */
function quaternionFromBasis(u: Vector3, v: Vector3, w: Vector3): Quaternion {
  const m11 = u[0],
    m21 = u[1],
    m31 = u[2];
  const m12 = v[0],
    m22 = v[1],
    m32 = v[2];
  const m13 = w[0],
    m23 = w[1],
    m33 = w[2];
  const trace = m11 + m22 + m33;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s];
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    return [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    return [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
  return [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
}

/** Converts the same `ProfileRing[]` `revolveProfile` triangulates into a
 * ring of flat cuboid plates instead -- one plate per (radial band, angular
 * segment) cell, matching the trimesh's own tiling exactly so the two
 * emitters describe the same surface at the same resolution. Radial bands
 * come directly from `profile` (unchanged from whatever the caller already
 * tuned for the visual); `segments` and the marble-radius facet-margin floor
 * are shared with `revolveProfile` via the same `minimumSegmentsForRadius`,
 * so a marble can't catch a gap between plates any more than it could catch
 * a facet seam in the trimesh. */
export function revolveProfileToPlates(
  profile: readonly ProfileRing[],
  segments: number,
  marbleRadius: number,
): PlatePlacement[] {
  if (profile.length < 2) {
    throw new Error("revolveProfileToPlates needs at least two rings");
  }

  const maxRadius = Math.max(...profile.map((ring) => ring.radius));
  const maxSagitta = marbleRadius * MAX_SAGITTA_FRACTION_OF_MARBLE_RADIUS;
  const facetCount = Math.max(segments, minimumSegmentsForRadius(maxRadius, maxSagitta));

  const point = (ring: ProfileRing, angle: number): Vector3 => [
    ring.radius * Math.cos(angle),
    ring.height,
    ring.radius * Math.sin(angle),
  ];

  const plates: PlatePlacement[] = [];

  for (let ringIndex = 0; ringIndex < profile.length - 1; ringIndex += 1) {
    const outer = profile[ringIndex];
    const inner = profile[ringIndex + 1];

    for (let i = 0; i < facetCount; i += 1) {
      const a0 = (i / facetCount) * Math.PI * 2;
      const a1 = ((i + 1) / facetCount) * Math.PI * 2;

      const p00 = point(outer, a0);
      const p01 = point(outer, a1);
      const p10 = point(inner, a0);
      const p11 = point(inner, a1);

      // Average edge directions across the cell rather than one edge's --
      // for a facet count fine enough to keep the sagitta margin above, the
      // cell is close enough to planar that this converges to the same
      // basis either way, and averaging is cheap insurance against the one
      // edge picked happening to be the noisier of the two.
      const circumferentialRaw = normalize(add(subtract(p01, p00), subtract(p11, p10)));
      const radialRaw = normalize(add(subtract(p10, p00), subtract(p11, p01)));

      // Gram-Schmidt: re-orthogonalize the radial direction against the
      // (already-normalized) circumferential one before taking their
      // cross product, so a slightly non-planar cell still yields an
      // exactly orthonormal basis rather than a sheared one.
      const radial = normalize(
        subtract(radialRaw, scale(circumferentialRaw, dot(radialRaw, circumferentialRaw))),
      );
      // Wound to match `revolveProfile`'s own inward-and-upward convention
      // (see its winding comment) -- verified in revolve.test.ts against the
      // same cone case that test already checks, not assumed from this
      // ordering by inspection.
      const normal = normalize(cross(radial, circumferentialRaw));
      const circumferential = normalize(cross(normal, radial));

      const center = scale(add(add(p00, p01), add(p10, p11)), 0.25);
      // The cuboid's top face (position + normal * thickness/2) should sit
      // at the sampled surface, not straddle it -- offset the center inward
      // by half the thickness so it does, matching where the trimesh's own
      // vertices are instead of protruding above them.
      const plateCenter = subtract(center, scale(normal, PLATE_THICKNESS / 2));

      const circumferentialHalfLength =
        (Math.max(length(subtract(p01, p00)), length(subtract(p11, p10))) / 2) *
        PLATE_OVERSIZE_FACTOR;
      const radialHalfLength =
        (Math.max(length(subtract(p10, p00)), length(subtract(p11, p01))) / 2) *
        PLATE_OVERSIZE_FACTOR;

      plates.push({
        halfExtents: [circumferentialHalfLength, PLATE_THICKNESS / 2, radialHalfLength],
        position: plateCenter,
        rotation: quaternionFromBasis(circumferential, normal, radial),
      });
    }
  }

  return plates;
}
