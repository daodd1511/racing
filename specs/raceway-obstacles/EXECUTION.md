# Raceway Obstacles — Execution Plan

Spec: [PLAN.md](PLAN.md). Rulebook: `specs/RULEBOOK.md`.
Integration branch: `main`. Branch model: stacked via `gh stack` — the prior
spec recorded stacked PRs as disabled for this repo on 2026-08-12, but the
repo has since gone private→public and `gh stack view --json` now runs
cleanly (exit 0), so this spec tries the stack at Phase 1 start rather than
assuming the earlier failure still holds.

**Note for Phase 1 start:** `gh stack view --json` currently reports one
stale tracked branch, `marble-race-picker/phase-1-simulation-foundation`
(`needsRebase: true`, `isMerged: false`), left over from that earlier spec's
own stack attempt before it fell back to a manual model. That spec is fully
merged into `main` now. `gh stack init -b main` may need to reconcile or
prune this stale entry before adding this spec's Phase 1 branch — if it
doesn't clean up on its own, ask the user before force-clearing stack state
that predates this spec.

## STATUS

- Current phase: 1 — pending
- Phase 1 — Static modules: pending
- Phase 2 — Shape union: pending
- Phase 3 — Progress hardening and the vortex bowl: pending
- Phase 4 — Deterministic motion: pending
- Phase 5 — Tuning and coverage: pending
- Verification debt: none

## Phase 1 — Static modules

Branch: `raceway-obstacles/phase-1-static-modules` (`gh stack add`)

PLAN.md → "Phase A". Lands the pin field and rumble strip as ordinary box
colliders — no schema change, no motion — so the pipeline (materials,
placement, coverage) is proven before Phase 2's shape refactor and Phase 3's
bowl build on it. Also closes the debt `marble-race-picker/EXECUTION.md`
carried forward from its Phase 5.

Consumes: none — this phase starts from `main` after `marble-race-picker`
Phase 6 merged.
Produces: trimmed `TrackBoxKind` (`"side-rail" | "pin" | "rumble"`),
`PIN_MATERIAL`, `RUMBLE_MATERIAL` in `src/track/definition.ts`; the `0.05`
sphere-to-surface gap assertion in `src/simulation/trackStress.test.ts`.

Fresh review: not required

- [ ] Remove `gateLayout`, its `addBarrier` gate/deflector construction, and the `"gate"`/`"deflector"`/`"splitter"`/`"chicane"` members of `TrackBoxKind` in `src/track/definition.ts`; add `"pin"` and `"rumble"` members.
- [ ] Add `PIN_MATERIAL` (friction 0.06, restitution 0.18) and `RUMBLE_MATERIAL` (friction 0.3, restitution 0.1) alongside the existing `RAIL_MATERIAL`/`BUMPER_MATERIAL` in `src/track/definition.ts`; construct the diamond pin field (staggered 45°-rotated box posts, ≥1.2 m spacing, fractions 0.20–0.26 per `OBSTACLE-IDEAS.md` module 2) and the rumble strip (full-width transverse bars, 2–3 m approach per module 4) as `TrackBox` entries.
- [ ] Update `TRACK_COLORS` in `src/render/createRaceScene.ts` to match the trimmed `TrackBoxKind` — remove `gate`/`splitter`/`chicane`/`deflector`, add `pin`/`rumble`. (The compiler enforces this: `TRACK_COLORS` is `Record<TrackBox["kind"], number>`.)
- [ ] Tighten the sphere-to-surface gap assertion in `src/simulation/trackStress.test.ts:236` from `0.6` to `0.05` (per PLAN.md → "Phase A"). If it fails against the new pin/rumble geometry, fix the obstacle materials/placement, not the number.
- [ ] Extend `src/track/definition.test.ts`: pin-field post spacing/gap, drain-free bed geometry (no dead-end pockets a marble can settle in), and that `TrackBoxKind` has no unconstructed member.

**Phase gate (hard):**
- [ ] `pnpm typecheck`
- [ ] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] Run 5- and 15-marble races in both modes; confirm the pin field visibly scatters the pack and the rumble strip is visually distinct from the old gates.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 2 — Shape union

Branch: `raceway-obstacles/phase-2-shape-union` (`gh stack add`)

PLAN.md → "Phase B". One collider/mesh refactor that every later phase's
round or sloped geometry (cylinder posts, the bowl's rim wall, the windmill
blades) depends on.

