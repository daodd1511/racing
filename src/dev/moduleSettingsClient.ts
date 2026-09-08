import { parseModuleSettings } from "../assets/settings";
import type { SaveSettingsRequest, SettingsSnapshot } from "../assets/types";

export class SettingsRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function request(init?: RequestInit): Promise<SettingsSnapshot> {
  const response = await fetch("/__dev/module-settings", { cache: "no-store", ...init });
  const value: unknown = await response.json();
  if (!response.ok) {
    const message =
      value && typeof value === "object" && "error" in value && typeof value.error === "string"
        ? value.error
        : "Could not access Module settings";
    throw new SettingsRequestError(response.status, message);
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("revision" in value) ||
    !("settings" in value) ||
    typeof value.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.revision)
  )
    throw new Error("Invalid Module settings response");
  return { revision: value.revision, settings: parseModuleSettings(value.settings) };
}
export function readModuleSettings(): Promise<SettingsSnapshot> {
  return request();
}
export function saveModuleSettings(input: SaveSettingsRequest): Promise<SettingsSnapshot> {
  return request({
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedRevision: input.expectedRevision,
      settings: parseModuleSettings(input.settings),
    }),
  });
}
