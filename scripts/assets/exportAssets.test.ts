import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { publishAssets } from "./exportAssets";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "racing-export-test-"));
  for (const directory of [
    "scripts/blender",
    "scripts/assets",
    "src/assets/authored",
    "assets/blender",
  ])
    await mkdir(join(root, directory), { recursive: true });
  for (const path of [
    "scripts/blender/export.py",
    "scripts/assets/exportAssets.ts",
    "src/assets/parseAuthoredAsset.ts",
    "src/assets/types.ts",
    "src/assets/physicsProfiles.ts",
    "assets/blender/chute.blend",
    "assets/blender/pin-field.blend",
  ])
    await writeFile(join(root, path), "fixture");
  const prior = '{"previous":"valid catalog"}\n';
  await writeFile(join(root, "src/assets/authored/catalog.json"), prior);
  return { root, prior };
}
describe("export publication", () => {
  it("keeps the previous catalog on exporter failure", async () => {
    const { root, prior } = await fixture();
    await expect(
      publishAssets(root, async () => {
        throw new Error("Blender failed");
      }),
    ).rejects.toThrow("Blender failed");
    expect(await readFile(join(root, "src/assets/authored/catalog.json"), "utf8")).toBe(prior);
  });
  it("keeps the previous catalog on invalid output", async () => {
    const { root, prior } = await fixture();
    await expect(
      publishAssets(root, async (_source, staging) => {
        await writeFile(join(staging, "asset.json"), '{"schemaVersion":999}');
      }),
    ).rejects.toThrow("Invalid authored asset");
    expect(await readFile(join(root, "src/assets/authored/catalog.json"), "utf8")).toBe(prior);
  });
  it("keeps the previous catalog when a later asset fails after a valid revision", async () => {
    const { root, prior } = await fixture();
    const catalog = JSON.parse(
      await readFile(new URL("../../src/assets/authored/catalog.json", import.meta.url), "utf8"),
    ) as { assets: { chute: { revision: string } } };
    const directory = new URL(
      `../../src/assets/authored/chute/${catalog.assets.chute.revision}/`,
      import.meta.url,
    );
    let calls = 0;
    await expect(
      publishAssets(root, async (_source, staging) => {
        if (++calls > 1) throw new Error("second asset failed");
        for (const name of ["asset.json", "visuals.glb"])
          await writeFile(join(staging, name), await readFile(new URL(name, directory)));
      }),
    ).rejects.toThrow("second asset failed");
    expect(calls).toBe(2);
    expect(await readFile(join(root, "src/assets/authored/catalog.json"), "utf8")).toBe(prior);
  });
  it("rejects an overlapping export without touching its lock or catalog", async () => {
    const { root, prior } = await fixture();
    await writeFile(join(root, "src/assets/authored/.export.lock"), "other exporter");
    await expect(
      publishAssets(root, async () => {
        throw new Error("must not run");
      }),
    ).rejects.toThrow("EEXIST");
    expect(await readFile(join(root, "src/assets/authored/.export.lock"), "utf8")).toBe(
      "other exporter",
    );
    expect(await readFile(join(root, "src/assets/authored/catalog.json"), "utf8")).toBe(prior);
  });
});