Consumes: `TrackBoxKind`, `PIN_MATERIAL` (Phase 1).
Produces: `TrackBox` as a discriminated union on a `shape` field
(`"cuboid" | "cylinder" | "ball"`) in `src/track/definition.ts`; matching
switches in `attachBoxCollider` (`src/track/colliders.ts`) and the mesh
factory (`src/render/createRaceScene.ts`).

Fresh review: not required

- [ ] Convert `TrackBox` to a discriminated union with a `shape` field (`{ kind: "cuboid"; halfExtents: Vector3 }` | `{ kind: "cylinder"; radius: number; halfHeight: number }` | `{ kind: "ball"; radius: number }`) in `src/track/definition.ts`.
- [ ] Update `attachBoxCollider` in `src/track/colliders.ts` to switch on `box.shape.kind` and construct the matching `RAPIER.ColliderDesc` (`cuboid`/`cylinder`/`ball`).
- [ ] Update the obstacle mesh factory in `src/render/createRaceScene.ts` to switch on `box.shape.kind` (`THREE.BoxGeometry`/`THREE.CylinderGeometry`/`THREE.SphereGeometry`).
- [ ] Replace the diamond pin field's box posts with cylinder posts (radius 0.4 m, restitution 0.2, friction 0.05, per `OBSTACLE-IDEAS.md` module 7) in `src/track/definition.ts`.
- [ ] Add the wave section (`OBSTACLE-IDEAS.md` module 8): displace surface vertices along `up` by a sine profile (amplitude 0.3 m) in `createTrackDefinition`'s surface-generation loop in `src/track/definition.ts`, and apply the identical displacement to the side-rail centres — both derive from `path` samples, so the rails do not follow automatically.
- [ ] Amend `src/simulation/trackStress.test.ts` with the wave section's per-fraction clearance allowance. The global `0.05` threshold from Phase 1 does not move; this is a keyed exception, not a relaxation.

**Phase gate (hard):**
- [ ] `pnpm typecheck`
- [ ] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] Run 5- and 15-marble races; confirm cylinder posts deflect visibly differently from the old box posts and the wave section is visually distinct with marbles staying grounded across it.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 3 — Progress hardening and the vortex bowl

Branch: `raceway-obstacles/phase-3-vortex-bowl` (`gh stack add`)

PLAN.md → "Phase C". The spec's centre of gravity — expected to overrun. The
bowl is the spec's only queueing module (per PLAN.md → "Scheduled modules");
if it's descoped mid-phase, stop and ask rather than quietly shipping the
spec without it.

Consumes: `TrackBox` shape union, `attachBoxCollider` switch (Phase 2).
Produces: monotone-progress mechanism in `src/track/progress.ts`; coiled
`COURSE_WAYPOINTS` spiral forming the vortex bowl in
`src/track/definition.ts`; the bowl's exit-fraction constant, consumed by
Phase 5's tuning coverage.

Fresh review: required — this rewrites the measurement the live leaderboard,
camera target, final ranking, and finish detection all read (PLAN.md →
"The bowl is a spiral centreline, not an exception to the centreline").

- [ ] Add a monotone-progress mechanism in `src/track/progress.ts` — a stateful wrapper (e.g. `createProgressTracker()`) that clamps each marble's progress to `max(previousProgress, measureTrackProgress(...))`, keyed by marble index — and wire it into every per-frame progress read in `src/simulation/simulateRace.ts` (finish detection, `createFinalRanking`) and `src/ui/createRaceView.ts` (live leaderboard). Keep `measureTrackProgress` itself pure; exact mechanism (new wrapper vs. caller-side state) is an implementation call. Add coverage in `src/track/progress.test.ts` proving progress never decreases across a run, landing on the *existing* (pre-spiral) course first so the safety net is proven before the spiral depends on it.
- [ ] Coil `COURSE_WAYPOINTS` in `src/track/definition.ts` into a descending spiral of ~2.5 turns forming the 8 m vortex bowl (`OBSTACLE-IDEAS.md` module 9); raise `samplesPerSpan` and `maximumBankRadians` locally for the spiral's waypoint spans only (not the global `DEFAULT_TRACK_CONFIG` values); slope the bowl floor toward the drain so no flat resting point exists.
- [ ] Build the bowl's rim wall using the Phase 2 shape union; size the drain opening to ≥ 6 marble diameters (`DEFAULT_TRACK_CONFIG.marbleRadius * 2 * 6`) so it is provably clearable (PLAN.md → "The drain must be provably clearable").
- [ ] Add coverage: `src/track/definition.test.ts` for spiral mesh continuity (no degenerate/faceted triangles at the tightest radius) and drain sizing; `src/simulation/trackStress.test.ts` asserting progress is non-decreasing for every marble across a 15-marble run in both modes, every marble's progress passes the bowl's exit fraction, and containment holds through the coil.

