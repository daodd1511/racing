# Runtime performance and Module foundations — Execution Plan

Spec: [PLAN.md](PLAN.md). Rulebook: `specs/RULEBOOK.md`.
Integration branch: `main`. Branch model: stacked via `gh stack` (default).

Probe: `gh stack view --json` returned exit 6 because `main` belongs to multiple stacks; the command is installed, not an exit-9 fallback. At phase start, select a new named stack for this spec; do not adopt old stacks. No branches are created by this plan.

## STATUS

- Current phase: 1 — in-progress
- Phase 1 — Simulation bookkeeping: in-progress
- Phase 2 — Direct rendering updates: pending
- Phase 3 — Module integration and recovery areas: pending
- Verification debt: phase 1 gate remains failing — four existing Course validation cases timed out at 15 seconds in the serial related-test run; typecheck passed. No test limits changed.
- Commit checkpoint: automatic approval review rejected committing without separate explicit user approval; all phase changes remain uncommitted.

## Phase 1 — Simulation bookkeeping

Branch: `runtime-module-foundations/phase-1-simulation` (stacked: `gh stack add`)

Establish browser evidence and optimize simulation internals while preserving the existing presentation API.

Produces: existing `CourseRaceRuntime.step(elapsedSeconds: number): CourseRaceStep`, `CourseRaceRuntime.currentSnapshot: RaceSnapshot` and `projectMarbleOntoCourse(state: RaceProgressState, marbleIndex: number, position: Vector3): MarbleRouteProjection`, with unchanged public contracts.

Fresh review: not required

- [x] Record baseline browser and headless measurements in `specs/runtime-module-foundations/PERFORMANCE.md`: seed 7, 15 marbles, last selection, fixed camera, build mode, browser/hardware, frame times, runtime/physics costs, React commits and renderer counts when available; distinguish missing metrics from zero costs, per PLAN.md → “1. Measure an actual browser race”.
- [x] In `src/race/progress.ts`, cache segment geometry and cumulative lengths per immutable Course, restrict projection to intersecting checkpoint segments, and preserve degenerate segments, endpoints and tie behavior.
- [x] (amended 2026-09-08) In `src/race/progress.ts`, lazily memoize rankings on immutable progress states instead of batching event updates; explicit data copies must not read intermediate getters, preserving sensor/finish ordering and existing exports.
- [x] In `src/race/CourseRaceRuntime.ts`, precompute the finish sensor inverse transform and reuse private scratch vectors; make returned snapshot construction lazy so unused intermediate snapshots are not allocated, while ensuring a retained step result always represents its own step rather than later mutable state.
- [x] Extend `src/race/progress.test.ts` and `src/race/CourseRaceRuntime.test.ts` only for interval boundaries/ties, batched finish ordering and retained snapshot stability; preserve existing recovery and physics settings.
- [x] Repeat the same measurements in `specs/runtime-module-foundations/PERFORMANCE.md`; explain the observed improvement and remaining browser costs without claiming headless timing is FPS.

- [x] (amended 2026-09-08, user requested) Add a live Camera selector in `src/dev/coursePreview.tsx`, defaulting to Close up; review Close up as the primary view and Broadcast as comparison without restarting physics.

**Phase gate (hard):**

- [x] Run `./node_modules/.bin/tsc -b` from the repository root.
- [ ] Run `./node_modules/.bin/vitest related --run --maxWorkers=1 <changed-source-files>` (amended 2026-09-08: serial execution after concurrent simulation timeouts; same dependency closure) with the real phase diff supplying arguments; for a test-only change, include its production subject so reverse dependencies are covered.

**Review checklist (user, at PR review):**

- [ ] Run the recorded Course setup through completion; confirm tuned obstacle behavior, rankings and selection remain acceptable.
- [ ] Review Close up for visible stalls, following delay and target handoffs, then compare Broadcast; compare visible stalls with the baseline recording and read the measured costs and limitations in PERFORMANCE.md.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 2 — Direct rendering updates

Branch: `runtime-module-foundations/phase-2-rendering` (stacked: `gh stack add`)

Replace React snapshot propagation after the simulation API is stable.

Consumes: `CourseRaceRuntime.step(elapsedSeconds: number): CourseRaceStep` and `CourseRaceRuntime.currentSnapshot: RaceSnapshot` from phase 1.
Produces: `RaceFrameRef = { current: RaceSnapshot | null }` in `src/race/liveTypes.ts`; `LiveRaceState.frameRef: RaceFrameRef` replaces `LiveRaceState.snapshot`; outcome and external snapshot callbacks retain their existing contracts.

Fresh review: not required

- [ ] Add `RaceFrameRef` in `src/race/liveTypes.ts`; have `src/race/LiveRace.tsx` own a stable ref, publish snapshots into it without frame-frequency setState, retain outcome state and external callbacks, and clear the ref on Course/request reset and unmount.
- [ ] Update `src/race/CoursePhysics.tsx`, `src/course/render/CourseScene.tsx`, `src/race/DecisiveCamera.tsx` and `src/ui/BroadcastRace.tsx` to consume the ref directly in the animation loop; migrate all LiveRace/CourseScene/DecisiveCamera callers found by symbol search, retaining snapshot props for isolated previews where needed.
- [ ] In `src/course/render/CourseScene.tsx`, update marble meshes, labels and moving gate visuals from the same current snapshot; ensure physics publication precedes visual consumers without taking over R3F rendering.
- [ ] Retain current damping constants in `src/course/render/CourseScene.tsx` and `src/race/DecisiveCamera.tsx` for this phase; record any confirmed smoothing delay in PERFORMANCE.md as an explicit follow-up rather than mixing an unmeasured camera redesign into the channel change.
- [ ] Extend `src/race/CoursePhysics.test.tsx`, `src/course/render/CourseScene.test.tsx` and `src/race/DecisiveCamera.test.tsx` for ref-driven movement and restart/terminal lifecycle; add `src/race/LiveRace.test.tsx` to verify snapshot publication does not rerender children and outcome publication still does.
- [ ] Repeat browser observations and measurements in `specs/runtime-module-foundations/PERFORMANCE.md`, confirming labels, camera, gate, throttled telemetry and external callbacks still follow the race.

