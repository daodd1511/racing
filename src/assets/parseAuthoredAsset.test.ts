import { describe, expect, it } from "vitest";
import type { AuthoredAsset } from "./types";
import { parseAuthoredAsset } from "./parseAuthoredAsset";
import { readFileSync } from "node:fs";

type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;

function fixture(name = "start"): Mutable<AuthoredAsset> {
  return (
    JSON.parse(
      readFileSync(new URL(`../../assets/baseline/${name}.json`, import.meta.url), "utf8"),
    ) as { asset: Mutable<AuthoredAsset> }
  ).asset;
}
describe("authored asset validation", () => {
  it("preserves optional recovery boxes without adding them to baseline Specs", () => {
    const value = fixture();
    expect(parseAuthoredAsset(value).recoveryBoxes).toBeUndefined();
    value.recoveryBoxes = [{ position: [1, 2, 3], rotation: [0, 0, 0, 1], halfExtents: [1, 2, 3] }];
    expect(parseAuthoredAsset(value).recoveryBoxes).toEqual(value.recoveryBoxes);
    value.recoveryBoxes[0].halfExtents[0] = -1;
    expect(() => parseAuthoredAsset(value)).toThrow("recoveryBox");
  });
  it.each(["shape", "quaternion", "profile", "marker", "duplicate", "control"])(
    "rejects malformed %s data",
    (kind) => {
      const value = fixture();
      if (kind === "shape") value.colliders[0].shape = { kind: "ball", radius: -1 };
      if (kind === "quaternion") value.colliders[0].rotation = [0, 0, 0, 0];
      if (kind === "profile") value.colliders[0].physicalProfile = "unknown";
      if (kind === "marker") delete value.markers.gatePivot;
      if (kind === "duplicate") value.colliders.push(value.colliders[0]);
      if (kind === "control")
        value.controls.push({ target: "visual", partId: "missing", region: "wave" });
      expect(() => parseAuthoredAsset(value)).toThrow("Invalid authored asset");
    },
  );
  it("rejects non-finite coordinates", () => {
    const value = fixture();
    value.footprint.entry.position[0] = Infinity;
    expect(() => parseAuthoredAsset(value)).toThrow();
  });
});

describe("strict authored contract", () => {
  it.each([
    "root",
    "footprint",
    "anchor",
    "shape",
    "material",
    "marker",
    "binding",
    "baseline",
    "values",
  ])("rejects unknown %s keys", (kind) => {
    const value = fixture("chute");
    const targets = {
      root: value,
      footprint: value.footprint,
      anchor: value.footprint.entry,
      shape: value.colliders[0].shape,
      material: value.visuals[0].material,
      marker: value.markers,
      binding: value.controls[0],
      baseline: value.baseline!,
      values: value.baseline!.values,
    };
    Object.assign(targets[kind as keyof typeof targets], { unvalidated: { bad: Infinity } });
    expect(() => parseAuthoredAsset(value)).toThrow("unknown key");
  });
  it.each([0, 0.1, 0.9])("rejects Chute width %s outside its existing range", (width) => {
    const value = fixture("chute");
    Object.assign(value.baseline!.values, { width });
    expect(() => parseAuthoredAsset(value)).toThrow("width range");
  });
  it.each(["chute", "pin-field", "staircase", "whoops"])(
    "accepts captured %s defaults including range extensions",
    (name) => {
      expect(parseAuthoredAsset(fixture(name)).id).toBe(name);
    },
  );
  it("rejects a binding from another Module", () => {
    const value = fixture("chute");
    value.controls[0].region = "post";
    expect(() => parseAuthoredAsset(value)).toThrow("Module-specific");
  });
  it.each(["missing", "wrong", "outside"])("rejects %s repeat metadata", (kind) => {
    const value = fixture("pin-field");
    const binding = value.controls.find((v) => v.region === "post")!;
    if (kind === "missing") delete binding.repeatIndex;
    else binding.repeatIndex = kind === "wrong" ? 1 : 100;
    expect(() => parseAuthoredAsset(value)).toThrow("control binding");
  });
});
