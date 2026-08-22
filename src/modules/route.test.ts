import { describe, expect, it } from "vitest";

import { defaultParamValues } from "./params";
import { ALL_MODULES } from "./registry";
import type { Vector3 } from "../race/types";

function distance(a: Vector3, b: Vector3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe.each(ALL_MODULES)("$id route", (module) => {
  const spec = module.buildSpec(defaultParamValues(module.meta.params));
  const { entry, exit, route } = spec.footprint;

  it("runs from the entry Anchor to the exit Anchor through finite points", () => {
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(route[0]).toEqual(entry.position);
    expect(route.at(-1)).toEqual(exit.position);

    for (const point of route) {
      expect(point.every(Number.isFinite)).toBe(true);
    }
  });

  it("has no zero-length segment", () => {
    for (let index = 1; index < route.length; index += 1) {
      expect(distance(route[index - 1], route[index])).toBeGreaterThan(0);
    }
  });
});
