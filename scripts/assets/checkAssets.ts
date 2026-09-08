import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ASSET_IDS } from "../../src/assets/types";
import { parseAuthoredAsset } from "../../src/assets/parseAuthoredAsset";
import { hash, exporterHash, checkGlb } from "./exportAssets";

export async function checkAssets(root: string): Promise<void> {
  const catalog: unknown = JSON.parse(
    await readFile(join(root, "src/assets/authored/catalog.json"), "utf8"),
  );
  if (
    !catalog ||
    typeof catalog !== "object" ||
    !("schemaVersion" in catalog) ||
    catalog.schemaVersion !== 1 ||
    !("assets" in catalog) ||
    !catalog.assets ||
    typeof catalog.assets !== "object"
  )
    throw new Error("Invalid authored catalog");
  const entries = catalog.assets as Record<string, unknown>;
  if (Object.keys(entries).length !== ASSET_IDS.length)
    throw new Error("Catalog asset set mismatch");
  const fingerprint = await exporterHash(root);
  for (const id of ASSET_IDS) {
    const raw = entries[id];
    if (!raw || typeof raw !== "object") throw new Error(`Missing catalog entry ${id}`);
    const entry = raw as Record<string, unknown>;
    for (const key of ["revision", "sourceHash", "exporterHash", "assetHash", "visualHash"])
      if (typeof entry[key] !== "string" || !/^[a-f0-9]{64}$/.test(entry[key]))
        throw new Error(`${id}: invalid ${key}`);
    if (
      entry.exporterHash !== fingerprint ||
      hash(await readFile(join(root, "assets/blender", `${id}.blend`))) !== entry.sourceHash
    )
      throw new Error(`${id}: stale assets; run pnpm assets:export`);
    const directory = join(root, "src/assets/authored", id, String(entry.revision));
    const bytes = await readFile(join(directory, "asset.json"));
    const glb = await readFile(join(directory, "visuals.glb"));
    if (hash(bytes) !== entry.assetHash || hash(glb) !== entry.visualHash)
      throw new Error(`${id}: corrupt export; run pnpm assets:export`);
    const asset = parseAuthoredAsset(JSON.parse(bytes.toString()) as unknown);
    if (asset.id !== id) throw new Error(`${id}: wrong asset package`);
    checkGlb(
      glb,
      asset.visuals.map((visual) => visual.node),
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await checkAssets(process.cwd());
  console.log("All seven authored assets are fresh and valid.");
}
