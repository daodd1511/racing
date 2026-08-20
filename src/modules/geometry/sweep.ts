import type { Quaternion, Vector3 } from "../../race/types";
import type { Shape } from "../types";
import type { PlatePlacement } from "./revolve";

// A longitudinal swept floor for Modules such as whoops. The centreline is
// sampled in the Module's Y/Z plane: +Y is up, +Z is travel, and its constant
// X coordinate is the channel centre. Both exports consume exactly those
// samples, so a visual cell and its collider plate can never drift apart.
//
// ADR 0003 forbids using the returned trimesh for collision. It is visual
// only; `sweepProfileToPlates` emits the fixed cuboids a marble actually
// rides. The Whoops Module chooses its centreline count from a marble-radius
// sagitta limit before calling either emitter.

/** Thin enough to preserve the sampled surface and thick enough for Rapier's
 * fixed cuboids to remain non-degenerate. Matches the shared channel floor. */
const PLATE_THICKNESS = 0.01;
/** Adjacent plates overlap by a small part of a marble radius. A tiny overlap
 * is harmless for fixed colliders; a rounding seam is not. */
const PLATE_SEAM_OVERLAP_RADIUS_FRACTION = 0.05;
const X_AXIS: Vector3 = [1, 0, 0];

export interface SweepPlatePlacement extends PlatePlacement {
  readonly id: string;
}

interface SweepCell {
  readonly start: Vector3;
  readonly end: Vector3;
  readonly tangent: Vector3;
  readonly normal: Vector3;
  readonly length: number;
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: Vector3, b: Vector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vector: Vector3, factor: number): Vector3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function length(vector: Vector3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: Vector3): Vector3 {
  const magnitude = length(vector);
  if (magnitude === 0) {
    throw new Error("sweepProfile needs non-zero centreline cells");
  }
  return scale(vector, 1 / magnitude);
}

/** Builds the quaternion mapping local +X/+Y/+Z to a right-handed basis.
 * The conversion is deliberately data-only: the Validator consumes these
 * plain tuples without importing Three.js. sweep.test.ts applies each result
 * to the local axes independently to verify the basis. */
function quaternionFromBasis(x: Vector3, y: Vector3, z: Vector3): Quaternion {
  const m11 = x[0],
    m21 = x[1],
    m31 = x[2];
  const m12 = y[0],
    m22 = y[1],
    m32 = y[2];
  const m13 = z[0],
    m23 = z[1],
    m33 = z[2];
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

function assertCentreline(centreline: readonly Vector3[], width: number): void {
  if (centreline.length < 2) {
    throw new Error("sweepProfile needs at least two centreline samples");
  }
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error("sweepProfile needs a positive width");
  }

  const centreX = centreline[0][0];
  for (const point of centreline) {
    if (!point.every(Number.isFinite)) {
      throw new Error("sweepProfile needs finite centreline samples");
    }
    // This emitter models a rolling floor displaced along up, not a path
    // that turns laterally. Keeping X fixed gives every cell one shared
    // lateral axis and keeps rail and plate frames coherent.
    if (point[0] !== centreX) {
      throw new Error("sweepProfile centreline must stay in one Y/Z plane");
    }
  }
}

function cellsFor(centreline: readonly Vector3[], width: number): readonly SweepCell[] {
  assertCentreline(centreline, width);

  return centreline.slice(0, -1).map((start, index) => {
    const end = centreline[index + 1];
    const delta = subtract(end, start);
    const cellLength = length(delta);
    if (cellLength === 0) {
      throw new Error("sweepProfile needs non-zero centreline cells");
    }

    const tangent = normalize(delta);
    // tangent × local +X gives the upward-facing local +Y for a floor that
    // travels in +Z while descending in -Y. X × Y then reproduces tangent,
    // making the resulting quaternion an explicit right-handed frame.
    const normal = normalize(cross(tangent, X_AXIS));
    if (normal[1] <= 0) {
      throw new Error("sweepProfile centreline must progress toward +Z");
    }

    return { start, end, tangent, normal, length: cellLength };
  });
}

/** Builds an indexed visual trimesh with two vertices per centreline sample
 * and two upward-facing triangles per cell. This is deliberately the visual
 * representation only; see `sweepProfileToPlates` for collision. */
export function sweepProfileToMesh(centreline: readonly Vector3[], width: number): Shape {
  const cells = cellsFor(centreline, width);
  const vertices: number[] = [];
  const indices: number[] = [];
  const halfWidth = width / 2;

  for (const point of centreline) {
    vertices.push(point[0] - halfWidth, point[1], point[2]);
    vertices.push(point[0] + halfWidth, point[1], point[2]);
  }

  for (let index = 0; index < cells.length; index += 1) {
    const start = index * 2;
    const end = start + 2;
    // local left, next-left, right gives the same upward-facing normal as
    // the plate basis below. Renderer-side `computeVertexNormals()` then
    // smooths lighting across these indexed cells without changing physics.
    indices.push(start, end, start + 1, start + 1, end, end + 1);
  }

  return { kind: "trimesh", vertices, indices };
}

/** Emits one fixed cuboid plate for each visual mesh cell. `marbleRadius`
 * determines the overlap at a plate seam; the caller chooses the shared
 * centreline's cell count from its curvature's sagitta floor, so the mesh
 * and plates retain a one-for-one tiling at that safety resolution. */
export function sweepProfileToPlates(
  centreline: readonly Vector3[],
  width: number,
  marbleRadius: number,
  idPrefix: string,
): readonly SweepPlatePlacement[] {
  if (!Number.isFinite(marbleRadius) || marbleRadius <= 0) {
    throw new Error("sweepProfile needs a positive marble radius");
  }

  const cells = cellsFor(centreline, width);
  const seamOverlap = marbleRadius * PLATE_SEAM_OVERLAP_RADIUS_FRACTION;

  return cells.map((cell, index) => {
    const centre = scale(add(cell.start, cell.end), 0.5);
    // The cuboid top face is the sampled surface. Offset its centre down
    // along the plate normal so its thickness is entirely below the visual,
    // as revolveProfileToPlates does for the vortex bowl.
    const position = subtract(centre, scale(cell.normal, PLATE_THICKNESS / 2));
    const id = idPrefix.length === 0 ? `plate-${index}` : `${idPrefix}-plate-${index}`;

    return {
      id,
      halfExtents: [width / 2, PLATE_THICKNESS / 2, cell.length / 2 + seamOverlap],
      position,
      rotation: quaternionFromBasis(X_AXIS, cell.normal, cell.tangent),
    };
  });
}
