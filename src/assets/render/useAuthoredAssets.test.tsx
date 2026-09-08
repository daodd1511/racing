/** @vitest-environment happy-dom */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Box3, BufferGeometry, Float32BufferAttribute } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadAuthoredAsset, loadAuthoredCatalog } from "../catalog";
import { ASSET_IDS } from "../types";
import { getAuthoredMesh, useAuthoredAssets } from "./useAuthoredAssets";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("blocks failed loading, retries only the failed package, and shares normalized GLB geometry", async () => {
  let failChute = true;
  const loader = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(async (url) => {
    const id = ASSET_IDS.find((candidate) => url.includes(`/${candidate}/`));
    if (!id) throw new Error("Unexpected GLB URL");
    if (id === "chute" && failChute) throw new Error("test network failure");
    const revision = loadAuthoredCatalog().assets[id].revision;
    const bytes = await readFile(
      resolve(process.cwd(), "src/assets/authored", id, revision, "visuals.glb"),
    );
    return new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  });
  const hook = renderHook(({ enabled }) => useAuthoredAssets(enabled), {
    initialProps: { enabled: false },
  });
  expect(hook.result.current.state).toEqual({ status: "ready" });
  expect(loader).not.toHaveBeenCalled();
  hook.rerender({ enabled: true });
  await waitFor(() =>
    expect(hook.result.current.state).toEqual({ status: "error", message: "test network failure" }),
  );
  expect(() => getAuthoredMesh("chute", "floor")).toThrow("not loaded");
  expect(loader).toHaveBeenCalledTimes(7);
  failChute = false;
  await act(async () => {
    await hook.result.current.retry();
  });
  expect(hook.result.current.state).toEqual({ status: "ready" });
  expect(loader).toHaveBeenCalledTimes(8);
  for (const id of ASSET_IDS)
    for (const visual of loadAuthoredAsset(id).visuals) {
      expect(visual.shape.kind).toBe("trimesh");
      if (visual.shape.kind !== "trimesh") continue;
      const expected = new BufferGeometry().setAttribute(
        "position",
        new Float32BufferAttribute(visual.shape.vertices, 3),
      );
      expected.computeBoundingBox();
      const geometry = getAuthoredMesh(id, visual.node).geometry;
      geometry.computeBoundingBox();
      const actualBounds = geometry.boundingBox as Box3;
      const expectedBounds = expected.boundingBox as Box3;
      for (const key of ["min", "max"] as const)
        actualBounds[key]
          .toArray()
          .forEach((value, axis) =>
            expect(value).toBeCloseTo(expectedBounds[key].toArray()[axis], 5),
          );
      expected.dispose();
    }
  const cached = getAuthoredMesh("chute", "floor").geometry;
  const dispose = vi.spyOn(cached, "dispose");
  hook.unmount();
  const second = renderHook(() => useAuthoredAssets(true));
  expect(second.result.current.state.status).toBe("ready");
  expect(getAuthoredMesh("chute", "floor").geometry).toBe(cached);
  expect(dispose).not.toHaveBeenCalled();
  expect(loader).toHaveBeenCalledTimes(8);
});
