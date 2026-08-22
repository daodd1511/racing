import { describe, expect, it } from "vitest";

import { START_POSITIONS, buildFinishSpec, buildStartSpec, stepStartGate } from "./startFinish";

describe("Start infrastructure", () => {
  it("provides a fixed 5-wide by 3-deep corral", () => {
    expect(START_POSITIONS).toHaveLength(15);
    expect(new Set(START_POSITIONS.map(([x]) => x)).size).toBe(5);
    expect(new Set(START_POSITIONS.map(([, , z]) => z)).size).toBe(3);
    expect(new Set(START_POSITIONS.map((position) => position.join(":"))).size).toBe(15);
    expect(Object.isFrozen(START_POSITIONS)).toBe(true);
  });

  it("opens one shared kinematic gate deterministically from race time zero", () => {
    const spec = buildStartSpec();
    const snapshot = structuredClone(spec);
    const closed = stepStartGate(spec, 0);
    const opening = stepStartGate(spec, 0.1);
    const open = stepStartGate(spec, 1);

    expect(closed).toEqual(stepStartGate(spec, -1));
    expect(opening).not.toEqual(closed);
    expect(open).toEqual(stepStartGate(spec, 0.2));
    expect(open).toEqual(stepStartGate(spec, 10));
    expect(spec).toEqual(snapshot);
    expect(spec.colliders.filter(({ kinematic }) => kinematic)).toHaveLength(1);
  });
});

describe("Finish infrastructure", () => {
  it("uses one finite cuboid sensor before a physical catch tray", () => {
    const spec = buildFinishSpec();
    const sensors = spec.colliders.filter(({ sensor }) => sensor);

    expect(sensors).toHaveLength(1);
    expect(sensors[0].id).toBe("photo-finish-sensor");
    expect(sensors[0].shape.kind).toBe("cuboid");
    expect(spec.colliders.some(({ id }) => id === "finish-catch-wall")).toBe(true);
    expect(spec.footprint.route[0]).toEqual(spec.footprint.entry.position);
    expect(spec.footprint.route.at(-1)).toEqual(spec.footprint.exit.position);
  });
});
