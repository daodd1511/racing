import {
  Matrix4 as ThreeMatrix4,
  Quaternion as ThreeQuaternion,
  Vector3 as ThreeVector3,
} from "three";

import type { Quaternion, Vector3 } from "../../race/types";
import { SCALE } from "../../race/scale";
import type { Anchor, ColliderMaterial, ColliderSpec, Footprint, VisualSpec } from "../types";

// The shared floor-plus-rails geometry every straight-run Module in the
// catalogue sits in -- extracted from the chute (Phase 1's only prior
// builder of this shape) so Phases 2-5 stop reinventing it per Module. A
// Module supplies its own centreline as a chain of `ChannelSegment`s; this
// file turns that chain into collider and visual cuboids plus the entry/exit
// `Anchor`s and local-space `bounds` a `Footprint` needs. Three.js's
// Vector3/Quaternion are internal math scratch space only, converted to
// plain tuples before anything leaves `buildChannel` -- the same convention
// `chute/index.ts` already follows, so this file stays a legitimate Validator
// input.

/** One straight run of channel floor, in the caller's own local space --
 * `start` and `end` are the centreline's endpoints, `width` the lateral gap
 * between rails. Chain segments end-to-end (segment N's `end` equal to
 * segment N+1's `start`) for a continuous channel; `buildChannel` does not
 * enforce that, but a gap there is a gap in the built floor. */
export interface ChannelSegment {
  readonly start: Vector3;
  readonly end: Vector3;
  readonly width: number;
  /** Optional preferred local-up direction. When provided, the channel
   * frame keeps width perpendicular to both this hint and travel instead of
   * accepting the arbitrary roll of a shortest-arc +Z rotation. */
  readonly up?: Vector3;
  /** Optional full rail height for infrastructure that needs a speed-derived
   * containment wall. Modules retain the shared default when omitted. */
  readonly railHeight?: number;
}

export interface ChannelParts {
  readonly colliders: readonly ColliderSpec[];
  readonly visuals: readonly VisualSpec[];
  readonly entry: Anchor;
  readonly exit: Anchor;
  readonly route: readonly Vector3[];
  readonly bounds: Footprint["bounds"];
}

// Module-level defaults, reused from the chute's own values (its original
// per-file constants) so every channel-floor Module shares one floor/rail
// profile unless a future Module has a documented reason to differ.
export const FLOOR_THICKNESS = 0.01;
export const RAIL_THICKNESS = 0.006;
export const RAIL_HEIGHT = SCALE.marbleRadius * 6;

// Glossy injection-moulded plastic, per PLAN.md -> "Art direction" -- the
// same colors the chute shipped with, now the channel's own defaults rather
// than a per-Module choice.
const FLOOR_MATERIAL = { color: "#e8e2d0", metalness: 0.05, roughness: 0.25 };
const RAIL_MATERIAL = { color: "#d8ff42", metalness: 0.05, roughness: 0.2 };

function toVector(v: ThreeVector3): Vector3 {
  return [v.x, v.y, v.z];
}

function toQuaternion(q: ThreeQuaternion): Quaternion {
  return [q.x, q.y, q.z, q.w];
}

/** `idPrefix` plus `part`, suffixed by the segment index only when there is
 * more than one segment -- so a single-segment channel (the chute's own
 * case) reproduces bare ids like `"floor"`/`"rail-left"` exactly, while a
 * multi-segment Module gets `"floor-0"`, `"floor-1"`, ... to keep each
 * segment's colliders addressable on their own. */
function segmentId(idPrefix: string, part: string, index: number, segmentCount: number): string {
  const base = idPrefix.length > 0 ? `${idPrefix}-${part}` : part;
  return segmentCount > 1 ? `${base}-${index}` : base;
}

/** The 8 corners of a cuboid with the given half-extents, position, and
 * rotation, in the caller's local space -- used to accumulate an
 * axis-aligned `bounds` box over every collider this file emits, rather than
 * approximating it from the centreline alone (a rotated cuboid's true extent
 * can exceed what its center and half-extents alone would suggest). */
function cuboidCorners(
  halfExtents: Vector3,
  position: ThreeVector3,
  rotation: ThreeQuaternion,
): ThreeVector3[] {
  const corners: ThreeVector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(
          new ThreeVector3(sx * halfExtents[0], sy * halfExtents[1], sz * halfExtents[2])
            .applyQuaternion(rotation)
            .add(position),
        );
      }
    }
  }
  return corners;
}

/** Builds a floor cuboid plus two rail cuboids per segment, chaining segment
 * to segment. Each segment's rotation comes from `setFromUnitVectors` over
 * its own `start -> end`, never a hand-picked axis-angle sign -- see the
 * comment at `chute/index.ts`'s original construction (now delegated here)
 * for the bug that convention exists to prevent: a guessed sign is
 * self-consistent enough to typecheck while pointing every collider's real
 * world orientation somewhere other than where `entry`/`exit` claim it is. */
