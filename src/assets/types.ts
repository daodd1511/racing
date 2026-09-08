import type { ChuteParams } from "../modules/chute";
import type { PinFieldParams } from "../modules/pinField";
import type { StaircaseParams } from "../modules/staircase";
import type { WhoopsParams } from "../modules/whoops";
import type { ColliderSpec, Footprint, RecoveryBox, VisualSpec } from "../modules/types";
import type { Vector3 } from "../race/types";

export const ASSET_IDS = [
  "chute",
  "pin-field",
  "staircase",
  "whoops",
  "start",
  "finish",
  "marble",
] as const;
export type AssetId = (typeof ASSET_IDS)[number];
export interface ModuleSettings {
  readonly chute: ChuteParams;
  readonly "pin-field": Required<PinFieldParams>;
  readonly staircase: StaircaseParams;
  readonly whoops: WhoopsParams;
}
export type ModuleId = keyof ModuleSettings;
export type ModuleTuning = {
  [K in ModuleId]: { readonly moduleId: K; readonly values: ModuleSettings[K] };
}[ModuleId];
export interface SettingsSnapshot {
  readonly revision: string;
  readonly settings: ModuleSettings;
}
export interface SaveSettingsRequest {
  readonly revision: string;
  readonly settings: ModuleSettings;
}

/** Binding targets are explicitly authored; adapters must never infer them from mesh proximity. */
export interface ControlBinding {
  readonly target: "visual" | "collider";
  readonly partId: string;
  readonly region: "channel" | "post" | "bumper" | "step" | "wave" | "end";
  readonly repeatIndex?: number;
}
export interface AuthoredAsset {
  readonly schemaVersion: 1;
  readonly id: AssetId;
  readonly footprint: Footprint;
  readonly recoveryBoxes?: readonly RecoveryBox[];
  readonly colliders: readonly (Omit<ColliderSpec, "material"> & {
    readonly physicalProfile: string;
  })[];
  readonly visuals: readonly (VisualSpec & { readonly node: string })[];
  readonly markers: { readonly gatePivot?: Vector3; readonly finishSensor?: string };
  readonly controls: readonly ControlBinding[];
  readonly baseline: ModuleTuning | null;
}
export interface AssetRevision {
  readonly revision: string;
  readonly sourceHash: string;
  readonly exporterHash: string;
  readonly assetHash: string;
  readonly visualHash: string;
}
export interface AuthoredCatalog {
  readonly schemaVersion: 1;
  readonly assets: Readonly<Record<AssetId, AssetRevision>>;
}
