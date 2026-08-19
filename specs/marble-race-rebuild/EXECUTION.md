# Marble Race Rebuild — Execution Plan

Spec: [PLAN.md](PLAN.md). Rulebook: `specs/RULEBOOK.md`.
Integration branch: `main`. Branch model: stacked via `gh stack` (default) — `gh stack view
--json` exits 2 ("not part of a stack") after the stale tracking from the two archived specs
was cleared on 2026-08-18 (backup: `.git/gh-stack.bak-20260818`).

Scope: **Spec 1 — Feel and contract** only, per PLAN.md → "Sequencing". Specs 2–4 get their
own EXECUTION.md once Spec 1's findings are in.

Spec 1 acceptance is **not** an agent's to declare — see "Spec gate" below and PLAN.md →
"Acceptance".

## STATUS

- Current phase: 4 — in-progress (resumed 2026-08-19 on a cuboid-plate rebuild)
- Phase 1 — Scaffold and old-race removal: done
- Phase 2 — Module contract, Validator, chute: done
- Phase 3 — Showcase: done
- Phase 4 — Vortex bowl: in-progress. The first attempt (trimesh basin, WIP commit `afcca58`) could
  not be made to orbit; see Phase 4's "Amended 2026-08-19" note for the full account and the swept
  search behind it. Resumed on the user's direction with the mechanism unchanged and the collider
  construction replaced: a ring of cuboid plates carries the marble, the revolved mesh stays as the
  visual only, per `docs/adr/0003-cuboid-colliders-under-revolved-visuals.md`. That rebuild landed
  2026-08-20 (`revolveProfileToPlates`, `vortexBowl/index.ts` rewired, 9 new geometry tests) and, per
  Phase 4's "Result, 2026-08-20" note, actually orbits and drains at the centre for the first time --
  something the trimesh attempt never achieved even once. Remaining: orbit count is not yet reliably
  >=3 (the guardrail), so the guardrail test and video-matched tuning are still open.
