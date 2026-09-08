import { describe, expect, it } from "vitest";
import { ALL_MODULES } from "../modules/registry";
import { courseParamValues } from "../course/courseModules";
import { buildFinishSpec, buildStartSpec } from "../course/startFinish";
import { assembleCourse } from "../course/assembleCourse";
import { stepCourse } from "../course/stepCourse";
import { loadAuthoredAsset, loadAuthoredCatalog } from "./catalog";
import { buildAuthoredSpec } from "./buildAuthoredSpec";
import type { AssetId } from "./types";

function near(actual: unknown, expected: unknown): void {
  if (typeof expected === "number") {
    expect(actual).toBeCloseTo(expected, 6);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    const values = actual as unknown[];
    expect(values).toHaveLength(expected.length);
    expected.forEach((v: unknown, i) => near(values[i], v));
    return;
  }
  if (expected !== null && typeof expected === "object") {
    expect(actual).not.toBeNull();
    const values = actual as Record<string, unknown>;
    Object.entries(expected).forEach(([key, v]) => near(values[key], v));
    return;
  }
  expect(actual).toBe(expected);
}

describe("authored baseline Specs", () => {
  it.each(ALL_MODULES.map((module) => module.id))(
    "preserves %s colliders, physics and markers",
    (id) => {
      const module = ALL_MODULES.find((entry) => entry.id === id)!;
      const expected = module.buildSpec(courseParamValues(module));
      const asset = loadAuthoredAsset(id as AssetId);
      const before = structuredClone(asset);
      const spec = buildAuthoredSpec(asset, asset.baseline);
      expect(spec.colliders).toHaveLength(expected.colliders.length);
      for (const collider of expected.colliders)
        near(
          spec.colliders.find((v) => v.id === collider.id),
          collider,
        );
      near(spec.footprint, expected.footprint);
      expect(spec.recoveryBoxes).toEqual(expected.recoveryBoxes);
      expect(spec.visuals.map((visual) => visual.authored?.node)).toEqual(
        asset.visuals.map((visual) => visual.node),
      );
      expect(buildAuthoredSpec(asset)).toEqual(spec);
      expect(asset).toEqual(before);
    },
  );
  it("preserves start gate motion and finish sensor semantics", () => {
    for (const [id, expected] of [
      ["start", buildStartSpec()],
      ["finish", buildFinishSpec()],
    ] as const) {
      const actual = buildAuthoredSpec(loadAuthoredAsset(id));
      for (const collider of expected.colliders)
        near(
          actual.colliders.find((v) => v.id === collider.id),
          collider,
        );
    }
  });
  it("rejects tuning changes and wrong Module controls", () => {
    const asset = loadAuthoredAsset("chute");
    expect(() =>
      buildAuthoredSpec(asset, {
        moduleId: "chute",
        values: { length: 1, grade: 0.12, width: 0.5 },
      }),
    ).toThrow("baseline");
    expect(() => buildAuthoredSpec(asset, loadAuthoredAsset("whoops").baseline)).toThrow("match");
    expect(() => buildAuthoredSpec(asset, null)).toThrow("match");
  });
  it("uses immutable JSON catalog data and retains recovery metadata", () => {
    expect(Object.isFrozen(loadAuthoredCatalog())).toBe(true);
    const asset = {
      ...loadAuthoredAsset("chute"),
      recoveryBoxes: [
        {
          position: [0, 0, 1] as const,
          rotation: [0, 0, 0, 1] as const,
          halfExtents: [0.1, 0.2, 0.3] as const,
        },
      ],
    };
    expect(buildAuthoredSpec(asset).recoveryBoxes).toEqual(asset.recoveryBoxes);
  });
  it("assembles the same seeded inventory and uses shared gate stepping", () => {
    const original = assembleCourse(7);
    const authored = assembleCourse(7, { source: "authored" });
    expect(authored.modules.map((module) => module.moduleId)).toEqual(
      original.modules.map((module) => module.moduleId),
    );
    expect(authored.modules.every(({ spec }) => spec.visuals.every((v) => v.authored))).toBe(true);
    near(authored.entry, original.entry);
    near(authored.exit, original.exit);
    near(stepCourse(authored, 0.1), stepCourse(original, 0.1));
  });
});
