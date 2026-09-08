import { ASSET_IDS, type AssetId, type AuthoredAsset, type AuthoredCatalog } from "./types";
import { parseAuthoredAsset } from "./parseAuthoredAsset";

const packages = import.meta.glob<unknown>("./authored/**/asset.json", {
  eager: true,
  import: "default",
});
const catalogs = import.meta.glob<unknown>("./authored/catalog.json", {
  eager: true,
  import: "default",
});

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
let catalog: AuthoredCatalog | undefined;
const assets = new Map<AssetId, AuthoredAsset>();

export function loadAuthoredCatalog(): AuthoredCatalog {
  if (catalog) return catalog;
  const raw = catalogs["./authored/catalog.json"];
  if (
    !raw ||
    typeof raw !== "object" ||
    !("schemaVersion" in raw) ||
    raw.schemaVersion !== 1 ||
    !("assets" in raw) ||
    !raw.assets ||
    typeof raw.assets !== "object"
  )
    throw new Error("Invalid authored catalog");
  const entries = raw.assets as Record<string, unknown>;
  if (Object.keys(entries).length !== ASSET_IDS.length)
    throw new Error("Authored catalog asset set mismatch");
  for (const id of ASSET_IDS) {
    const value = entries[id];
    if (!value || typeof value !== "object") throw new Error(`Missing authored asset ${id}`);
    const entry = value as Record<string, unknown>;
    const keys = ["revision", "sourceHash", "exporterHash", "assetHash", "visualHash"];
    if (
      Object.keys(entry).length !== keys.length ||
      keys.some((key) => typeof entry[key] !== "string" || !/^[a-f0-9]{64}$/.test(entry[key]))
    )
      throw new Error(`Invalid authored revision ${id}`);
    const asset = parseAuthoredAsset(packages[`./authored/${id}/${entry.revision}/asset.json`]);
    if (asset.id !== id) throw new Error(`Authored asset ID mismatch: ${id}`);
    assets.set(id, freeze(asset));
  }
  catalog = freeze(structuredClone(raw)) as AuthoredCatalog;
  return catalog;
}

export function loadAuthoredAsset(id: AssetId): AuthoredAsset {
  loadAuthoredCatalog();
  const asset = assets.get(id);
  if (!asset) throw new Error(`Missing authored asset: ${id}`);
  return asset;
}