**Phase gate (hard):**

- [ ] Run `./node_modules/.bin/tsc -b` from the repository root.
- [ ] Run `./node_modules/.bin/vitest related --run <changed-source-files>` with arguments derived from the real phase diff, including production subjects of changed tests.

**Review checklist (user, at PR review):**

- [ ] Watch both camera modes, labels and gate through a complete race; verify results and telemetry stay current.
- [ ] Restart the same race and change the roster; confirm no old transforms flash and no duplicate race or outcome appears.
- [ ] Compare perceived motion and browser measurements with phase 1; distinguish remaining camera delay from frame stalls.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 3 — Module integration and recovery areas

Branch: `runtime-module-foundations/phase-3-modules` (stacked: `gh stack add`)

Complete the Module contract on the optimized runtime without adding new obstacles.

Consumes: `projectMarbleOntoCourse(state: RaceProgressState, marbleIndex: number, position: Vector3): MarbleRouteProjection` from phase 1.
Produces: `RecoveryBox = { readonly position: Vector3; readonly rotation: Quaternion; readonly halfExtents: Vector3 }`; optional `Spec.recoveryBoxes: readonly RecoveryBox[]`; optional `RegisteredModule.course: { readonly defaults: ParamValues }`, whose presence declares Course eligibility.

Fresh review: not required

- [ ] In `src/modules/registry.ts`, store Course eligibility and exact existing Course defaults with each catalog registration; update `src/course/courseModules.ts` to derive eligibility/defaults from that metadata instead of a whitelist and Module-ID branches, preserving `courseParamValues(module: RegisteredModule): ParamValues` and `courseModulesByRole(role: Role): readonly RegisteredModule[]`.
- [ ] Audit `src/course/arc.ts` and `src/course/board.ts` against that catalog; retain the existing explicit obstacle inventory, seeded ordering, bay dimensions and placement choices rather than generating a new race composition policy.
- [ ] Add `RecoveryBox` and optional `Spec.recoveryBoxes` to `src/modules/types.ts`; boxes describe a union of valid marble-center volumes in local coordinates, are independent of colliders, and an omitted or empty list uses legacy corridor recovery.
- [ ] In `src/course/transformSpec.ts`, transform recovery-box positions and rotations with the Spec while retaining half-extents; keep them available through `src/course/assembleCourse.ts` without merging them into Footprint bounds or the progress route.
- [ ] Add `src/race/recoveryAreas.ts` with `containsRecoveryPoint(boxes: readonly RecoveryBox[], position: Vector3): boolean`; include boundaries and use oriented-box membership, with precomputed inverse transforms cached per immutable box collection.
- [ ] In `src/race/CourseRaceRuntime.ts`, consider custom boxes only for Modules intersecting the marble’s current checkpoint interval; membership prevents corridor-based recovery in that area, while omitted boxes preserve current behavior and unrelated nearby Course rows cannot suppress recovery.
- [ ] In `src/race/CourseRaceRuntime.ts`, keep legacy last-safe updates and reset mechanics initially; custom boxes widen permitted motion without automatically saving an airborne marble as a safe respawn position, and leaving the union resumes legacy escape/below-route checks.
- [ ] Add focused `src/race/recoveryAreas.test.ts` coverage for unions and boundaries; extend `src/course/transformSpec.test.ts` and `src/race/CourseRaceRuntime.test.ts` for a placed wide area and fallback behavior, and `src/course/assembleCourse.test.ts` for unchanged catalog-driven defaults/inventory.
- [ ] Write `docs/adding-modules.md` with the concrete registration, geometry/collider, tuning, connection, route, recovery-box and optional-motion steps; update `specs/blender-asset-migration/PLAN.md` and its pending `EXECUTION.md` to carry recovery boxes and catalog defaults through extraction/export/tuning without starting migration.
- [ ] Record final comparable runtime/browser evidence and remaining limitations in `specs/runtime-module-foundations/PERFORMANCE.md`; update `specs/README.md` with the review status and keep Blender deferred until user review.

**Phase gate (hard):**

- [ ] Run `./node_modules/.bin/tsc -b` from the repository root.
- [ ] Run `./node_modules/.bin/vitest related --run <changed-source-files>` with arguments derived from the real phase diff, including production subjects of changed tests.

**Review checklist (user, at PR review):**

- [ ] Run the original Course and confirm geometry, obstacle inventory, pacing and ordinary recovery remain acceptable.
- [ ] Review the wide-area regression example and Module authoring instructions: valid off-center motion is allowed without changing progress ranking or introducing a new obstacle.
- [ ] Review final measurements and any residual lag before resuming Blender migration.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Spec gate (hard — once, before the final phase's PR)

- [ ] Run `./node_modules/.bin/vitest run` over the accumulated spec changes.
- [ ] Run `./node_modules/.bin/tsc -b && ./node_modules/.bin/vite build` to verify the changed scene consumers and all application entry points bundle together.
