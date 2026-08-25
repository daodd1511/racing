import { describe, expect, it } from "vitest";

import type { Spec } from "../types";
import { mergeStaticVisualsByMaterial } from "./visualGeometry";

const material = Object.freeze({ color: "#ffffff", metalness: 0, roughness: 1 });

function spec(color: string = material.color): Spec {
  return {
    colliders: [],
    visuals: [
      {
        id: `box-${color}`,
        shape: { kind: "cuboid", halfExtents: [0.5, 0.5, 0.5] },
        material: { ...material, color },
        position: [2, 0, 0],
        rotation: [0, 0, 0, 1],
      },
    ],
    footprint: {
      cells: [],
      entry: { position: [0, 0, 0], tangent: [0, 0, 1], up: [0, 1, 0] },
      exit: { position: [0, 0, 1], tangent: [0, 0, 1], up: [0, 1, 0] },
      route: [
        [0, 0, 0],
        [0, 0, 1],
      ],
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    },
  };
}

describe("mergeStaticVisualsByMaterial", () => {
  it("merges transformed visuals that share a material", () => {
    const batches = mergeStaticVisualsByMaterial([spec(), spec()]);

    expect(batches).toHaveLength(1);
    batches[0].geometry.computeBoundingBox();
    expect(batches[0].geometry.boundingBox?.min.x).toBeCloseTo(1.5);
    expect(batches[0].geometry.boundingBox?.max.x).toBeCloseTo(2.5);

    batches.forEach(({ geometry }) => geometry.dispose());
  });

  it("keeps different materials in separate batches", () => {
    const batches = mergeStaticVisualsByMaterial([spec(), spec("#000000")]);

    expect(batches).toHaveLength(2);

    batches.forEach(({ geometry }) => geometry.dispose());
  });
});
