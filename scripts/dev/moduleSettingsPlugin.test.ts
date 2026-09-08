import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createModuleSettingsHandler,
  moduleSettingsPlugin,
  SettingsValidationError,
} from "./moduleSettingsPlugin";
import { loadSavedModuleSettings, parseModuleSettings } from "../../src/assets/settings";
import { validateCourseSettings } from "../../src/assets/validateCourseSettings";

vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, rename: vi.fn(fs.rename) };
});
const servers: Server[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
  vi.clearAllMocks();
});
async function fixture(
  validate: (value: unknown) => Promise<ReturnType<typeof loadSavedModuleSettings>> = async (
    value,
  ) => {
    try {
      const settings = parseModuleSettings(value);
      validateCourseSettings(settings);
      return settings;
    } catch (error) {
      throw new SettingsValidationError(
        error instanceof Error ? error.message : "Invalid settings",
      );
    }
  },
) {
  const directory = await mkdtemp(join(tmpdir(), "module-settings-"));
  directories.push(directory);
  const path = join(directory, "module-settings.json");
  await writeFile(path, `${JSON.stringify(loadSavedModuleSettings(), null, 2)}\n`);
  const handler = createModuleSettingsHandler(path, validate);
  const server = createServer((req, res) => {
    void handler(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server port");
  const origin = `http://127.0.0.1:${address.port}`;
  const send = (
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
    url = "/__dev/module-settings",
  ) =>
    new Promise<{ status: number; value: Record<string, unknown> }>((resolve, reject) => {
      const req = httpRequest(
        `${origin}${url}`,
        { method, headers: { Origin: origin, "Content-Type": "application/json", ...headers } },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString();
            resolve({
              status: res.statusCode!,
              value: text ? (JSON.parse(text) as Record<string, unknown>) : {},
            });
          });
        },
      );
      req.on("error", reject);
      req.end(
        body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      );
    });
  return { directory, path, send };
}

describe("development settings boundary", () => {
  it("reads and atomically saves validated settings at the fixed file", async () => {
    const { path, send } = await fixture();
    const initial = await send();
    expect(initial.status).toBe(200);
    const settings = loadSavedModuleSettings();
    const changed = { ...settings, chute: { ...settings.chute, length: 0.7 } };
    const saved = await send("PUT", {
      expectedRevision: initial.value.revision,
      settings: changed,
    });
    expect(saved.status).toBe(200);
    expect(saved.value.revision).not.toBe(initial.value.revision);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(changed);
    expect((await send()).value).toEqual(saved.value);
  });
  it("rejects malformed, untrusted and oversized requests without changing the file", async () => {
    const { path, send } = await fixture();
    const before = await readFile(path, "utf8");
    const revision = (await send()).value.revision;
    expect((await send("PUT", "{broken")).status).toBe(400);
    expect(
      (await send("PUT", { expectedRevision: revision, settings: {}, path: "/tmp/other" })).status,
    ).toBe(400);
    expect((await send("PUT", { expectedRevision: revision, settings: {} })).status).toBe(422);
    expect((await send("PUT", "{}", { Origin: "https://example.com" })).status).toBe(403);
    expect((await send("GET", undefined, { Host: "attacker.example" })).status).toBe(403);
    expect((await send("GET", undefined, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await send("PUT", "{}", { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await send("PUT", `"${"x".repeat(65536)}"`)).status).toBe(413);
    expect((await send("DELETE")).status).toBe(405);
    expect((await send("GET", undefined, {}, "/__dev/module-settings?path=other")).status).toBe(
      400,
    );
    expect(await readFile(path, "utf8")).toBe(before);
  });
  it("serializes concurrent saves and rejects stale revisions", async () => {
    const { send } = await fixture();
    const revision = (await send()).value.revision;
    const settings = loadSavedModuleSettings();
    const results = await Promise.all(
      [0.7, 0.8].map((length) =>
        send("PUT", {
          expectedRevision: revision,
          settings: { ...settings, chute: { ...settings.chute, length } },
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect((await send("PUT", { expectedRevision: revision, settings })).status).toBe(409);
  });
  it("retains the original bytes and removes its temporary file after rename failure", async () => {
    const { directory, path, send } = await fixture();
    const before = await readFile(path, "utf8");
    const revision = (await send()).value.revision;
    vi.mocked(rename).mockRejectedValueOnce(new Error("disk failure"));
    expect(
      (await send("PUT", { expectedRevision: revision, settings: loadSavedModuleSettings() }))
        .status,
    ).toBe(500);
    expect(await readFile(path, "utf8")).toBe(before);
    expect(await readdir(directory)).toEqual(["module-settings.json"]);
  });
  it("reports validator infrastructure failures as server errors", async () => {
    let unavailable = false;
    const { send } = await fixture(async (value) => {
      if (unavailable) throw new Error("module loader unavailable");
      return parseModuleSettings(value);
    });
    const revision = (await send()).value.revision;
    unavailable = true;
    const response = await send("PUT", {
      expectedRevision: revision,
      settings: loadSavedModuleSettings(),
    });
    expect(response).toEqual({
      status: 500,
      value: { error: "Could not read or save Module settings" },
    });
  });
  it("registers only for serving, not builds or preview middleware", () => {
    const plugin = moduleSettingsPlugin();
    expect(plugin.apply).toBe("serve");
    expect(plugin.configurePreviewServer).toBeUndefined();
  });
});
