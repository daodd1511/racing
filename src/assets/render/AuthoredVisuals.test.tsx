/** @vitest-environment happy-dom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BufferGeometry, MeshStandardMaterial } from "three";
import type { ReactElement } from "react";
import { geometryForShape } from "../../modules/render/visualGeometry";
import { buildAuthoredSpec } from "../buildAuthoredSpec";
import { loadAuthoredAsset } from "../catalog";
import { AuthoredVisualMesh } from "./AuthoredVisuals";

const cache = vi.hoisted(() => ({ mesh: null as unknown }));
vi.mock("./useAuthoredAssets", () => ({ getAuthoredMesh: () => cache.mesh }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("disposes only owned deformed geometry on replacement and unmount", () => {
  const asset = loadAuthoredAsset("chute");
  const baseline = buildAuthoredSpec(asset).visuals[0];
  const shared = geometryForShape(baseline.shape);
  const material = new MeshStandardMaterial();
  cache.mesh = { geometry: shared, material };
  const sharedDispose = vi.spyOn(shared, "dispose");
  const materialDispose = vi.spyOn(material, "dispose");
  const tuned = buildAuthoredSpec(asset, {
    moduleId: "chute",
    values: { length: 0.8, grade: 0.2, width: 0.5 },
  }).visuals[0];
  const hook = renderHook(({ visual }) => AuthoredVisualMesh({ visual }), {
    initialProps: { visual: baseline },
  });
  const geometry = () =>
    (hook.result.current as ReactElement<{ geometry: BufferGeometry }>).props.geometry;
  expect(geometry()).toBe(shared);
  hook.rerender({ visual: tuned });
  const owned = geometry();
  const ownedDispose = vi.spyOn(owned, "dispose");
  expect(owned).not.toBe(shared);
  if (tuned.shape.kind !== "trimesh") throw new Error("Expected saved mesh");
  const expected = tuned.shape.vertices;
  Array.from(owned.getAttribute("position").array).forEach((value, i) =>
    expect(value).toBeCloseTo(expected[i], 6),
  );
  hook.rerender({ visual: baseline });
  expect(ownedDispose).toHaveBeenCalledTimes(1);
  hook.rerender({ visual: tuned });
  const finalDispose = vi.spyOn(geometry(), "dispose");
  hook.unmount();
  expect(finalDispose).toHaveBeenCalledTimes(1);
  expect(sharedDispose).not.toHaveBeenCalled();
  expect(materialDispose).not.toHaveBeenCalled();
});