**Phase gate (hard):**
- [ ] `pnpm typecheck`
- [ ] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] Run 15-marble races in both modes; confirm no marble stalls in the bowl, the leaderboard doesn't flicker backwards, and the bowl visibly reorders the field.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 4 — Deterministic motion

Branch: `raceway-obstacles/phase-4-deterministic-motion` (`gh stack add`)

PLAN.md → "Phase D". Adds the windmill and traffic-light gates on the
frame-index motion contract PLAN.md requires (per PLAN.md → "Motion must be
a pure function of frame index") so sim and replay can never drift.

Consumes: `TrackBox` shape union (Phase 2).
Produces: `ObstacleId`, `obstacleTransformAt(id, frameIndex)` in
`src/track/obstacleMotion.ts` (new file — kept separate from
`src/track/definition.ts`'s static geometry since motion is a distinct
concern both `simulateRace.ts` and `createRaceScene.ts` import).

Fresh review: not required

- [ ] Add `src/track/obstacleMotion.ts` exporting `ObstacleId` (union of moving-obstacle identifiers: `"windmill"`, `"gate-1"`, `"gate-2"`, `"gate-3"`) and `obstacleTransformAt(id: ObstacleId, frameIndex: number): { position: Vector3; rotation: Quaternion }` — pure functions of `frameIndex` only, no wall-clock input, no `Math.random` outside `createSeededRandom`.
- [ ] Add kinematic position-based `RAPIER.RigidBody`s for each `ObstacleId` in `src/simulation/simulateRace.ts`, updated every frame via `obstacleTransformAt`; keep windmill blade-tip speed under 3 m/s and gate ramp time ≥ 0.4 s (PLAN.md → "Tunnelling").
- [ ] Call `obstacleTransformAt` from the render loop in `src/render/createRaceScene.ts`, keyed to the replay's current frame index, to move the corresponding meshes.
- [ ] Construct the windmill (four-blade paddle, `OBSTACLE-IDEAS.md` module 11) and the three traffic-light gates (module 13) as new `TrackBox`/mesh entries in `src/track/definition.ts`, using the Phase 2 shape union for blade/gate geometry.
- [ ] Add coverage proving `simulateRace`'s kinematic-body transforms and `obstacleTransformAt`'s return value agree at sampled frames (the sim/render-drift risk in PLAN.md → "Where the risk actually sits"), and that a fixed seed produces an identical recording across two runs.

**Phase gate (hard):**
- [ ] `pnpm typecheck`
- [ ] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] Run 5- and 15-marble races in both modes; confirm the windmill and gates move smoothly with no visible desync between the physics and the rendered mesh, and no marble passes through a moving part.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 5 — Tuning and coverage

Branch: `raceway-obstacles/phase-5-tuning` (`gh stack add`)

PLAN.md → "Phase E". Final phase: retunes against the finished geometry
rather than tuning incrementally against modules that later phases still
change.

Consumes: all obstacle modules (Phases 1–4).
Produces: retuned `DEFAULT_TRACK_CONFIG` and obstacle placement/material
constants in `src/track/definition.ts`; module-bound overtake coverage.

Fresh review: not required

- [ ] Retune `DEFAULT_TRACK_CONFIG` and obstacle placement/material constants in `src/track/definition.ts` so 5- and 15-marble fixed-seed runs in both `first` and `last` mode land within the 40–120 s window (`DEFAULT_RACE_CONFIG.maximumSimulationSeconds`).
- [ ] Rebind the overtake/ranking-change assertion in `src/simulation/trackStress.test.ts` — currently checks only that ranking changes *somewhere* across the whole course — to specific module boundaries (pin field, bowl, windmill/gates), per PLAN.md → "Overtake coverage becomes tautological".

**Phase gate (hard):**
- [ ] `pnpm typecheck`
- [ ] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] Run 5- and 15-marble races in both modes at 1080p; confirm every module is visually distinct, all marbles stay inside the rails, the leaderboard is readable, and the bowl reads as the race's decisive moment.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Spec gate (hard — once, before the final phase's PR)

- [ ] `pnpm lint`
- [ ] `pnpm format:check`
- [ ] `pnpm test`
- [ ] `pnpm build`
