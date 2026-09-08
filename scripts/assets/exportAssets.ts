import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, mkdtemp, rename, open, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ASSET_IDS,
  type AuthoredCatalog,
  type AssetId,
  type AssetRevision,
} from "../../src/assets/types";
import { parseAuthoredAsset } from "../../src/assets/parseAuthoredAsset";

export const hash = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");
export async function exporterHash(root: string): Promise<string> {
  const paths = [
    "scripts/blender/export.py",
    "scripts/assets/exportAssets.ts",
    "src/assets/parseAuthoredAsset.ts",
    "src/assets/types.ts",
    "src/assets/physicsProfiles.ts",
  ];
  return hash(
    Buffer.concat(
      await Promise.all(
        paths.map(async (path) =>
          Buffer.concat([Buffer.from(path + "\0"), await readFile(join(root, path))]),
        ),
      ),
    ),
  );
}
export function checkGlb(bytes: Buffer, nodes: readonly string[]): void {
  if (
    bytes.length < 20 ||
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length ||
    bytes.readUInt32LE(16) !== 0x4e4f534a
  )
    throw new Error("Invalid GLB header");
  const length = bytes.readUInt32LE(12);
  const data: unknown = JSON.parse(bytes.subarray(20, 20 + length).toString());
  if (!data || typeof data !== "object" || !("nodes" in data) || !Array.isArray(data.nodes))
    throw new Error("GLB missing nodes");
  const names = data.nodes.map((node: unknown) =>
    node && typeof node === "object" && "name" in node ? node.name : undefined,
  );
  for (const name of nodes)
    if (names.filter((candidate) => candidate === name).length !== 1)
      throw new Error(`GLB missing/duplicate visual node ${name}`);
}
export type ExportRunner = (source: string, staging: string) => Promise<void>;

/** All seven revisions validate before the single catalog publication. Old packages are never overwritten. */
export async function publishAssets(root: string, run: ExportRunner): Promise<AuthoredCatalog> {
  const output = join(root, "src/assets/authored");
  await mkdir(output, { recursive: true });
  const lockPath = join(output, ".export.lock");
  const lock = await open(lockPath, "wx");
  try {
    const fingerprint = await exporterHash(root);
    const assets = {} as Record<AssetId, AssetRevision>;
    for (const id of ASSET_IDS) {
      const source = join(root, "assets/blender", `${id}.blend`);
      const sourceHash = hash(await readFile(source));
      const staging = await mkdtemp(join(output, ".staging-"));
      await run(source, staging);
      if (hash(await readFile(source)) !== sourceHash)
        throw new Error(`${id}: source changed during export; retry`);
      const assetBytes = await readFile(join(staging, "asset.json"));
      const asset = parseAuthoredAsset(JSON.parse(assetBytes.toString()) as unknown);
      if (asset.id !== id) throw new Error(`${id}: exported wrong asset`);
      const visualBytes = await readFile(join(staging, "visuals.glb"));
      checkGlb(
        visualBytes,
        asset.visuals.map((visual) => visual.node),
      );
      const assetHash = hash(assetBytes);
      const visualHash = hash(visualBytes);
      const revision = hash(`${sourceHash}:${fingerprint}:${assetHash}:${visualHash}`);
      const parent = join(output, id);
      await mkdir(parent, { recursive: true });
      const destination = join(parent, revision);
      try {
        await rename(staging, destination);
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            ["EEXIST", "ENOTEMPTY"].includes(String(error.code))
          )
        )
          throw error;
        if (
          hash(await readFile(join(destination, "asset.json"))) !== assetHash ||
          hash(await readFile(join(destination, "visuals.glb"))) !== visualHash
        )
          throw new Error(`${id}: immutable revision conflict`);
      }
      assets[id] = { revision, sourceHash, exporterHash: fingerprint, assetHash, visualHash };
    }
    // Catch saves to an earlier source while a later asset was exporting.
    for (const id of ASSET_IDS)
      if (
        hash(await readFile(join(root, "assets/blender", `${id}.blend`))) !== assets[id].sourceHash
      )
        throw new Error(`${id}: source changed during publication`);
    if ((await exporterHash(root)) !== fingerprint)
      throw new Error("Exporter changed during publication");
    const catalog: AuthoredCatalog = { schemaVersion: 1, assets };
    const temporary = join(output, `.catalog-${randomUUID()}.json`);
    const file = await open(temporary, "wx");
    try {
      await file.writeFile(JSON.stringify(catalog, null, 2) + "\n");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, join(output, "catalog.json"));
    return catalog;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.cwd();
  const blender = process.env.BLENDER_BIN || "/Applications/Blender.app/Contents/MacOS/Blender";
  await publishAssets(root, async (source, staging) => {
    execFileSync(
      blender,
      [
        "--background",
        source,
        "--python-exit-code",
        "1",
        "--python",
        join(root, "scripts/blender/export.py"),
        "--",
        staging,
      ],
      { stdio: "inherit" },
    );
  });
}
