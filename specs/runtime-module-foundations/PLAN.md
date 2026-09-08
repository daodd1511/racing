# Runtime performance and Module foundations

## Status and priority

Completed and merged on 2026-09-08 in PRs [#24](https://github.com/daodd1511/racing/pull/24),
[#25](https://github.com/daodd1511/racing/pull/25) and
[#27](https://github.com/daodd1511/racing/pull/27). The user confirmed closure.
All three phases are done, with no recorded verification debt. See
[EXECUTION.md](EXECUTION.md) for the implementation and verification record.
Blender asset migration is next; starting it requires an explicit instruction.
New Obstacle Module design follows the Blender migration.

## Goal

Make the current race run smoothly and make additional Obstacle Modules easier
to integrate, while preserving the existing tuned Course geometry and physics.
Keep the work proportional to a simple game: measure, fix concrete costs, and
watch marbles race. Avoid a generic engine rewrite or extensive test infrastructure.

## Evidence from this session

The user supplied [Storm Race](https://storm-race.vercel.app/) as a reference for
visual quality and web performance. Browser inspection showed detailed cars,
materials, a workshop environment and multiple camera modes. Its FPS, physics
implementation and asset-authoring method were not verified. Do not treat it as
a measured benchmark or assume it uses Blender.

A temporary Node/Vite SSR benchmark ran the existing CourseRaceRuntime on this
machine: seed 7, 15 marbles, last selection mode, contact collection disabled,
1,800 fixed steps (30 simulated seconds). The Course contained 22 Modules,
708 authored colliders and 1,702 route points. The second of two runs measured:

| Measurement                        | Time per step |
| ---------------------------------- | ------------: |
| Rapier world.step average          |       1.92 ms |
| Surrounding runtime logic average  |       1.85 ms |
| Total runtime.step average         |       3.77 ms |
| Total runtime.step 95th percentile |       6.52 ms |

No recoveries occurred in that sample. These are headless CPU measurements,
not browser frame times; they exclude rendering, React and DOM work. The local
profiling script was temporary, so recreate a small equivalent if needed.

Code inspection found:

- `src/race/progress.ts` scans all route segments even with a checkpoint search
  interval, recomputing segment lengths. Updating each marble also rebuilds rankings.
- `src/race/CourseRaceRuntime.ts` creates snapshots and temporary objects on each
  fixed step, including intermediate steps not displayed.
- `src/race/LiveRace.tsx` publishes snapshots through React state every rendered
  frame. Broadcast UI telemetry is already throttled to roughly 10 Hz.
- `src/course/render/CourseScene.tsx` smooths marble transforms, while
  `src/race/DecisiveCamera.tsx` separately smooths camera targets and movement.
  This can cause perceived delay independently of low FPS; causality is unmeasured.
- Static Course geometry already uses material batching, and Board details use
  instancing. Do not assume draw calls are the main bottleneck.
- Module registration, Course eligibility, inventory and placement are distributed
  across `src/modules/registry.ts`, `src/course/courseModules.ts`,
  `src/course/arc.ts` and `src/course/board.ts`.
- Recovery in CourseRaceRuntime assumes one route and a global channel width.
  A future wide pocket can violate this assumption despite valid physical motion.

## Implementation order

### 1. Measure an actual browser race

Use the current Course with a fixed seed, roster and camera for repeatable
before/after observation. Prefer a production build for representative timing.
Record frame-time distribution and stalls, physics/runtime cost, React updates,
and draw calls/triangles when supported by available tooling. Distinguish low FPS,
simulation backlog and camera/marble smoothing. Do not claim unavailable metrics.

Keep profiling temporary or development-only. Record enough hardware/browser and
scene context to compare the same setup later. Choose the first optimization from
evidence; the runtime bookkeeping is an already measured candidate.

### 2. Remove repeated simulation bookkeeping

Cache immutable route segment geometry and cumulative distances per Course.
Use checkpoint intervals to visit only relevant segments, preserving boundary
and tie behavior. Update all marble distances before computing the published
ranking once per step where event semantics allow it. Preserve finish ordering,
checkpoint handling, recovery and watchdog behavior.

Reuse hot-loop scratch vectors and precompute static sensor transforms where
measurement warrants it. Avoid constructing full presentation snapshots for
intermediate catch-up steps if callers do not need them. Keep these changes
small enough to compare behavior and timing independently.

### 3. Decouple moving transforms from React rendering

Let the animation loop consume the latest simulation transforms through a small
typed ref or equivalent direct channel. Keep React for roster, settings, race
lifecycle, outcomes and throttled telemetry. Update marble meshes, labels, gate
visuals and camera without rebuilding the scene through state every frame.

Preserve fixed-step physics. If profiling or visual review confirms smoothing
delay, use appropriate previous/current fixed-step interpolation and deliberate
camera smoothing. Do not change physics timestep, discard elapsed simulation
time, or weaken collision quality merely to hide stutters. Handle restart,
unmount and completed races correctly.

### 4. Simplify Module integration and recovery assumptions

Consolidate duplicated Module eligibility/default metadata where it belongs in
the existing definition/catalog. Keep intentional Course composition choices
explicit; random obstacle selection must retain the current working inventory
and placement behavior.

Give Modules a minimal way to describe their valid recovery area, with current
corridor behavior as the compatible default. Transform that data with placement
and keep it distinct from collision geometry and ranking progress. A wide usable
area must not cause a valid marble to be reset just for leaving the centerline.

Choose the concrete area representation after inspecting existing Footprints and
recovery code. Do not introduce branching route graphs or a general track editor:
the immediate candidates are a curved pocket and alternating banked ramps, and
neither requires building a general routing system in this phase. Do not add the
new obstacles yet.

Document the resulting short procedure for adding a Module, including shape,
colliders, parameters, entry/exit, progress route, recovery area and optional
motion. Reconcile the pending Blender plan with this contract before migration.

## Preserve

- Current live Course geometry and tuned values are the baseline, not Showcase
  defaults. Do not reconstruct obstacles from scratch or change the race design.
- Keep Rapier, current physics settings, marbles, Course assembly, starts,
  finishes, selection modes and seeded setup.
- Existing passing, pacing, completion and stall behavior should remain equivalent
  in practical review. Do not require identical finish orders or statistical trials.
- Showcase is a preview. A real Course race remains necessary to judge behavior.
- No Blender implementation, new obstacles, visual redesign, worker migration,
  ECS framework or broad dependency change in this effort.

## Verification and completion

Use project typechecking and dependency-aware existing tests for each change.
Add focused regression coverage only for meaningful risks such as route interval
boundaries, finish ordering or transformed recovery areas. Do not create a large
test matrix. Run the full suite and relevant build once at the final spec gate,
following RULEBOOK.md. No CI monitoring unless requested.

Compare the same browser race and runtime sample before and after. Record actual
numbers and limitations; no invented FPS target or unmeasured speedup claim.
Review a race through completion, camera modes, labels, restart and recovery.
The user judges race feel and preservation of the tuned obstacles on the Course.

Done means the measured waste has been reduced, browser evidence explains any
remaining lag, existing race behavior remains acceptable, and Module integration
no longer requires duplicated eligibility declarations or assumes every usable
area has the global channel width. Keep unresolved measurements explicit.

## Next-session context

Read CLAUDE.md and specs/RULEBOOK.md before planning execution. The Blender spec
has five pending phases and has never started. Preserve existing unrelated
working-tree changes and archived spec moves. No game code was modified during
the diagnosis or this planning turn; no commits were requested.

## Execution planning decisions

The user approved optional local-space recovery boxes (combined as a union), a
typed ref for live transforms, and catalog-owned Course eligibility/defaults.
Existing Modules retain corridor recovery. Boxes expand permitted motion without
changing ranking routes or automatically making airborne positions safe to restore.
The execution plan preserves damping for a clean channel comparison; any measured
remaining smoothing delay is reported for a focused follow-up.
