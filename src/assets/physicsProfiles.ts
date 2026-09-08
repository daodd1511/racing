import type { ColliderMaterial } from "../modules/types";

/** Captured effective values; visual materials never determine collision response. */
export const PHYSICS_PROFILES = {
  channel: { restitution: 0, friction: 0.08 },
  smoothRail: { restitution: 0, friction: 0 },
  default: { restitution: 0.15, friction: 0.08 },
  defaultRail: { restitution: 0.15, friction: 0 },
  riser: { restitution: 0.09, friction: 0.08 },
  post: { restitution: 0.5, friction: 0.05 },
  wave: { restitution: 0.1, friction: 0 },
} as const satisfies Readonly<Record<string, ColliderMaterial>>;
