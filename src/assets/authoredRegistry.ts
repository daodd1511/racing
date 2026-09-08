import type { ParamValues } from "../modules/params";
import { ALL_MODULES, type RegisteredModule } from "../modules/registry";
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
    course: { defaults: { ...baseline.values } },
    buildSpec(params: ParamValues) {
      // The pure builder checks every key/value against the typed captured baseline.
      return buildAuthoredSpec(asset, { ...baseline, values: params } as ModuleTuning);
    },
  };
}
