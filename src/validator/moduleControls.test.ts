import { describe, expect, it } from "vitest";

import { chute } from "../modules/chute";
import { SCALE } from "../race/scale";
import {
  buildAccelControl,
  buildConstrainedEntryScatterControl,
  buildShuffleControl,
  buildSortControl,
  buildWideEntryScatterControl,
  pairSameSeedRuns,
} from "./moduleControls";
import type { RoleMetricRun } from "./roleMetrics";

const target = chute.buildSpec({ length: 0.6, grade: 0.25, width: SCALE.channelWidth });

describe("Module negative controls", () => {
  it.each([
    buildAccelControl(target, SCALE.channelWidth),
    buildWideEntryScatterControl(target, SCALE.channelWidth),
    buildConstrainedEntryScatterControl(target, SCALE.marbleRadius * 2.5),
    buildShuffleControl(target, SCALE.channelWidth),
    buildSortControl(target, SCALE.channelWidth),
  ])("keeps $kind anchors, route energy change, and grade", ({ spec }) => {
    expect(spec.footprint.entry).toBe(target.footprint.entry);
    expect(spec.footprint.exit).toBe(target.footprint.exit);
    expect(spec.footprint.route).not.toBe(target.footprint.route);
    expect(spec.footprint.exit.position[1] - spec.footprint.entry.position[1]).toBeCloseTo(
      target.footprint.exit.position[1] - target.footprint.entry.position[1],
    );
    expect(spec.colliders.every(({ id }) => id.includes("control"))).toBe(true);
    expect(spec.colliders.every(({ kinematic, motion }) => !kinematic && !motion)).toBe(true);
  });

  it("matches wide and constrained entry widths without sharing target obstacles", () => {
    const wide = buildWideEntryScatterControl(target, SCALE.channelWidth).spec;
    const constrainedWidth = SCALE.marbleRadius * 2.5;
    const constrained = buildConstrainedEntryScatterControl(target, constrainedWidth).spec;
    const floorWidth = (spec: typeof wide): number => {
      const floor = spec.visuals.find(({ id }) => id.includes("floor"));
      if (floor?.shape.kind !== "cuboid") throw new Error("Expected control floor cuboid");
      return floor.shape.halfExtents[0] * 2;
    };

    expect(floorWidth(wide)).toBe(SCALE.channelWidth);
    expect(floorWidth(constrained)).toBe(constrainedWidth);
    expect(wide.colliders.some(({ id }) => target.colliders.some((value) => value.id === id))).toBe(
      false,
    );
  });
});

describe("pairSameSeedRuns", () => {
  const run = (seed: number, marbleIndex: number): RoleMetricRun => ({
    seed,
    marbleIndex,
    entryTimeSeconds: 0,
    exitTimeSeconds: 1,
    entryLateral: 0,
    exitLateral: 0,
    exitSpeed: 1,
  });

  it("pairs the same seed and nominal marble input independent of array order", () => {
    const pairs = pairSameSeedRuns([run(1, 0), run(2, 0)], [run(2, 0), run(1, 0)]);
    expect(pairs.map(({ seed, control }) => [seed, control.seed])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it("rejects missing, extra, and duplicate paired runs", () => {
    expect(() => pairSameSeedRuns([run(1, 0)], [run(2, 0)])).toThrow(
      "Missing paired control run 1:0",
    );
    expect(() => pairSameSeedRuns([run(1, 0)], [run(1, 0), run(2, 0)])).toThrow(
      "Control cohort has unpaired runs",
    );
    expect(() => pairSameSeedRuns([run(1, 0)], [run(1, 0), run(1, 0)])).toThrow(
      "Duplicate control run 1:0",
    );
  });
});
