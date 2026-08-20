import { useBeforePhysicsStep } from "@react-three/rapier";
import type { MutableRefObject } from "react";

import { advanceKinematicClock, type KinematicClock } from "../modules/kinematics";

export interface KinematicClockProps {
  /** Owned by the Showcase, so ModuleColliders receives a clock rather than
   * reaching for the R3F wall clock or a render-frame delta. */
  readonly clockRef: MutableRefObject<KinematicClock>;
}

/** Advances once for every actual fixed Rapier substep. `useFrame` only runs
 * once per rendered frame, which can cover multiple solver steps after a
 * hitch; using this physics hook keeps the live and headless clocks aligned. */
export function KinematicClock({ clockRef }: KinematicClockProps) {
  useBeforePhysicsStep(() => {
    clockRef.current = advanceKinematicClock(clockRef.current);
  });

  return null;
}