- Verification debt: none. Phase 1's "pnpm dev shows one marble falling and
  resting" review-checklist item could not be verified by the implementer —
  this session's browser automation reports `document.visibilityState` stuck
  on `"hidden"` with `requestAnimationFrame` never firing, an environment
  limitation, not a code question. Left as an open item in the PR's review
  checklist for the user to close with their own `pnpm dev`, per the
  rulebook's "manual verification scenarios are the user's, not agent debt."
  Phase 3's review checklist is entirely unverified for the same underlying
  reason, one step worse: no browser access at all this session, not even
  Phase 1's DOM/console-level checks. Fresh review was upgraded to required
  specifically because of this gap and caught two real runtime bugs
  (teleporting marbles, a geometry leak — see Phase 3's Fresh review note)
  that typecheck/lint/build could not; both fixed and re-reviewed clean. The
  question fresh review cannot answer — does the chute actually *look* fast
  and fun — is still entirely open and is the single most important thing
  for the user to check before merging Phase 3.

Resolved while planning, not deferred: initial values for `marbleRadius`, channel width, and
Cell pitch landed in `src/race/scale.ts` in Phase 2 (done) and are tuned empirically in
Phases 3–4 — PLAN.md defers them deliberately. The on-screen-displacement metric is likewise
defined in Phase 2 (`src/validator/metrics.ts`'s `displacementPerSecond`); its threshold number
is still Phase 3's to set, once a chute is watchable.

## Phase 1 — Scaffold and old-race removal

Branch: `marble-race-rebuild/phase-1-scaffold` (stacked: `gh stack add`)

Nothing downstream builds until React mounts, Rapier steps, and the two Rapier copies are
pinned equal.

Consumes: nothing.
Produces: `src/main.tsx` mounting a React root; `<Canvas>` + `<Physics>` render path proven;
`@dimforge/rapier3d-compat` pinned equal to `@react-three/rapier`'s resolved copy.

Fresh review: required — CI/test-gate infrastructure (`tsconfig.json`, `vite.config.ts`,
oxlint config and the deploy workflow's gate all change; a weakened typecheck here would go
unnoticed for the rest of the spec)

- [x] Add deps at the versions in PLAN.md → "Stack": `react@19.2.8`, `react-dom@19.2.8`, `@react-three/fiber@9.7.0`, `@react-three/rapier@2.2.0`, `@react-three/drei@10.7.8`, `@react-three/postprocessing@3.0.5`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`; keep `three@0.185.1`.
- [x] Pin `@dimforge/rapier3d-compat` to whatever version `@react-three/rapier@2.2.0` resolves (read it from `pnpm-lock.yaml`, do not assume 0.20.0). Resolved to `0.19.2`, not the `0.20.0` PLAN.md assumed — confirmed against `@react-three/rapier`'s own `package.json`, which pins it exact, not a range.
- [x] Add `src/deps.test.ts` asserting the `@dimforge/rapier3d-compat` version resolved directly equals the one resolved under `@react-three/rapier` — per PLAN.md → "Stack", drift makes the Validator lie silently. Walks real Node resolution from `@react-three/rapier`'s entry file rather than trusting node_modules layout; verified it actually fails on an injected drift before relying on it.
- [x] (amended 2026-08-18) Add `@types/node` and `"node"` to `tsconfig.json`'s `types` — `src/deps.test.ts`'s `node:module`/`node:path`/`node:fs` imports don't typecheck without it. Not in PLAN.md's stack list.
- [x] Set `"jsx": "react-jsx"` in `tsconfig.json`; register `@vitejs/plugin-react` in `vite.config.ts`; keep `base: "./"`.
- [x] (amended 2026-08-18) `optimizeDeps.entries` drops `preview.html`, not kept as originally written — see the `racePreview.ts` deletion below, which this entry can't survive.
- [x] Enable oxlint's React and react-hooks rules in the project's oxlint config so `pnpm lint` covers `.tsx`. oxlint folds react-hooks rules into its own `react` plugin (`react/rules-of-hooks`, `react/exhaustive-deps`) rather than a separate package; verified `rules-of-hooks` actually fires on a conditional-hook fixture before relying on it.
- [x] Replace `src/main.ts` with `src/main.tsx`: mount a React root into `#app` rendering a `<Canvas><Physics>` smoke scene — one marble dropped onto one static floor — to prove the R3F/Rapier path end to end. Update `index.html`'s script src.
- [x] Delete the race pipeline: `src/simulation/simulateRace.ts`, `simulateWithRetry.ts`, `initializeRapier.ts`, `trackStress.test.ts`, `simulateRace.test.ts`, `simulateWithRetry.test.ts`.
- [x] Delete the track and replay layers: `src/track/definition.ts`, `colliders.ts`, `progress.ts` and their tests; `src/render/createRaceScene.ts`, `src/render/cameraTarget.ts` and its test; `src/replay/createReplayController.ts` and its test.
- [x] Delete `src/app/createApp.ts` + `createApp.test.ts` and `src/ui/createRaceView.ts` — all three depend on the deleted replay and scene layers.
- [x] Strip the recording types from `src/race/types.ts`: remove `RaceRecording`, `TransformFrame`, `MarbleTransform`; keep `SelectionMode`, `PickerSettingsV1`, `PickerStateV1`, `Vector3`, `Quaternion`, `CommittedRaceRecord` for Spec 4. `RecordedContactEvent` is **not** removed, correcting this item as originally written — see next item.
- [x] (amended 2026-08-18) Keep `RecordedContactEvent` in `src/race/types.ts`, commented as to why: `createRaceAudio.ts`'s `playContact` still takes it, and that module is the very next item's "keep untouched" — deleting the type would force touching audio code that Spec 4 owns. Original item 10 said to remove it; that was a defect in the plan, not something I could satisfy both items on.
- [x] Keep untouched as Spec 4's port source, per PLAN.md → "What carries over unchanged": `src/race/random.ts`, `src/race/config.ts`, `src/storage/raceStore.ts`, `src/render/marbleStyles.ts`, `src/audio/createRaceAudio.ts`, `src/ui/createSetupView.ts`, `src/ui/createResultDialog.ts` and their tests. None touched.
- [x] (amended 2026-08-18) Delete `src/dev/racePreview.ts` and `preview.html` — the tuning harness depended entirely on `simulateRace`/`initializeRapier`/`createRaceView`, all deleted above, and EXECUTION.md's own Phase 3 already routes the real Showcase through `main.tsx`, not a second entry point. Not in the original checklist; necessary for the deletions above to typecheck at all.
- [x] Delete the unreferenced Vite scaffold leftovers: `src/counter.ts`, `src/style.css`, `src/assets/hero.png`, `src/assets/typescript.svg`, `src/assets/vite.svg`. `.prettierignore` is **not** deleted — see next item.
- [x] (amended 2026-08-18) Keep `.prettierignore`, correcting this item as originally written: PLAN.md's claim that it "survives from a Prettier this project does not depend on" is wrong — `oxfmt` reads it as its own ignore file (confirmed: deleting it made `pnpm format:check` start scanning `specs/`, `ui-variant-*.html`, and `README.md`, all of which the marble-race-picker spec deliberately excluded). Deleting it would have broken `pnpm format:check` in `.github/workflows/deploy-pages.yml` on every future push to `main`.
- [x] Confirm `main` still builds and deploys: `pnpm build` succeeds (`dist/` produced, single ~3.3 MB chunk — code-splitting is out of scope for this phase). `index.html` now serves the smoke scene, not a working picker — per the session's decision, that is expected until Spec 4.

**Phase gate (hard):**
- [x] `pnpm typecheck` — clean (project-wide `tsc -b`).
- [x] `pnpm vitest related --run <changed files>` against the diff's non-deleted files (`src/main.tsx`, `src/race/types.ts`, `vite.config.ts`) found no related tests — expected, since `types.ts`'s consumers only use `import type`, which `vitest related`'s module graph doesn't see. Ran the full suite as substitute evidence instead: `pnpm test` — 7 files, 17 tests, all passing.

Also run and clean, beyond the two hard gate items: `pnpm lint` (0 findings) and `pnpm build` (succeeds). `pnpm format:check` still fails on 11 files (9 `.claude/skills/threejs-*/SKILL.md` plus `CLAUDE.md` and `docs/DOMAIN-RULEBOOK.md`) — confirmed **pre-existing on `main` before this phase** (checked out `main` at the planning commit and reproduced the same 11-file failure there), not part of this phase's gate, not touched here. Flagged for the user; `deploy-pages.yml`'s format-check step is presently red on `main` for reasons unrelated to this spec.

**Review checklist (user, at PR review):**
- [ ] `pnpm dev` shows one marble falling onto a floor and resting — R3F and Rapier are alive. **Could not be verified by the implementer**: this session's browser automation reports `document.visibilityState` as permanently `"hidden"` with `requestAnimationFrame` never firing (0 calls in a 3s window, unaffected by clicks or `window.focus()`), which is an environment limitation, not a code question — R3F's frame loop is entirely rAF-driven, so no automated screenshot in this environment can show a rendered frame regardless of correctness. Verified by other means instead: `<Canvas onCreated>` fires, `RAPIER.init()` resolves cleanly against the pinned version with no rejection, zero console errors/unhandled rejections through the full load sequence, and the scene graph (camera distance ~0.67 m from a 0.016 m-radius marble over a 1×1 m floor, fov 50°) checks out on inspection. This item genuinely needs your own `pnpm dev` to close.
- [ ] `pnpm build` output loads from `dist/` with no console errors.

**On completion:** run the phase gate; run `fresh-review` (required above); update STATUS +
checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 2 — Module contract, Validator, chute

Branch: `marble-race-rebuild/phase-2-contract-validator` (stacked: `gh stack add`)

The pure headless layer every visual surface consumes; the chute lands here because it is the
Validator's own fixture, per PLAN.md → "Sequencing".

Consumes: nothing from Phase 1 but its dependency graph.
Produces (corrected from the plan's sketch to the actual exported surface —
"Interfaces are part of the contract"): from `src/modules/types.ts` — `Role`, `Cell`, `Anchor`,
`Footprint`, `Shape`, `ColliderMaterial`, `ColliderSpec`, `VisualMaterial`, `VisualSpec`, `Spec`,
`NumberParamField`, `BooleanParamField`, `ParamField`, `ParamSchema`, `ModuleMeta`,
`KinematicTransform`, `ModuleDefinition<P>`. `Shape` unifies collider and visual geometry
(cuboid/cylinder/ball/trimesh) rather than duplicating the union per concern; `trimesh` exists
from this phase on so Phase 4's revolved bowl geometry doesn't force a breaking change to a
contract Phase 3's renderer already depends on.
From `src/race/scale.ts` — `SCALE` (includes `cellPitch`, defined but unconsumed: nothing
computes real Cell occupancy until Spec 3's Board exists).
From `src/modules/chute/index.ts` — `ChuteParams`, `chute: ModuleDefinition<ChuteParams>`.
From `src/validator/buildWorld.ts` — `buildWorld(specs: readonly Spec[]): RAPIER.World`.
From `src/validator/metrics.ts` — `FrameSample`, `MarbleRun`, `DwellResult`, `StallCount`,
`measureDwell(run, exit): DwellResult`, `displacementPerSecond(run): number[]`,
`shuffleCoefficient(dwellSecondsByMarbleIndex): number`, `countStalls(exitedFlags): StallCount`.
From `src/validator/validateModule.ts` — `ValidateModuleOptions`, `ValidationReport`,
`validateModule(module, params, options): Promise<ValidationReport>`.

Fresh review: not required

- [x] Define the contract in `src/modules/types.ts` exactly as PLAN.md → "The Module contract" states: `buildSpec(params): Spec` pure, `step(spec, tSeconds): KinematicTransform[]` pure in `t`. `Footprint` carries occupied Cells plus entry and exit `Anchor`s. `cells` is legitimately `[]` for every Module until Spec 3's Board exists to occupy — see the corrected Produces line above.
- [x] Add `src/race/scale.ts` with the toy-scale constants per PLAN.md → "Scale and materials": marble radius ≈ 0.016, channel width ≈ 0.5, gravity −9.81, and non-zero restitution / zero damping defaults. These are starting values, tuned in Phases 3–4. Also carries `cellPitch`, per STATUS's note above.
- [x] Add `src/modules/chute/index.ts`: a straight banked chute with side rails, `role: "accel"`, params for length, grade, and width.
- [x] Add `src/validator/buildWorld.ts` translating `ColliderSpec[]` into a raw `@dimforge/rapier3d-compat` world — no React, no `@react-three/rapier`, per ADR 0002.
- [x] Add `src/validator/metrics.ts` computing Dwell Time distribution, exit speed, Shuffle coefficient, stall count, and on-screen displacement per second (the metric enforcing PLAN.md's "Dwell must be paid for with visible motion"; its threshold is set in Phase 3). Per-run primitives (`measureDwell`, `displacementPerSecond`, `shuffleCoefficient`, `countStalls`); `validateModule.ts` aggregates them into seed-sweep distributions.
- [x] Add `src/validator/validateModule.ts` stepping a fixed 1/60 across a seed sweep and returning a `ValidationReport`.
- [x] Add `src/modules/purity.test.ts` asserting `buildSpec` is referentially transparent — same params in, deep-equal `Spec` out, across repeated calls and call order.
- [x] Add `src/validator/validateModule.test.ts` running the chute over a seed sweep: every marble exits, zero stalls, and exit speed rises with grade.
- [x] (amended 2026-08-19) Fix `chute`'s pitch quaternion: the original used a hand-picked `setFromAxisAngle` sign that pointed the ramp uphill while `entry`/`exit` still claimed it went downhill — self-consistent enough to typecheck, wrong enough that a marble fell straight through the floor with zero contact. Replaced with `setFromUnitVectors` derived directly from `exit - entry`, which cannot disagree with the anchors by construction. Found empirically via `validateModule.test.ts` failing (`stalledMarbles` 32/32 instead of 0), not by reading the math; root-caused with a throwaway scratch reproduction (never committed) that isolated rotation sign, collider thickness, and CCD one at a time before finding the real cause below.
- [x] (amended 2026-08-19) Fix `validateModule.ts`'s `spawnMarbles`: a marble spawned exactly at `Footprint.entry.position` sits on the geometric edge of the entry collider and can miss it entirely on the first physics step — confirmed not a thin-collider tunneling issue (a 10×-thicker floor made no difference) but a genuine non-overlap at spawn. Fixed by spawning a few marble radii inward along `entry.tangent`, lifted along `entry.up`. Also replaced the lateral spawn axis's hardcoded `+X` assumption with `cross(entry.tangent, entry.up)`, which holds for any Module's entry orientation, not only the chute's.

**Phase gate (hard):**
- [x] `pnpm typecheck` — clean (project-wide `tsc -b`).
- [x] `pnpm vitest related --run <changed files>` against this phase's diff (`src/modules/chute/index.ts`, `purity.test.ts`, `types.ts`, `src/race/scale.ts`, `src/validator/{buildWorld,metrics,validateModule,validateModule.test}.ts`) — 2 files, 7 tests, all passing.

Also run and clean, beyond the two hard gate items: `pnpm test` (full suite, 9 files / 24 tests) and `pnpm lint` (0 findings).

**Review checklist (user, at PR review):**
- [ ] Read `src/modules/types.ts` and confirm the contract is one you want to author ten Modules against.

**On completion:** run the phase gate; update STATUS + checkboxes; stop and ask before
push/PR. Review checklist goes into the PR description.

## Phase 3 — Showcase

Branch: `marble-race-rebuild/phase-3-showcase` (stacked: `gh stack add`)

The React surface over the Phase 2 contract, and the first point at which toy-scale feel can
be judged by eye.

Consumes: `ModuleDefinition`, `Spec`, `ParamSchema`, `SCALE`, `chute`, `validateModule`,
`exitPlaneDistance` and `percentile` (both promoted to exported per-run/aggregation primitives
in `src/validator/metrics.ts` this phase, so the live Feeder and `validateModule.ts` share the
same math instead of two implementations that could silently diverge).
Produces: `<ModuleColliders spec anchor>` (`src/modules/render/ModuleColliders.tsx`, the shared
Spec renderer both Showcase and Course use); `<Showcase />`; `<Feeder>`, `FeedMode`
(`src/showcase/Feeder.tsx`); `<ParamPanel>`, `ParamValues`, `defaultParamValues`
(`src/showcase/ParamPanel.tsx`); `<MetricsReadout>`, `LiveMetricsState`, `EMPTY_LIVE_METRICS`
(`src/showcase/MetricsReadout.tsx`); `MODULES`, `ShowcaseEntry` (`src/showcase/registry.ts` —
not in the original sketch; the obvious place for Phase 4 to add `vortexBowl` without touching
`Showcase.tsx`'s JSX). `src/validator/metrics.ts` also gains
`MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND`.

Fresh review: **upgraded to required** — this phase's entire diff (10 files, six of them new
React/R3F/Rapier surface) has **zero runtime confirmation**: the Claude-in-Chrome extension
wasn't connected at all in this session (a strictly worse position than Phase 1's, which at
least got DOM/console checks despite the rAF/visibility limitation). Typecheck, lint, and the
existing test suite are the only evidence behind this phase; per the rulebook's self-check
("Am I less confident in this change than usual?"), the honest answer is yes.

**Initial review found two real bugs** — evidence of exactly the runtime-verification gap
above, both bugs that typecheck/lint/build cannot see: **P0**, `Feeder.tsx` recomputed every
live marble's `spawnPosition` (with a fresh `Math.random()` jitter) inline in render, feeding
a changed value into `<RigidBody position>` every render — `@react-three/rapier` applies that
by calling `setTranslation` again, so an already-rolling marble was silently teleported back
toward spawn on nearly every re-render (every exit, stall, or param edit). **P1**,
`ModuleColliders.tsx`'s `VisualMesh` built a fresh `THREE.BufferGeometry` on every param edit
(a fresh `Spec` per `buildSpec` call means a fresh `visual.shape` identity) with nothing
disposing the previous one — geometries passed via the `geometry` prop bypass R3F's automatic
dispose-on-replace. Both fixed in `990def4`: spawn position computed once at spawn time and
stored in state (never recomputed for an already-alive marble); geometry disposed via a
`useEffect` cleanup keyed on the memoized geometry. **Re-review: no findings** — both
confirmed resolved by independently tracing `@react-three/rapier`'s actual bundled source for
the exact mechanism each bug depended on, not by trusting the fix's own reasoning. One residual
risk noted and not escalated: React StrictMode's dev-only double-invoke of effect cleanups
disposes-then-reattaches the same geometry object within one commit before paint — benign
(Three.js re-uploads it to the GPU normally), doesn't reproduce in production builds.

- [ ] Add `src/modules/render/ModuleColliders.tsx` rendering a `Spec`'s colliders and visuals through `@react-three/rapier` — the single render path for every Module, per PLAN.md → "The Module contract".
- [ ] Add `src/showcase/Showcase.tsx`: Module sidebar, one `<Canvas><Physics>` stage, and layout per PLAN.md → "Showcase".
- [x] Add `src/showcase/ParamPanel.tsx` generating controls from the selected Module's `meta.params` schema — never a hand-written panel per Module. Also exports `defaultParamValues(schema)`, used to (re)initialize params whenever the selected Module changes.
- [x] Add `src/showcase/Feeder.tsx` releasing marbles in `continuous` / `burst15` / `single` modes. Each marble despawns itself once it falls past `DESPAWN_DROP_METERS` below the exit anchor, so a long continuous feed doesn't accumulate free-falling bodies.
- [x] Add `src/showcase/MetricsReadout.tsx` displaying live Dwell, exit speed, Shuffle, and stalls from the Phase 2 metrics, computed over the live stage. Deliberately plain (no styling investment) — the broadcast chrome is Spec 4's.
- [x] Apply the art direction to Modules and marbles per PLAN.md → "Art direction": glossy plastic materials, dark charcoal ground, glass/chrome marbles, bloom via `@react-three/postprocessing`.
- [x] Point `src/main.tsx` at `<Showcase />`, replacing Phase 1's smoke scene. No router — Spec 4 decides routing.
- [x] Set the on-screen-displacement threshold in `src/validator/metrics.ts` from what the chute actually reads once watchable, and record the chosen number in a comment. **Physics-grounded, not eye-confirmed** — see the Fresh review note above; `MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND = 0.02`, measured by sweeping the chute's own params schema (grade 0.05–0.6, length 0.2–1.5) through `validateModule` and reading the real `minDisplacementPerSecond` back (0.043–0.42 m/s across that range), set below that floor with margin.
- [x] (amended 2026-08-19) Add `src/showcase/registry.ts`: not in the original checklist, but the natural home for the `ShowcaseEntry` type-erasure boundary (`toShowcaseEntry`) and the `MODULES` list — `Showcase.tsx` imports it rather than owning the registry inline, so Phase 4 adds `vortexBowl` in one line here without touching the Showcase's JSX.
- [x] (amended 2026-08-19) Fix `src/modules/chute/index.ts`'s materials: the original metalness/roughness values (0.1/0.8 floor, 0.3/0.4 rails) rendered as matte concrete, not the glossy plastic the art-direction item above asks for. Corrected while implementing that same item, not a separate change.
- [x] (amended 2026-08-19) Fix `minDisplacementPerSecond` in `src/validator/metrics.ts` / `validateModule.ts`: found while trying to set the threshold above from real numbers — every chute param combination read the same ~0.05–0.2 m/s regardless of grade, because a marble spawned from rest has near-zero displacement for its first few frames regardless of how fast the Module ultimately is, and that transient dominated the "worst observed" reading entirely. `validateModule.ts` now skips a 6-frame (~0.1s) warm-up before folding a run into the minimum; re-measured numbers (above) now actually scale with grade. This is the same file the threshold item already names, not new scope.
- [x] (amended 2026-08-19) Fix fresh review's P0 (marble teleport on every re-render) and P1 (leaked `THREE.BufferGeometry` on every param edit) — see the Fresh review note above for full detail. Commit `990def4`.

**Phase gate (hard):**
- [x] `pnpm typecheck` — clean (project-wide `tsc -b`), re-run after the P0/P1 fix.
- [x] `pnpm vitest related --run <changed files>` against this phase's full diff (all 10 files, including the P0/P1 fix) — 2 files, 7 tests, all passing.

Also run and clean, beyond the two hard gate items, re-run after the P0/P1 fix: `pnpm test`
(full suite, 9 files / 24 tests), `pnpm lint` (0 findings), `pnpm build` (succeeds).

**Review checklist (user, at PR review):**
- [ ] **Do the marbles look fast?** Watch the chute at continuous feed. This is the toy-scale question the whole scale decision rests on; a no here means revisiting PLAN.md → "Scale and materials", not tuning onward. **Not verified by the implementer at all this phase** — no browser access this session, not even the DOM/console-level checks Phase 1 managed. Everything in this phase is typecheck/lint/build-verified and carefully reasoned through the Rapier/R3F API declarations, but nobody has watched it run.
- [ ] Dragging any chute param visibly changes behaviour, and the metrics readout moves with it.
- [ ] All three Feeder modes work.

**On completion:** run the phase gate; update STATUS + checkboxes; stop and ask before
push/PR. Review checklist goes into the PR description.

## Phase 4 — Vortex bowl

Branch: `marble-race-rebuild/phase-4-vortex-bowl` (stacked: `gh stack add`)

The spec's risk, isolated: the one Module that failed before, and the only one whose surface
curves. As of 2026-08-19 it curves *visually* and collides as boxes — see ADR 0003.

Consumes: `ModuleDefinition`, `Spec`, `SCALE`, `<ModuleColliders>`, `<Showcase />`,
`validateModule`.
Produces: `vortexBowl: ModuleDefinition<VortexBowlParams>`; and from
`src/modules/geometry/revolve.ts`, two emitters over one shared `ProfileRing[]` --
`revolveProfile(profile, segments, marbleRadius): Shape` (the smooth trimesh, now the **visual**
source) and `revolveProfileToPlates(profile, segments, marbleRadius): PlatePlacement[]` (the
**collider** source, added 2026-08-19 per ADR 0003). `revolveProfile`'s signature is corrected from
the planned `ColliderSpec[]` return: `Shape` is the union already shared by
`ColliderSpec`/`VisualSpec` per types.ts, and `marbleRadius` is the facet-margin input the first
checklist item requires, which the planned two-arg signature had no room for.

Fresh review: **required** (upgraded 2026-08-19) -- the orbiting behaviour is now on its second
construction after the first was abandoned, and the rulebook's self-check "am I less confident in
this change than usual?" is plainly yes. Phase 3's upgrade on the same question caught two real
runtime bugs; this phase has less runtime confirmation available, not more.

- [x] Add `src/modules/geometry/revolve.ts` turning a 2D profile into a revolved trimesh collider, with a facet-chord margin sized against `SCALE.marbleRadius` so no marble tunnels a facet seam. Verified by `revolve.test.ts`: winding checked against a cone's computed face normals (inward+upward on every facet), facet-margin floor checked by forcing a coarse request up and confirming a fine one is left alone -- headless, since nothing here renders to check by eye.
- [x] (amended 2026-08-19) Add `revolveProfileToPlates(profile, segments, marbleRadius): PlatePlacement[]` to `src/modules/geometry/revolve.ts` — the same `ProfileRing[]` the trimesh emitter consumes, converted instead into cuboid plate placements (one plate per consecutive-ring pair per angular segment, orthonormal basis from Gram-Schmidt over the cell's own edge directions, quaternion via the standard rotation-matrix branch, each verified against hand-computed cases for all four branches before use). Radial bands come from `profile` unchanged; the angular segment count is requested at the true floor (not `revolveProfile`'s visual-tuned 48) and raised only as far as the shared marble-radius sagitta margin requires. Plate count at the Module's defaults: 693, versus 1584 had the visual's segment count been reused — recorded in `src/modules/vortexBowl/index.ts` next to `COLLIDER_SEGMENTS_REQUEST`.
- [x] (amended 2026-08-19) Extend `src/modules/geometry/revolve.test.ts`: five new tests -- every plate's rotation reproduces a unit, orthonormal, inward-and-upward basis (the same winding check `revolveProfile`'s own test makes, applied to the rotated local axes instead of a triangle's face normal); plate count matches one-per-cell against the trimesh emitter's own tiling over the identical profile; every plate's surface stays within the marble-radius sagitta margin of its four sampled corners; both emitters raise the same coarse request against the same facet-margin floor; the fewer-than-two-rings rejection. 9/9 passing.
- [x] (amended 2026-08-19) Supersedes the original item: `src/modules/vortexBowl/index.ts` builds the mechanism PLAN.md → "The vortex bowl" specifies — tilted basin leaning into the Board, raised rim, **tangential rim entry spout**, and a **centre drain** (not a rim gap; PLAN.md said both and was amended 2026-08-19 to the centre drain). `role: "shuffle"`.
- [x] (amended 2026-08-19) `buildSpec` emits the plate ring as `Spec.colliders` and the single `revolveProfile` trimesh as `Spec.visuals`, per ADR 0003. This is the phase's whole point of difference from the abandoned attempt — nothing else about the mechanism changes.
- [x] (amended 2026-08-19) Re-verify the three fixes carried over from the trimesh attempt still hold against plate colliders, since each was found against a different surface: the entry-ring margin (`BasinProfile.entryRing`), the world-down `exit.tangent`, and the ~20° inward entry lean. All three still apply and none became dead cargo -- confirmed by headless sweep (see "Result" below), not by inspection: the marble now makes real, sustained contact from spawn (no more zero-collision freefall), and exits are correctly detected near the drain rather than false-triggering near the rim.
- [x] Build the basin floor as a shallow inward spiral ramp with the exit at its inner end — the Dwell bound comes from this geometry, so `step` stays pure and no timer is added. Unchanged from the trimesh attempt (`buildBasinProfile` drives both emitters identically); what changed is rim wall height, needed for the geometry's own guarantee to actually hold at real entry speeds -- see "Result" below.
- [x] Expose params: basin radius, rim bank angle, board tilt, exit gap width, wall friction, spiral pitch — the six dials that set orbit count. Unchanged from the trimesh attempt (`VortexBowlParams`/`PARAM_SCHEMA`).
- [ ] Add `src/modules/vortexBowl/vortexBowl.test.ts` asserting the Validator guardrails from PLAN.md → "Acceptance": orbit count ≥ 3 at nominal entry speed, Dwell p50 in 4–8 s, p99 under 15 s, zero stalls across 200 seeds.
- [ ] Tune the six params in the Showcase against the reference video (`/Users/thomasduong/Pictures/Trivial/Video-79749.mp4`, bowls at 4–12 s, 20–28 s, 44–64 s) until orbit-then-drain reads correctly, then record the settled values as the Module's defaults.

**Amended 2026-08-19 — why the construction changed.** Kept as the record behind the amended items
above and behind ADR 0003; a cold agent needs to know what was already ruled out. The first attempt
(WIP commit `afcca58`) put a revolved-trimesh basin in `src/modules/vortexBowl/index.ts` with the
module contract and six-param schema. Three real, independently-confirmed bugs were found and fixed
along the way, and **all three carry forward** — they are properties of the mechanism, not of the mesh
(each is documented inline where fixed):
1. The entry ramp's endpoint originally landed exactly on the trimesh's outer boundary vertex — Rapier
   gave *zero* collision response there (not weak, not late — total freefall), confirmed by dumping raw
   per-frame trajectories with no renderer involved. Fixed with `BasinProfile.entryRing`, one ring inside
   the mesh's true edge.
2. `exitPlaneDistance`'s infinite-plane exit test (shared with the chute and the Feeder) false-triggered
   within a fifth of an orbit, because a marble legitimately still on the rim is measurably lower in
   world Y on the tilted-away side of its own orbit than the drain itself. Fixed by keeping `exit.tangent`
   as true world-down instead of tilting it with every other collider.
3. A rim entry aimed on a pure circumferential tangent only grazes the wall instead of being caught by
   it. Partially fixed with a ~20° inward lean.

**What is not fixed:** despite items 1–3, and despite a wide swept search (rim wall height 6–20 marble
radii; rim bank angle 0.3–1.4 rad, i.e. near-vertical to near-horizontal; wall/floor transition width
from a narrow band to 65% of the floor's radial run; entry speed 0.8–3 m/s; wall friction 0.04–0.12;
board tilt 0.15–0.35 rad; CCD on/off; physics timestep 1/60 down to 1/960; rotation locked vs free), a
marble entering the rim consistently takes **one hard deflection off the wall, then flies off in a
clean, unbroken ballistic arc** — never more than ~0.4 orbits before either escaping outward past the
mesh's edge or (rarely) draining by accident. This is not the orbit-then-drain behavior PLAN.md
describes, and none of the six params or the entry geometry moved it past that ceiling. The suspected
cause (unconfirmed): Rapier's contact resolution for a fast ball grazing a curved/concave trimesh at a
shallow angle, not a geometry defect this session found a way to fix. A structurally different collider
strategy (e.g. a stack of convex primitives approximating the curve, instead of one trimesh) is the next
thing worth trying, not more parameter sweeping.

Per PLAN.md → "Where the risk actually sits": *"The bowl. It is the one Module that failed before... If
the Module contract cannot express it cleanly, that must surface on Module 1, not Module 10."* It has
surfaced. Per PLAN.md → "Acceptance": *"Spec 1 cannot be marked done by an agent."* — this was always
going to need the user's judgment; it needs it earlier than expected, on the mechanism itself rather
than the final "does it look right" call.

**Resolved 2026-08-19, by the user:** rebuild the same mechanism on a ring of cuboid plates, keeping the
revolved mesh as the visual. Two alternatives were weighed and rejected for now — a helix descent (safe,
but abandons the roulette look) and a rotating turntable (needs `step`, and its shape supplies no Dwell
bound). Both stay available if the plate ring also fails to orbit; the helix is the fallback.

**Result, 2026-08-20 — the collider swap worked; containment needed one more fix.** Headless sweeps
(`buildWorld` + a raw Rapier ball, entry speed and velocity taken from the real `Footprint.entry`
anchor, not a hand-rolled spawn) against the cuboid-plate basin, at `RIM_WALL_HEIGHT_RADII` unchanged
from the trimesh attempt (6):

- Real, sustained contact from spawn, unlike the trimesh's single deflection -- confirms fixes 1 and 3
  above still apply to the plate surface.
- At entry speed 1.5 m/s: consistent orbiting (0.5-1.9 orbits across tilt 0.15-0.35 rad, friction
  0.04-0.12) draining within a few cm of the drain radius -- genuine orbit-then-drain, never observed
  even once with the trimesh.
- At entry speed 2-3 m/s: still escaped over the rim in most combinations (exit radius 0.5-0.7 m, past
  the whole basin) within under a second -- a *different* failure than the trimesh's ejection, and a
  physically expected one: `v^2/(2g)` puts a 2 m/s marble's climb potential (~0.20 m) at more than
  double a 6-marble-radii rim (0.096 m).

Raising `RIM_WALL_HEIGHT_RADII` to 30 (measured, not guessed -- 14 and 22 were tried first and left
gaps in the sweep) eliminated the rim escapes entirely: 12/12 combinations across friction 0.04-0.12
and speed 1.5-3 m/s now drain within 3 cm of the drain radius. Orbit count is not yet at the >=3
guardrail: it lands around 1-2, peaking at 2.4 in one `spiralPitch`/friction combination tried. A
`spiralPitch` sweep (0.10-0.25) did not find a clear further win and produced one case that never
drained within 30 s -- a stall, which the guardrail explicitly requires zero of -- so it was not kept.

**What remains open:** the mechanism now genuinely orbits and reliably drains at the centre, which the
trimesh attempt never did even once. Getting orbit count to a *reliable* >=3 (not just a peak) across
the full param range, plus the Dwell timing and zero-stall guardrails, is real remaining tuning -- the
next two checklist items, both still open.

**Phase gate (hard):**
- [ ] `pnpm typecheck` (project-wide `tsc -b`)
- [ ] `pnpm vitest related --run <changed files>` (fill from the real diff)

**Review checklist (user, at PR review):**
- [ ] **Does the bowl look like the video?** Marbles enter tangentially, orbit the rim several times, and drain when they slow — not drop straight through.
- [ ] Several marbles orbiting at once collide and reorder each other (that is the Shuffle).
- [ ] No marble ever sits still in the basin.

**On completion:** run the phase gate; update STATUS + checkboxes; stop and ask before
push/PR. Review checklist goes into the PR description.

## Spec gate (hard — once, before the final phase's PR)

- [ ] `pnpm test` (full local suite)
- [ ] `pnpm build` — the spec changes `vite.config.ts`, `tsconfig.json`, and the entry point, so the build is breakable here
- [ ] `pnpm lint` and `pnpm format:check` — both run in `.github/workflows/deploy-pages.yml` and both are affected by adding `.tsx`

**Acceptance beyond the gate.** Per PLAN.md → "Acceptance", the gate passing does **not**
complete Spec 1. Spec 1 ends when the user opens the Showcase, watches the bowl, and says it
looks like the reference video and the marbles look fast. Validator numbers are guardrails
that catch regressions; they are not the criterion. Guardrails green with the user
unconvinced is **not done**, and no agent may close this spec on a green suite.
