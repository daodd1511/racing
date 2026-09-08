import { createHash, randomUUID } from "node:crypto";
import { open, readFile, rename, unlink } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import type { ModuleSettings, SettingsSnapshot } from "../../src/assets/types.ts";

const ENDPOINT = "/__dev/module-settings";
const LIMIT = 64 * 1024;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
class RequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export class SettingsValidationError extends Error {}
function loopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
function trusted(request: IncomingMessage): void {
  if (!loopback(request.socket.remoteAddress) || !loopback(request.socket.localAddress))
    throw new RequestError(403, "Settings are available only on loopback");
  const host = request.headers.host;
  const port = request.socket.localPort;
  if (!host || !port || ![`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(host))
    throw new RequestError(403, "Untrusted Host");
  const protocol = "encrypted" in request.socket && request.socket.encrypted ? "https" : "http";
  const origin = request.headers.origin;
  if ((request.method === "PUT" || origin !== undefined) && origin !== `${protocol}://${host}`)
    throw new RequestError(403, "A same-origin request is required");
  if (request.headers["sec-fetch-site"] && request.headers["sec-fetch-site"] !== "same-origin")
    throw new RequestError(403, "Cross-origin requests are not allowed");
}
function body(request: IncomingMessage): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? ""))
    throw new RequestError(415, "Use application/json");
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      request.off("data", data);
      request.off("end", end);
      request.off("error", error);
      request.off("aborted", aborted);
    };
    const fail = (error: Error) => {
      cleanup();
      request.resume();
      reject(error);
    };
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > LIMIT) fail(new RequestError(413, "Settings request exceeds 64 KiB"));
      else chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new RequestError(400, "Malformed JSON"));
      }
    };
    const error = () => fail(new RequestError(400, "Could not read request"));
    const aborted = () => fail(new RequestError(400, "Request was interrupted"));
    request.on("data", data);
    request.on("end", end);
    request.on("error", error);
    request.on("aborted", aborted);
  });
}

export interface SettingsIO {
  read(path: string): Promise<string>;
  publish(path: string, text: string): Promise<void>;
}
const disk: SettingsIO = {
  read: (path) => readFile(path, "utf8"),
  async publish(path, text) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(text, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  },
};

/** The path comes from Vite configuration, never from the HTTP request. */
export function createModuleSettingsHandler(
  path: string,
  validate: (value: unknown) => Promise<ModuleSettings>,
  io: SettingsIO = disk,
) {
  let queue: Promise<unknown> = Promise.resolve();
  const snapshot = async (): Promise<SettingsSnapshot> => {
    const text = await io.read(path);
    return { revision: hash(text), settings: await validate(JSON.parse(text)) };
  };
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    if (request.url?.split("?")[0] !== ENDPOINT) {
      next();
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json");
    response.setHeader("X-Content-Type-Options", "nosniff");
    try {
      trusted(request);
      if (request.url !== ENDPOINT)
        throw new RequestError(400, "Unexpected settings URL parameters");
      if (request.method === "GET") {
        response.end(JSON.stringify(await snapshot()));
        return;
      }
      if (request.method !== "PUT") {
        response.setHeader("Allow", "GET, PUT");
        throw new RequestError(405, "Method not supported");
      }
      const input = await body(request);
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).length !== 2 ||
        !("settings" in input) ||
        !("expectedRevision" in input) ||
        typeof input.expectedRevision !== "string" ||
        !/^[a-f0-9]{64}$/.test(input.expectedRevision)
      )
        throw new RequestError(400, "Expected settings and expectedRevision");
      const save = async () => {
        const before = await io.read(path);
        if (hash(before) !== input.expectedRevision)
          throw new RequestError(
            409,
            "Settings changed. Reload saved values before saving again; your draft is unchanged.",
          );
        let settings: ModuleSettings;
        try {
          settings = await validate(input.settings);
        } catch (error) {
          if (!(error instanceof SettingsValidationError)) throw error;
          throw new RequestError(
            422,
            error instanceof Error ? error.message : "Invalid Module settings",
          );
        }
        if (hash(await io.read(path)) !== input.expectedRevision)
          throw new RequestError(
            409,
            "Settings changed during validation. Reload saved values before saving again.",
          );
        const text = `${JSON.stringify(settings, null, 2)}\n`;
        await io.publish(path, text);
        return { revision: hash(text), settings };
      };
      const result = queue.then(save);
      queue = result.catch(() => undefined);
      response.end(JSON.stringify(await result));
    } catch (error) {
      response.statusCode = error instanceof RequestError ? error.status : 500;
      response.end(
        JSON.stringify({
          error:
            error instanceof RequestError
              ? error.message
              : "Could not read or save Module settings",
        }),
      );
    }
  };
}

export function moduleSettingsPlugin(): Plugin {
  let settingsPath = "";
  return {
    name: "local-module-settings",
    apply: "serve",
    configureServer(server) {
      settingsPath = resolve(server.config.root, "src/config/module-settings.json");
      const validate = async (value: unknown): Promise<ModuleSettings> => {
        const settings = (await server.ssrLoadModule(
          "/src/assets/settings.ts",
        )) as typeof import("../../src/assets/settings");
        const validator = (await server.ssrLoadModule(
          "/src/assets/validateCourseSettings.ts",
        )) as typeof import("../../src/assets/validateCourseSettings");
        try {
          const parsed = settings.parseModuleSettings(value);
          validator.validateCourseSettings(parsed);
          return parsed;
        } catch (error) {
          throw new SettingsValidationError(
            error instanceof Error ? error.message : "Invalid Module settings",
          );
        }
      };
      const handler = createModuleSettingsHandler(settingsPath, validate);
      server.middlewares.use((request, response, next) => {
        void handler(request, response, next);
      });
    },
    handleHotUpdate(context) {
      if (resolve(context.file) === settingsPath) return [];
    },
  };
}
