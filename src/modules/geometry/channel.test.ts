import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from "three";
import { describe, expect, it } from "vitest";

import { buildChannel, FLOOR_THICKNESS, RAIL_HEIGHT, RAIL_THICKNESS } from "./channel";
import { SCALE } from "../../race/scale";
import type { Quaternion, Vector3 } from "../../race/types";

// No renderer runs in this suite -- geometry is verified numerically, the
// same convention `revolve.test.ts` uses.

const MATERIAL = { restitution: SCALE.defaultRestitution, friction: SCALE.defaultFriction };

function magnitude(v: Vector3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

/** A cuboid's local +/-Z face center in world space -- `position` plus its
 * rotation applied to a point `signedHalfExtentZ` along local Z. Used to
 * check that two chained floors' touching faces actually coincide, not just
 * that their centers are close. */
function faceCenter(
  position: Vector3,
  rotation: Quaternion,
  signedHalfExtentZ: number,
): Vector3 {
  const point = new ThreeVector3(0, 0, signedHalfExtentZ)
    .applyQuaternion(new ThreeQuaternion(...rotation))
    .add(new ThreeVector3(...position));
  return [point.x, point.y, point.z];
}

describe("buildChannel", () => {
  it("a single segment reproduces the chute's current collider set", () => {
    const length = 0.6;
    const drop = length * 0.25;
    const width = 0.5;
    // The floor's true local-Z half-extent is half the actual entry-exit
    // distance, not half the "length" param -- entry and exit differ in Y
    // (the drop) as well as Z, so the slope distance exceeds `length`. A
    // half-extent of `length / 2` (what the pre-`buildChannel` chute used)
    // left the floor's own ends short of its entry/exit anchors; a chained
    // segment can't tolerate that gap, so `buildChannel` uses the real
    // distance instead -- a deliberate correction, not a regression.
    const segmentLength = Math.hypot(drop, length);

    const parts = buildChannel(
      [{ start: [0, 0, 0], end: [0, -drop, length], width }],
      MATERIAL,
      "",
    );

    expect(parts.colliders.map((c) => c.id).sort()).toEqual(["floor", "rail-left", "rail-right"]);
    expect(parts.visuals.map((v) => v.id).sort()).toEqual(["floor", "rail-left", "rail-right"]);

    const floor = parts.colliders.find((c) => c.id === "floor")!;
    expect(floor.shape.kind).toBe("cuboid");
    // `toBeCloseTo` on the Z half-extent only -- three.js's `Vector3.length()`
    // and `Math.hypot` can differ in the last ULP for the same inputs.
    expect(floor.shape.kind === "cuboid" ? floor.shape.halfExtents[0] : NaN).toBe(width / 2);
    expect(floor.shape.kind === "cuboid" ? floor.shape.halfExtents[1] : NaN).toBe(
      FLOOR_THICKNESS / 2,
    );
    expect(floor.shape.kind === "cuboid" ? floor.shape.halfExtents[2] : NaN).toBeCloseTo(
      segmentLength / 2,
      10,
    );
    expect(floor.material).toEqual(MATERIAL);

    const railLeft = parts.colliders.find((c) => c.id === "rail-left")!;
    const railRight = parts.colliders.find((c) => c.id === "rail-right")!;
    expect(railLeft.shape.kind).toBe("cuboid");
    expect(railLeft.shape.kind === "cuboid" ? railLeft.shape.halfExtents[0] : NaN).toBe(
      RAIL_THICKNESS / 2,
    );
    expect(railLeft.shape.kind === "cuboid" ? railLeft.shape.halfExtents[1] : NaN).toBe(
      RAIL_HEIGHT / 2,
    );
    expect(railLeft.shape.kind === "cuboid" ? railLeft.shape.halfExtents[2] : NaN).toBeCloseTo(
      segmentLength / 2,
      10,
    );
    expect(railRight.shape).toEqual(railLeft.shape);
    // Rails sit on opposite sides, so their X positions are negatives of
    // each other.
    expect(railLeft.position[0]).toBeCloseTo(-railRight.position[0], 10);
  });

  it("a two-segment chain leaves no gap at the joint", () => {
    const joint: Vector3 = [0, -0.15, 0.6];
    const parts = buildChannel(
      [
        { start: [0, 0, 0], end: joint, width: 0.5 },
        { start: joint, end: [0, -0.3, 1.2], width: 0.5 },
      ],
      MATERIAL,
      "chain",
    );

    const floor0 = parts.colliders.find((c) => c.id === "chain-floor-0")!;
    const floor1 = parts.colliders.find((c) => c.id === "chain-floor-1")!;
    expect(floor0).toBeDefined();
    expect(floor1).toBeDefined();

    // Each floor's own local +Z face (position + rotation-applied half
    // extent along Z) should land exactly on the shared joint point --
    // consecutive floor faces "touching" means that face-to-joint distance
    // stays within one marble radius, not just that centers are close.
    const halfExtentZ = floor0.shape.kind === "cuboid" ? floor0.shape.halfExtents[2] : 0;
    const face0 = faceCenter(floor0.position, floor0.rotation, halfExtentZ);
    const halfExtentZ1 = floor1.shape.kind === "cuboid" ? floor1.shape.halfExtents[2] : 0;
    const faceStart1 = faceCenter(floor1.position, floor1.rotation, -halfExtentZ1);

    const gap = magnitude([
      face0[0] - joint[0],
      face0[1] - joint[1],
      face0[2] - joint[2],
    ]);
    const gapStart1 = magnitude([
      faceStart1[0] - joint[0],
      faceStart1[1] - joint[1],
      faceStart1[2] - joint[2],
    ]);

    expect(gap).toBeLessThan(SCALE.marbleRadius);
    expect(gapStart1).toBeLessThan(SCALE.marbleRadius);
  });

  it("entry/exit tangents and ups are unit vectors", () => {
    const parts = buildChannel(
      [{ start: [0, 0, 0], end: [0.3, -0.2, 0.6], width: 0.5 }],
      MATERIAL,
      "seg",
    );

    expect(magnitude(parts.entry.tangent)).toBeCloseTo(1, 10);
    expect(magnitude(parts.entry.up)).toBeCloseTo(1, 10);
    expect(magnitude(parts.exit.tangent)).toBeCloseTo(1, 10);
    expect(magnitude(parts.exit.up)).toBeCloseTo(1, 10);
  });

  it("rejects a zero-length segment", () => {
    expect(() =>
      buildChannel([{ start: [0, 0, 0], end: [0, 0, 0], width: 0.5 }], MATERIAL, "seg"),
    ).toThrow();
  });
});
