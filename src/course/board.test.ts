import { describe, expect, it } from "vitest";

import { defaultParamValues } from "../modules/params";
import { ALL_MODULES } from "../modules/registry";
import { SCALE } from "../race/scale";
import { BOARD } from "./board";
import { CONNECTOR_EDGE_CLEARANCE } from "./connectors";

describe("BOARD", () => {
  it("has fixed 8x3 dimensions aligned to the Cell pitch", () => {
    expect(BOARD.columns).toBe(8);
    expect(BOARD.rows).toBe(3);
    expect(BOARD.cellPitch).toBe(SCALE.cellPitch);

    const width = BOARD.bounds.max[0] - BOARD.bounds.min[0];
    const height = BOARD.bounds.max[1] - BOARD.bounds.min[1];
    expect(width).toBeCloseTo(BOARD.columns * BOARD.bayWidth + BOARD.edgeMargin * 2, 10);
    expect(height).toBeCloseTo(BOARD.rows * BOARD.bayHeight + BOARD.edgeMargin * 2, 10);
    expect(BOARD.edgeMargin).toBeGreaterThanOrEqual(CONNECTOR_EDGE_CLEARANCE);
    expect(width / SCALE.cellPitch).toBeCloseTo(Math.round(width / SCALE.cellPitch), 10);
    expect(height / SCALE.cellPitch).toBeCloseTo(Math.round(height / SCALE.cellPitch), 10);
    expect(Object.isFrozen(BOARD)).toBe(true);
    expect(Object.isFrozen(BOARD.bounds)).toBe(true);
  });

  it.each(ALL_MODULES)("fits $id default projected bounds in one fixed bay", (module) => {
    const bounds = module.buildSpec(defaultParamValues(module.meta.params)).footprint.bounds;
    const travel = bounds.max[2] - bounds.min[2];
    const vertical = bounds.max[1] - bounds.min[1];

    expect(travel).toBeLessThan(BOARD.bayWidth);
    expect(vertical).toBeLessThan(BOARD.bayHeight);
  });
});

it("derives Board dimensions from configured Specs and rejects incomplete/invalid input", async () => {
  const { ARC } = await import("./arc");
  const { buildBoard } = await import("./board");
  const { courseParamValues } = await import("./courseModules");
  const { buildStartSpec, buildFinishSpec } = await import("./startFinish");
  const specs = ARC.map((slot) => {
    if (slot.kind !== "module") return slot.kind === "start" ? buildStartSpec() : buildFinishSpec();
    const module = ALL_MODULES.find((entry) => entry.id === slot.fixedModuleId)!;
    return module.buildSpec(courseParamValues(module));
  });
  expect(buildBoard(specs)).toEqual(BOARD);
  const wider = specs.map((spec) => ({
    ...spec,
    footprint: {
      ...spec.footprint,
      bounds: {
        ...spec.footprint.bounds,
        max: [
          spec.footprint.bounds.max[0],
          spec.footprint.bounds.max[1],
          spec.footprint.bounds.max[2] + 1,
        ] as const,
      },
    },
  }));
  expect(buildBoard(wider).bayWidth).toBeGreaterThan(BOARD.bayWidth);
  expect(() => buildBoard([])).toThrow("Slot Specs");
  const invalid = [...specs];
  invalid[1] = {
    ...specs[1],
    footprint: {
      ...specs[1].footprint,
      entry: { ...specs[1].footprint.entry, position: [0, Number.NaN, 0] },
    },
  };
  expect(() => buildBoard(invalid)).toThrow("non-finite Anchors");
});
