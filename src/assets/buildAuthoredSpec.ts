import type { Spec } from "../modules/types";
import { PHYSICS_PROFILES } from "./physicsProfiles";
import type { AuthoredAsset, ModuleTuning } from "./types";

/** Materialize saved rest geometry. Phase 2 accepts baseline values only. */
export function buildAuthoredSpec(
  asset: AuthoredAsset,
  tuning: ModuleTuning | null = asset.baseline,
): Spec {
  if (asset.baseline === null) {
    if (tuning !== null) throw new Error(`${asset.id} does not support Module tuning`);
  } else {
    if (!tuning || tuning.moduleId !== asset.id)
      throw new Error(`Tuning does not match ${asset.id}`);
    const expected = Object.entries(asset.baseline.values);
    const supplied = tuning.values as unknown as Record<string, unknown>;
    if (
      Object.keys(supplied).length !== expected.length ||
      expected.some(([key, value]) => supplied[key] !== value)
    )
      throw new Error(
        `${asset.id}: only captured baseline tuning is supported during asset comparison`,
      );
  }
  const profiles: Readonly<
    Record<string, { readonly restitution: number; readonly friction: number }>
  > = PHYSICS_PROFILES;
  return {
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
}
