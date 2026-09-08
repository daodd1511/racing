import type { ParamValues } from "../modules/params";
import { ALL_MODULES, type RegisteredModule } from "../modules/registry";
import { moduleSettingsSchema } from "./settings";
import type { ModuleId } from "./types";
import { buildAuthoredSpec } from "./buildAuthoredSpec";
import { loadAuthoredAsset } from "./catalog";
import type { AssetId, ModuleTuning } from "./types";

export function authoredModule(id: string): RegisteredModule {
  const original = ALL_MODULES.find((module) => module.id === id);
  if (!original) throw new Error(`Unknown authored Module ${id}`);
  const asset = loadAuthoredAsset(id as AssetId);
  const baseline = asset.baseline;
  if (!baseline) throw new Error(`${id} has no Module baseline`);
  return {
    ...original,
    meta: { ...original.meta, params: moduleSettingsSchema(id as ModuleId) },
    buildSpec(params: ParamValues) {
      // The pure builder validates the Module-specific controls.
      return buildAuthoredSpec(asset, { ...baseline, values: params } as ModuleTuning);
    },
  };
}
