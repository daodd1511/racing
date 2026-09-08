import { Quaternion, Vector3 } from "three";
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
  it("rejects out-of-range tuning and wrong Module controls", () => {
    const asset = loadAuthoredAsset("chute");
    expect(() =>
      buildAuthoredSpec(asset, {
        moduleId: "chute",
        values: { length: 10, grade: 0.12, width: 0.5 },
      }),
    ).toThrow("chute.length");
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

describe("authored tuning", () => {
  const changes = [
    { moduleId: "chute", values: { length: 0.9, grade: 0.25, width: 0.6 } },
    {
      moduleId: "pin-field",
      values: {
        rowCount: 6,
        postSpacing: 0.11,
        postHeight: 0.06,
        postWidth: 0.03,
        rowPitch: 0.14,
        courseGrade: 0.12,
      },
    },
    { moduleId: "staircase", values: { stepCount: 6, tread: 0.12, riseHeight: 0.03, width: 0.5 } },
    {
      moduleId: "whoops",
      values: { amplitude: 0.01, wavelength: 0.3, length: 1.2, grade: 0.45, width: 0.5 },
    },
  ] as const;
  it.each(changes)(
    "aligns $moduleId tuned colliders and anchors with the control frames",
    (tuning) => {
      const asset = loadAuthoredAsset(tuning.moduleId);
      const before = structuredClone(asset);
      const tuned = buildAuthoredSpec(asset, tuning);
      const reference = ALL_MODULES.find((module) => module.id === tuning.moduleId)!.buildSpec({
        ...tuning.values,
      });
      near(tuned.footprint.entry, reference.footprint.entry);
      near(tuned.footprint.exit, reference.footprint.exit);
      near(tuned.footprint.route, reference.footprint.route);
      expect(tuned.colliders).toHaveLength(reference.colliders.length);
      for (const part of reference.colliders) {
        const actual = tuned.colliders.find(({ id }) => id === part.id)!;
        if (part.shape.kind === "trimesh" && actual.shape.kind === "trimesh") {
          // A plane can carry its width offset in its frame or vertices; compare physical points.
          const world = (vertices: readonly number[], frame: typeof part) => {
            const points: number[][] = [];
            for (let i = 0; i < vertices.length; i += 3) {
              const p = new Vector3(...vertices.slice(i, i + 3))
                .applyQuaternion(new Quaternion(...frame.rotation))
                .add(new Vector3(...frame.position));
              points.push([p.x, p.y, p.z]);
            }
            return points;
          };
          near(world(actual.shape.vertices, actual), world(part.shape.vertices, part));
          expect(actual.shape.indices).toEqual(part.shape.indices);
          expect(actual.material).toEqual(part.material);
        } else near(actual, part);
      }
      expect(tuned.visuals.every((visual) => visual.authored?.deformed)).toBe(true);
      expect(asset).toEqual(before);
      expect(buildAuthoredSpec(asset, tuning)).toEqual(tuned);
      expect(buildAuthoredSpec(asset)).toEqual(buildAuthoredSpec(before));
    },
  );
  it("preserves a saved mesh edit rather than replacing it with generated geometry", () => {
    const source = loadAuthoredAsset("chute");
    const floor = source.visuals.find((visual) => visual.id === "floor")!;
    if (floor.shape.kind !== "trimesh") throw new Error("Expected saved mesh");
    const vertices = [...floor.shape.vertices];
    vertices[1] += 0.002;
    const edited = {
      ...source,
      visuals: source.visuals.map((visual) =>
        visual === floor ? { ...floor, shape: { ...floor.shape, vertices } } : visual,
      ),
    };
    const tuned = buildAuthoredSpec(edited, changes[0]);
    const unedited = buildAuthoredSpec(source, changes[0]);
    const actual = tuned.visuals.find((visual) => visual.id === "floor")!.shape;
    const original = unedited.visuals.find((visual) => visual.id === "floor")!.shape;
    if (actual.kind !== "trimesh" || original.kind !== "trimesh")
      throw new Error("Expected saved mesh");
    expect(actual.vertices[1] - original.vertices[1]).toBeCloseTo(0.002, 8);
  });
  it("transforms supported recovery boxes and rejects unbound nonlinear recovery", () => {
    const source = loadAuthoredAsset("chute");
    const floor = source.colliders.find((part) => part.id === "floor")!;
    const box = {
      position: floor.position,
      rotation: floor.rotation,
      halfExtents: [0.2, 0.1, 0.2] as const,
    };
    const tuned = buildAuthoredSpec(
      { ...source, recoveryBoxes: [box] },
      { moduleId: "chute", values: { length: 1.2, grade: 0.12, width: 0.5 } },
    );
    expect(tuned.recoveryBoxes![0].halfExtents[2]).toBeCloseTo(0.4, 6);
    const pin = loadAuthoredAsset("pin-field");
    expect(() => buildAuthoredSpec({ ...pin, recoveryBoxes: [box] }, changes[1])).toThrow(
      "recovery boxes",
    );
  });
  it("rejects primitive shear rather than approximating a different collider", () => {
    const source = loadAuthoredAsset("staircase");
    const angle = Math.PI / 8;
    const edited = {
      ...source,
      colliders: source.colliders.map((part) =>
        part.id === "riser-0"
          ? { ...part, rotation: [0, 0, Math.sin(angle), Math.cos(angle)] as const }
          : part,
      ),
    };
    expect(() => buildAuthoredSpec(edited, changes[2])).toThrow("shear");
  });
});

describe("authored marker deformation", () => {
  const cases = [
    { moduleId: "chute", values: { length: 0.9, grade: 0.3, width: 0.6 } },
    {
      moduleId: "pin-field",
      values: {
        rowCount: 6,
        postSpacing: 0.11,
        postHeight: 0.06,
        postWidth: 0.03,
        rowPitch: 0.14,
        courseGrade: 0.12,
      },
    },
    { moduleId: "staircase", values: { stepCount: 10, tread: 0.12, riseHeight: 0.03, width: 0.5 } },
    { moduleId: "staircase", values: { stepCount: 6, tread: 0.12, riseHeight: 0.03, width: 0.5 } },
    {
      moduleId: "whoops",
      values: { amplitude: 0.01, wavelength: 0.3, length: 1.2, grade: 0.45, width: 0.5 },
    },
  ] as const;
  it.each(cases)("keeps saved endpoint offsets aligned for $moduleId", (tuning) => {
    const asset = loadAuthoredAsset(tuning.moduleId);
    const shifted = (point: readonly number[]) =>
      [point[0] + 0.01, point[1] + 0.002, point[2] + 0.003] as const;
    const entry = { ...asset.footprint.entry, position: shifted(asset.footprint.entry.position) };
    const exit = { ...asset.footprint.exit, position: shifted(asset.footprint.exit.position) };
    const edited = {
      ...asset,
      footprint: {
        ...asset.footprint,
        entry,
        exit,
        route: asset.footprint.route.map((point, i, route) =>
          i === 0 ? entry.position : i === route.length - 1 ? exit.position : point,
        ),
      },
    };
    const tuned = buildAuthoredSpec(edited, tuning);
    near(tuned.footprint.route[0], tuned.footprint.entry.position);
    near(tuned.footprint.route.at(-1), tuned.footprint.exit.position);
    const expectedX = tuning.moduleId === "chute" ? 0.012 : 0.01;
    expect(tuned.footprint.entry.position[0]).toBeCloseTo(expectedX, 8);
    expect(tuned.footprint.exit.position[0]).toBeCloseTo(expectedX, 8);
    for (const anchor of [tuned.footprint.entry, tuned.footprint.exit]) {
      expect(Math.hypot(...anchor.tangent)).toBeCloseTo(1, 8);
      expect(Math.hypot(...anchor.up)).toBeCloseTo(1, 8);
      expect(anchor.tangent.reduce((sum, value, i) => sum + value * anchor.up[i], 0)).toBeCloseTo(
        0,
        6,
      );
    }
  });
  it("preserves a Staircase exit edit independently of its route endpoint", () => {
    const asset = loadAuthoredAsset("staircase");
    const edited = {
      ...asset,
      footprint: {
        ...asset.footprint,
        exit: {
          ...asset.footprint.exit,
          position: [
            0.01,
            asset.footprint.exit.position[1],
            asset.footprint.exit.position[2],
          ] as const,
        },
      },
    };
    for (const stepCount of [10, 6]) {
      const spec = buildAuthoredSpec(edited, {
        moduleId: "staircase",
        values: { stepCount, tread: 0.12, riseHeight: 0.03, width: 0.5 },
      });
      expect(spec.footprint.exit.position[0]).toBeCloseTo(0.01, 8);
      expect(spec.footprint.route.at(-1)![0]).toBeCloseTo(0, 8);
    }
  });
  it("moves an edited Chute marker with the saved floor geometry under width, length and slope controls", () => {
    const asset = loadAuthoredAsset("chute");
    const floor = asset.visuals.find((part) => part.id === "floor")!;
    if (floor.shape.kind !== "trimesh") throw new Error("Expected saved mesh");
    const point = new Vector3(0.01, 0.004, 0.015);
    const local = point
      .clone()
      .sub(new Vector3(...floor.position))
      .applyQuaternion(new Quaternion(...floor.rotation).invert());
    const vertices = [...floor.shape.vertices];
    vertices.splice(0, 3, local.x, local.y, local.z);
    const edited = {
      ...asset,
      visuals: asset.visuals.map((part) =>
        part === floor ? { ...floor, shape: { ...floor.shape, vertices } } : part,
      ),
      footprint: {
        ...asset.footprint,
        entry: { ...asset.footprint.entry, position: [point.x, point.y, point.z] as const },
      },
    };
    const tuned = buildAuthoredSpec(edited, cases[0]);
    const actual = tuned.visuals.find((part) => part.id === "floor")!;
    if (actual.shape.kind !== "trimesh") throw new Error("Expected saved mesh");
    const world = new Vector3(...actual.shape.vertices.slice(0, 3))
      .applyQuaternion(new Quaternion(...actual.rotation))
      .add(new Vector3(...actual.position));
    near([world.x, world.y, world.z], tuned.footprint.entry.position);
  });
});
