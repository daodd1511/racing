import { describe, expect, it } from "vitest";

import { RAIL_HEIGHT } from "../modules/geometry/channel";
import { SCALE } from "../race/scale";
import type { Anchor } from "../modules/types";
import { buildCourseConnector } from "./connectors";

function anchor(position: readonly [number, number, number], tangentX: number): Anchor {
  return { position, tangent: [tangentX, 0, 0], up: [0, 1, 0] };
}

describe("buildCourseConnector", () => {
  it("builds a short continuously descending same-row link", () => {
    const connector = buildCourseConnector({
      id: "connector-1-2",
      fromSlotIndex: 1,
      toSlotIndex: 2,
      start: anchor([0, 0, 0], 1),
      end: anchor([0.4, -0.05, 0], 1),
      incomingSpeed: 0,
    });

    expect(connector.spec.footprint.route).toHaveLength(65);
    expect(connector.spec.colliders).toHaveLength(3);
    expect(connector.spec.colliders.map(({ id }) => id)).toEqual([
      "connector-1-2-continuous-channel-floor",
      "connector-1-2-continuous-channel-rail-left",
      "connector-1-2-continuous-channel-rail-right",
    ]);
    expect(
      connector.spec.colliders.every(
        ({ shape, material }) => shape.kind === "trimesh" && material.restitution === 0,
      ),
    ).toBe(true);
    expect(connector.spec.footprint.entry.position).toEqual([0, 0, 0]);
    expect(connector.spec.footprint.exit.position).toEqual([0.4, -0.05, 0]);
  });

  it("builds an overlapping downhill hairpin with speed-derived rails", () => {
    const incomingSpeed = 2;
    const connector = buildCourseConnector({
      id: "connector-2-3",
      fromSlotIndex: 2,
      toSlotIndex: 3,
      start: anchor([1, 0, 0], 1),
      end: anchor([1, -1, 0], -1),
      incomingSpeed,
      speedGovernor: true,
    });
    const route = connector.spec.footprint.route;
    const expectedRailHeight = Math.max(
      RAIL_HEIGHT,
      (incomingSpeed * incomingSpeed) / (2 * Math.hypot(...SCALE.gravity)) + SCALE.marbleRadius * 2,
    );
    const rail = connector.spec.visuals.find(({ id }) => id.includes("rail-left"));

    expect(route).toHaveLength(97);
    expect(route[1][0]).toBeGreaterThan(route[0][0]);
    expect(Math.max(...route.map(([x]) => x))).toBeGreaterThan(
      Math.max(route[0][0], route.at(-1)![0]),
    );
    expect(route.every((point, index) => index === 0 || point[1] < route[index - 1][1])).toBe(true);
    expect(connector.spec.colliders).toHaveLength(3);
    expect(
      connector.spec.colliders.every(
        ({ shape, material }) => shape.kind === "trimesh" && material.restitution === 0,
      ),
    ).toBe(true);
    expect(rail?.shape.kind).toBe("cuboid");
    expect(rail?.shape.kind === "cuboid" ? rail.shape.halfExtents[1] * 2 : 0).toBeCloseTo(
      expectedRailHeight,
      10,
    );
  });

  it("rejects uphill, non-consecutive, and invalid-speed requests", () => {
    const base = {
      id: "connector-1-2",
      fromSlotIndex: 1,
      toSlotIndex: 2,
      start: anchor([0, 0, 0], 1),
      end: anchor([0.4, -0.05, 0], 1),
      incomingSpeed: 1,
    } as const;

    expect(() => buildCourseConnector({ ...base, end: anchor([0.4, 0, 0], 1) })).toThrow(/descend/);
    expect(() => buildCourseConnector({ ...base, toSlotIndex: 3 })).toThrow(/consecutive/);
    expect(() => buildCourseConnector({ ...base, incomingSpeed: Number.NaN })).toThrow(/speed/);
  });
});