export function buildChannel(
  segments: readonly ChannelSegment[],
  material: ColliderMaterial,
  idPrefix: string,
): ChannelParts {
  if (segments.length === 0) {
    throw new Error("buildChannel needs at least one segment");
  }

  const colliders: ColliderSpec[] = [];
  const visuals: VisualSpec[] = [];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  const accumulate = (corners: readonly ThreeVector3[]) => {
    for (const corner of corners) {
      min[0] = Math.min(min[0], corner.x);
      min[1] = Math.min(min[1], corner.y);
      min[2] = Math.min(min[2], corner.z);
      max[0] = Math.max(max[0], corner.x);
      max[1] = Math.max(max[1], corner.y);
      max[2] = Math.max(max[2], corner.z);
    }
  };

  let entry: Anchor | undefined;
  let exit: Anchor | undefined;
  const route: Vector3[] = [];

  segments.forEach((segment, index) => {
    const { start, end, width, railHeight = RAIL_HEIGHT } = segment;
    if (!Number.isFinite(railHeight) || railHeight <= 0) {
      throw new Error("buildChannel: railHeight must be positive and finite");
    }
    const startVector = new ThreeVector3(...start);
    const endVector = new ThreeVector3(...end);
    const delta = endVector.clone().sub(startVector);
    const segmentLength = delta.length();
    if (segmentLength === 0) {
      throw new Error("buildChannel: zero-length segment");
    }

    const tangent = delta.clone().normalize();
    const pitch = (() => {
      if (!segment.up) {
        return new ThreeQuaternion().setFromUnitVectors(new ThreeVector3(0, 0, 1), tangent);
      }
      const upHint = new ThreeVector3(...segment.up).normalize();
      const lateral = upHint.clone().cross(tangent);
      if (lateral.lengthSq() < 1e-12) {
        lateral.set(0, 0, 1);
      } else {
        lateral.normalize();
      }
      const correctedUp = tangent.clone().cross(lateral).normalize();
      return new ThreeQuaternion().setFromRotationMatrix(
        new ThreeMatrix4().makeBasis(lateral, correctedUp, tangent),
      );
    })();
    const up = new ThreeVector3(0, 1, 0).applyQuaternion(pitch).normalize();

    const floorCenter = startVector.clone().add(endVector).multiplyScalar(0.5);
    // `segmentLength` (the true `start`-to-`end` distance) rather than any
    // single-axis distance the caller might otherwise reach for: the
    // chute's pre-`buildChannel` version sized its floor from its "length"
    // param alone, which is only the Z-axis run, not the slope distance to
    // an `end` that also differs in Y. That left the floor's own ends short
    // of its entry/exit anchors -- tolerable for one static Module, but a
    // chained segment can't have its faces land short of the joint.
    const floorHalfExtents: Vector3 = [width / 2, FLOOR_THICKNESS / 2, segmentLength / 2];
    const floorShape = { kind: "cuboid" as const, halfExtents: floorHalfExtents };
    const floorId = segmentId(idPrefix, "floor", index, segments.length);

    colliders.push({
      id: floorId,
      shape: floorShape,
      position: toVector(floorCenter),
      rotation: toQuaternion(pitch),
      material,
    });
    visuals.push({
      id: floorId,
      shape: floorShape,
      material: FLOOR_MATERIAL,
      position: toVector(floorCenter),
      rotation: toQuaternion(pitch),
    });
    accumulate(cuboidCorners(floorHalfExtents, floorCenter, pitch));

    for (const side of [-1, 1] as const) {
      const lateral = width / 2 + RAIL_THICKNESS / 2;
      const railCenter = floorCenter
        .clone()
        .add(new ThreeVector3(side * lateral, 0, 0).applyQuaternion(pitch))
        .add(up.clone().multiplyScalar(railHeight / 2));
      const railId = segmentId(
        idPrefix,
        side < 0 ? "rail-left" : "rail-right",
        index,
        segments.length,
      );
      const railHalfExtents: Vector3 = [RAIL_THICKNESS / 2, railHeight / 2, segmentLength / 2];
      const railShape = { kind: "cuboid" as const, halfExtents: railHalfExtents };

      colliders.push({
        id: railId,
        shape: railShape,
        position: toVector(railCenter),
        rotation: toQuaternion(pitch),
        material: { ...material, friction: 0 },
      });
      visuals.push({
        id: railId,
        shape: railShape,
        material: RAIL_MATERIAL,
        position: toVector(railCenter),
        rotation: toQuaternion(pitch),
      });
      accumulate(cuboidCorners(railHalfExtents, railCenter, pitch));
    }

    if (index === 0) {
      entry = { position: toVector(startVector), tangent: toVector(tangent), up: toVector(up) };
    }
    if (index === segments.length - 1) {
      exit = { position: toVector(endVector), tangent: toVector(tangent), up: toVector(up) };
    }

    const routeStart = toVector(startVector);
    const previous = route.at(-1);
    if (previous?.some((coordinate, axis) => coordinate !== routeStart[axis]) ?? true) {
      route.push(routeStart);
    }
    route.push(toVector(endVector));
  });

  // Always assigned: the loop above runs at least once (the length-0 guard
  // above already rejected an empty `segments`) and sets `entry` on its
  // first iteration and `exit` on its last.
  return { colliders, visuals, entry: entry!, exit: exit!, route, bounds: { min, max } };
}
