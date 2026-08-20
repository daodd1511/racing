import type { Vector3 } from "./types";

// Toy-scale constants shared by every Module and the Validator. Starting
// values per PLAN.md -> "Scale and materials" -- tuned empirically in the
// Showcase (Phase 3) and against the vortex bowl (Phase 4), not fixed here.
// This is the fix for the previous build's "marbles look extremely slow":
// apparent speed on screen goes as v/L ~ sqrt(g/L), so shrinking the world
// (not boosting gravity) buys the same speed while keeping every number a
// human can reason about, and lands object sizes in the 0.1-10 m band
// Rapier's default solver tolerances are calibrated for.
export const SCALE = Object.freeze({
  /** ~32 mm marble, matching a real desk-scale marble run. */
  marbleRadius: 0.016,
  /** ~15 marble diameters -- enough for a 15-marble pack to spread without
   * every marble touching every other marble at once. */
  channelWidth: 0.5,
  /** Real gravity. Speed comes from scale, not from cranking this. */
  gravity: [0, -9.81, 0] as Vector3,
  /** Non-zero: a restitution:0 track is a pure energy sink, which is half of
   * why the previous build read as constantly decelerating. */
  defaultRestitution: 0.15,
  defaultFriction: 0.08,
  /** Zero: velocity-proportional damping was the other half -- it put
   * marbles at terminal velocity well before the finish. */
  linearDamping: 0,
  angularDamping: 0,
  /** Spacing of the Board's hole grid, in meters -- see CONTEXT.md -> "Cell".
   * Defined here because every Module's `Footprint` is measured in Cells,
   * but nothing computes real Cell occupancy yet: the Board and Assembler
   * are Spec 3's job, not this spec's. A Module built in isolation for the
   * Showcase has no board to occupy Cells on, so `Footprint.cells` stays
   * `[]` until Spec 3 exists to consume it. */
  cellPitch: 0.1,
});
