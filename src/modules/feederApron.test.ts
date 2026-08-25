import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";

import { buildWorld } from "../validator/buildWorld";
import { FEEDER_APRON_LENGTH, buildFeederApronSpec } from "./feederApron";
import type { Anchor } from "./types";

const ENTRY: Anchor = Object.freeze({
  position: [1, 2, 3],
  tangent: [0, 0, 1],
  up: [0, 1, 0],
} satisfies Anchor);

beforeAll(async () => {
  await RAPIER.init();
});

describe("buildFeederApronSpec", () => {
  it("is pure and terminates at the Module entry plane", () => {
    const first = buildFeederApronSpec(ENTRY);
    const second = buildFeederApronSpec(ENTRY);

    expect(second).toEqual(first);
    expect(first.footprint.exit).toBe(ENTRY);
    expect(first.footprint.route.at(-1)).toEqual(ENTRY.position);
    expect(first.footprint.entry.position).toEqual([1, 2, 3 - FEEDER_APRON_LENGTH]);
  });

  it("keeps rendered visuals and headless colliders in the same frame", () => {
    const spec = buildFeederApronSpec(ENTRY);
    const visualsById = new Map(spec.visuals.map((visual) => [visual.id, visual]));

    for (const collider of spec.colliders) {
      const visual = visualsById.get(collider.id);
      expect(visual).toBeDefined();
      expect(visual?.rotation).toEqual(collider.rotation);
    }

    expect(visualsById.get("feeder-apron-floor")?.position).toEqual(
      spec.colliders.find(({ id }) => id === "feeder-apron-floor")?.position,
    );

    const built = buildWorld([spec]);
    try {
      for (const collider of spec.colliders) {
        const headless = built.colliders.get(collider.id);
        const translation = headless?.translation();
        expect(translation).toBeDefined();
        expect(translation?.x).toBeCloseTo(collider.position[0]);
        expect(translation?.y).toBeCloseTo(collider.position[1]);
        expect(translation?.z).toBeCloseTo(collider.position[2]);
      }
    } finally {
      built.world.free();
    }
  });
});
