import { useEffect, useSyncExternalStore } from "react";
import { BufferGeometry, Material, Matrix4, Mesh, Quaternion, Texture, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadAuthoredAsset, loadAuthoredCatalog } from "../catalog";
import { ASSET_IDS, type AssetId } from "../types";

const urls = import.meta.glob<string>("../authored/**/visuals.glb", {
  eager: true,
  query: "?url",
  import: "default",
});
interface LoadedMesh {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
}
export type AssetLoadState =
  | { readonly status: "idle" | "loading" | "ready" }
  | { readonly status: "error"; readonly message: string };
const READY: AssetLoadState = { status: "ready" };
let state: AssetLoadState = { status: "idle" };
let loading: Promise<void> | undefined;
const meshes = new Map<string, LoadedMesh>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => state;
const readySnapshot = () => READY;
function publish(next: AssetLoadState) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function loadAsset(id: AssetId): Promise<void> {
  if (meshes.has(`${id}:${loadAuthoredAsset(id).visuals[0]?.node}`)) return;
  const revision = loadAuthoredCatalog().assets[id].revision;
  const url = urls[`../authored/${id}/${revision}/visuals.glb`];
  if (!url) throw new Error(`Missing visual package for ${id}`);
  const gltf = await new GLTFLoader().loadAsync(url);
  const owned: BufferGeometry[] = [];
  const sourceGeometry = new Set<BufferGeometry>();
  const sourceMaterials = new Set<Material>();
  gltf.scene.traverse((object) => {
    if (object instanceof Mesh) {
      sourceGeometry.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(
        (material: Material) => sourceMaterials.add(material),
      );
    }
  });
  try {
    gltf.scene.updateMatrixWorld(true);
    const entries: [string, LoadedMesh][] = [];
    for (const visual of loadAuthoredAsset(id).visuals) {
      const node = gltf.scene.getObjectByName(visual.node);
      if (!(node instanceof Mesh) || !node.geometry.getAttribute("position"))
        throw new Error(`${id}: missing mesh ${visual.node}`);
      // Remove the saved part frame once. Runtime Spec placement owns all transforms thereafter.
      const restInverse = new Matrix4()
        .compose(
          new Vector3(...visual.position),
          new Quaternion(...visual.rotation),
          new Vector3(1, 1, 1),
        )
        .invert();
      const geometry = node.geometry.clone().applyMatrix4(restInverse.multiply(node.matrixWorld));
      owned.push(geometry);
      entries.push([`${id}:${visual.node}`, { geometry, material: node.material }]);
    }
    entries.forEach(([key, mesh]) => meshes.set(key, mesh));
  } catch (error) {
    owned.forEach((geometry) => geometry.dispose());
    const textures = new Set<Texture>();
    sourceMaterials.forEach((material) => {
      Object.values(material).forEach((value: unknown) => {
        if (value instanceof Texture) textures.add(value);
      });
      material.dispose();
    });
    textures.forEach((texture) => texture.dispose());
    throw error;
  } finally {
    sourceGeometry.forEach((geometry) => geometry.dispose());
  }
}

/** One app-lifetime cache. Failed packages retry; successful immutable packages remain shared. */
export function preloadAuthoredAssets(): Promise<void> {
  if (loading) return loading;
  if (state.status === "ready") return Promise.resolve();
  publish({ status: "loading" });
  loading = Promise.allSettled(ASSET_IDS.map(loadAsset))
    .then((results) => {
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected")
        publish({
          status: "error",
          message: failed.reason instanceof Error ? failed.reason.message : String(failed.reason),
        });
      else publish(READY);
    })
    .finally(() => {
      loading = undefined;
    });
  return loading;
}

export function useAuthoredAssets(enabled: boolean) {
  const current = useSyncExternalStore(
    subscribe,
    enabled ? snapshot : readySnapshot,
    readySnapshot,
  );
  useEffect(() => {
    if (enabled) void preloadAuthoredAssets();
  }, [enabled]);
  return { state: current, retry: preloadAuthoredAssets };
}

export function getAuthoredMesh(id: AssetId, node: string): LoadedMesh {
  const mesh = meshes.get(`${id}:${node}`);
  if (!mesh) throw new Error(`Authored mesh ${id}:${node} is not loaded`);
  return mesh;
}
