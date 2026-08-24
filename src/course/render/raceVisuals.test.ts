import { describe, expect, it } from "vitest";

import type { Spec, VisualSpec } from "../../modules/types";
import { raceVisibleSpec } from "./raceVisuals";

function visual(id: string): VisualSpec {
  return {
    id,
    shape: { kind: "cuboid", halfExtents: [1, 1, 1] },
    material: { color: "#fff", metalness: 0, roughness: 1 },
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
  };
}

describe("raceVisibleSpec", () => {
  it("replaces segmented connector floors and walls with continuous race visuals", () => {
    const colliders: Spec["colliders"] = [
      {
        id: "connector-2-3-roof-4",
        shape: { kind: "cuboid", halfExtents: [1, 1, 1] },
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        material: { restitution: 0, friction: 0 },
      },
    ];
    const spec: Spec = {
      colliders,
      visuals: [
        visual("connector-2-3-floor-4"),
        visual("connector-2-3-rail-left-4"),
        visual("connector-2-3-rail-right"),
        visual("connector-2-3-roof-4"),
        visual("connector-2-3-governor-ceiling-4"),
        visual("connector-2-3-governor-axle-4"),
      ],
      footprint: {
        cells: [],
        entry: { position: [0, 0, 0], tangent: [0, -1, 0], up: [0, 0, 1] },
        exit: { position: [0, -1, 0], tangent: [0, -1, 0], up: [0, 0, 1] },
        route: [
          [0, 0, 0],
          [0, -1, 0],
        ],
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      },
    };

    const visible = raceVisibleSpec(spec);

    expect(visible.colliders).toBe(colliders);
    expect(visible.visuals.map(({ id }) => id)).toEqual([
      "connector-2-3-governor-axle-4",
      "connector-2-3-race-floor",
      "connector-2-3-race-rail-left",
      "connector-2-3-race-rail-right",
    ]);
    expect(visible.visuals.slice(1).every(({ shape }) => shape.kind === "trimesh")).toBe(true);
    expect(visible.colliders).toBe(colliders);
  });

  it("preserves specs that have no overhead connector visuals", () => {
    const spec = {
      colliders: [],
      visuals: [visual("module-1-floor")],
      footprint: {
        cells: [],
        entry: { position: [0, 0, 0], tangent: [0, -1, 0], up: [0, 0, 1] },
        exit: { position: [0, -1, 0], tangent: [0, -1, 0], up: [0, 0, 1] },
        route: [
          [0, 0, 0],
          [0, -1, 0],
        ],
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      },
    } satisfies Spec;

    expect(raceVisibleSpec(spec)).toBe(spec);
  });
});
