import type { Spec } from "../modules/types";
import { PHYSICS_PROFILES } from "./physicsProfiles";
import { parseModuleTuning } from "./settings";
import { tuneChute } from "./tuning/chute";
import { tunePinField } from "./tuning/pinField";
import { tuneStaircase } from "./tuning/staircase";
import { tuneWhoops } from "./tuning/whoops";
import type { AuthoredAsset, ModuleTuning } from "./types";

/** Materialize saved geometry and apply supported controls relative to its captured rest state. */
export function buildAuthoredSpec(
  asset: AuthoredAsset,
  tuning: ModuleTuning | null = asset.baseline,
): Spec {
  if (asset.baseline === null) {
    if (tuning !== null) throw new Error(`${asset.id} does not support Module tuning`);
  } else {
    if (!tuning || tuning.moduleId !== asset.id)
      throw new Error(`Tuning does not match ${asset.id}`);
    tuning = parseModuleTuning(asset.baseline.moduleId, tuning.values);
  }
  const profiles: Readonly<
    Record<string, { readonly restitution: number; readonly friction: number }>
  > = PHYSICS_PROFILES;
  const spec: Spec = {
    footprint: structuredClone(asset.footprint),
    ...(asset.recoveryBoxes === undefined
      ? {}
      : { recoveryBoxes: structuredClone(asset.recoveryBoxes) }),
    colliders: asset.colliders.map(({ physicalProfile, ...collider }) => {
      const material = profiles[physicalProfile];
      if (!material) throw new Error(`Unknown physical profile ${physicalProfile}`);
      return { ...structuredClone(collider), material: { ...material } };
    }),
    visuals: asset.visuals.map(({ node, ...visual }) => ({
      ...structuredClone(visual),
      authored: {
        assetId: asset.id,
        node,
        bindings: asset.controls.filter(
          (binding) => binding.target === "visual" && binding.partId === visual.id,
        ),
      },
    })),
  };
  const baseline = asset.baseline;
  if (
    !baseline ||
    !tuning ||
    Object.entries(baseline.values).every(
      ([key, value]) => (tuning.values as unknown as Record<string, unknown>)[key] === value,
    )
  )
    return spec;
  if (spec.recoveryBoxes?.length && baseline.moduleId !== "chute")
    throw new Error(
      `${asset.id}: recovery boxes need explicit region bindings before non-affine tuning`,
    );
  // Each adapter consumes the same validated discriminant as the saved rest parameters.
  switch (tuning.moduleId) {
    case "chute":
      if (baseline.moduleId === "chute") return tuneChute(spec, baseline.values, tuning.values);
      break;
    case "pin-field":
      if (baseline.moduleId === "pin-field")
        return tunePinField(spec, baseline.values, tuning.values, asset.controls);
      break;
    case "staircase":
      if (baseline.moduleId === "staircase")
        return tuneStaircase(spec, baseline.values, tuning.values, asset.controls);
      break;
    case "whoops":
      if (baseline.moduleId === "whoops")
        return tuneWhoops(spec, baseline.values, tuning.values, asset.controls);
  }
  throw new Error(`Tuning does not match ${asset.id}`);
}
