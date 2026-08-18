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

- Current phase: 1 — pending
- Phase 1 — Scaffold and old-race removal: pending
- Phase 2 — Module contract, Validator, chute: pending
- Phase 3 — Showcase: pending
- Phase 4 — Vortex bowl: pending
- Verification debt: none

Resolved while planning, not deferred: initial values for `marbleRadius`, channel width, and
Cell pitch land in `src/race/scale.ts` in Phase 2 and are tuned empirically in Phases 3–4 —
PLAN.md defers them deliberately. The on-screen-displacement threshold is likewise defined as
a metric in Phase 2 and given its number in Phase 3, once a chute is watchable.

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

- [ ] Add deps at the versions in PLAN.md → "Stack": `react@19.2.8`, `react-dom@19.2.8`, `@react-three/fiber@9.7.0`, `@react-three/rapier@2.2.0`, `@react-three/drei@10.7.8`, `@react-three/postprocessing@3.0.5`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`; keep `three@0.185.1`.
- [ ] Pin `@dimforge/rapier3d-compat` to whatever version `@react-three/rapier@2.2.0` resolves (read it from `pnpm-lock.yaml`, do not assume 0.20.0).
- [ ] Add `src/deps.test.ts` asserting the `@dimforge/rapier3d-compat` version resolved directly equals the one resolved under `@react-three/rapier` — per PLAN.md → "Stack", drift makes the Validator lie silently.
- [ ] Set `"jsx": "react-jsx"` in `tsconfig.json`; register `@vitejs/plugin-react` in `vite.config.ts`; keep `base: "./"` and both `optimizeDeps.entries`.
- [ ] Enable oxlint's React and react-hooks rules in the project's oxlint config so `pnpm lint` covers `.tsx`.
- [ ] Replace `src/main.ts` with `src/main.tsx`: mount a React root into `#app` rendering a `<Canvas><Physics>` smoke scene — one marble dropped onto one static floor — to prove the R3F/Rapier path end to end. Update `index.html`'s script src.
- [ ] Delete the race pipeline: `src/simulation/simulateRace.ts`, `simulateWithRetry.ts`, `initializeRapier.ts`, `trackStress.test.ts`, `simulateRace.test.ts`, `simulateWithRetry.test.ts`.
- [ ] Delete the track and replay layers: `src/track/definition.ts`, `colliders.ts`, `progress.ts` and their tests; `src/render/createRaceScene.ts`, `src/render/cameraTarget.ts` and its test; `src/replay/createReplayController.ts` and its test.
- [ ] Delete `src/app/createApp.ts` + `createApp.test.ts` and `src/ui/createRaceView.ts` — all three depend on the deleted replay and scene layers.
- [ ] Strip the recording types from `src/race/types.ts`: remove `RaceRecording`, `TransformFrame`, `MarbleTransform`, `RecordedContactEvent`; keep `SelectionMode`, `PickerSettingsV1`, `PickerStateV1`, `Vector3`, `Quaternion` for Spec 4.
- [ ] Keep untouched as Spec 4's port source, per PLAN.md → "What carries over unchanged": `src/race/random.ts`, `src/race/config.ts`, `src/storage/raceStore.ts`, `src/render/marbleStyles.ts`, `src/audio/createRaceAudio.ts`, `src/ui/createSetupView.ts`, `src/ui/createResultDialog.ts` and their tests.
- [ ] Delete the unreferenced Vite scaffold leftovers: `src/counter.ts`, `src/style.css`, `src/assets/hero.png`, `src/assets/typescript.svg`, `src/assets/vite.svg`, and `.prettierignore` (Prettier is not a dependency).
- [ ] Confirm `main` still builds and deploys: `index.html` now serves the smoke scene, not a working picker — per the session's decision, that is expected until Spec 4.

**Phase gate (hard):**
- [ ] `pnpm typecheck` (project-wide `tsc -b`)
- [ ] `pnpm vitest related --run <changed files>` (fill from the real diff)

**Review checklist (user, at PR review):**
- [ ] `pnpm dev` shows one marble falling onto a floor and resting — R3F and Rapier are alive.
- [ ] `pnpm build` output loads from `dist/` with no console errors.

**On completion:** run the phase gate; run `fresh-review` (required above); update STATUS +
checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 2 — Module contract, Validator, chute

Branch: `marble-race-rebuild/phase-2-contract-validator` (stacked: `gh stack add`)

The pure headless layer every visual surface consumes; the chute lands here because it is the
Validator's own fixture, per PLAN.md → "Sequencing".

Consumes: nothing from Phase 1 but its dependency graph.
Produces: `Role`, `ColliderSpec`, `VisualSpec`, `Anchor`, `Footprint`, `Spec`, `ModuleMeta`,
`ParamSchema`, `KinematicTransform`, `ModuleDefinition<P>` (all from `src/modules/types.ts`);
`SCALE` from `src/race/scale.ts`; `chute: ModuleDefinition<ChuteParams>`;
`buildWorld(specs: readonly Spec[]): RAPIER.World`;
`validateModule(module, params, options): ValidationReport`.

Fresh review: not required

- [ ] Define the contract in `src/modules/types.ts` exactly as PLAN.md → "The Module contract" states: `buildSpec(params): Spec` pure, `step(spec, tSeconds): KinematicTransform[]` pure in `t`. `Footprint` carries occupied Cells plus entry and exit `Anchor`s.
- [ ] Add `src/race/scale.ts` with the toy-scale constants per PLAN.md → "Scale and materials": marble radius ≈ 0.016, channel width ≈ 0.5, gravity −9.81, and non-zero restitution / zero damping defaults. These are starting values, tuned in Phases 3–4.
- [ ] Add `src/modules/chute/index.ts`: a straight banked chute with side rails, `role: "accel"`, params for length, grade, and width.
- [ ] Add `src/validator/buildWorld.ts` translating `ColliderSpec[]` into a raw `@dimforge/rapier3d-compat` world — no React, no `@react-three/rapier`, per ADR 0002.
- [ ] Add `src/validator/metrics.ts` computing Dwell Time distribution, exit speed, Shuffle coefficient, stall count, and on-screen displacement per second (the metric enforcing PLAN.md's "Dwell must be paid for with visible motion"; its threshold is set in Phase 3).
- [ ] Add `src/validator/validateModule.ts` stepping a fixed 1/60 across a seed sweep and returning a `ValidationReport`.
- [ ] Add `src/modules/purity.test.ts` asserting `buildSpec` is referentially transparent — same params in, deep-equal `Spec` out, across repeated calls and call order.
- [ ] Add `src/validator/validateModule.test.ts` running the chute over a seed sweep: every marble exits, zero stalls, and exit speed rises with grade.

**Phase gate (hard):**
- [ ] `pnpm typecheck` (project-wide `tsc -b`)
- [ ] `pnpm vitest related --run <changed files>` (fill from the real diff)

**Review checklist (user, at PR review):**
- [ ] Read `src/modules/types.ts` and confirm the contract is one you want to author ten Modules against.

**On completion:** run the phase gate; update STATUS + checkboxes; stop and ask before
push/PR. Review checklist goes into the PR description.

## Phase 3 — Showcase

Branch: `marble-race-rebuild/phase-3-showcase` (stacked: `gh stack add`)

The React surface over the Phase 2 contract, and the first point at which toy-scale feel can
be judged by eye.

Consumes: `ModuleDefinition`, `Spec`, `ParamSchema`, `SCALE`, `chute`, `validateModule`.
Produces: `<ModuleColliders spec anchor>` (the shared Spec renderer both Showcase and Course
use), `<Showcase />`, `<Feeder>`, `FeedMode`.

Fresh review: not required

- [ ] Add `src/modules/render/ModuleColliders.tsx` rendering a `Spec`'s colliders and visuals through `@react-three/rapier` — the single render path for every Module, per PLAN.md → "The Module contract".
- [ ] Add `src/showcase/Showcase.tsx`: Module sidebar, one `<Canvas><Physics>` stage, and layout per PLAN.md → "Showcase".
- [ ] Add `src/showcase/ParamPanel.tsx` generating controls from the selected Module's `meta.params` schema — never a hand-written panel per Module.
- [ ] Add `src/showcase/Feeder.tsx` releasing marbles in `continuous` / `burst15` / `single` modes.
- [ ] Add `src/showcase/MetricsReadout.tsx` displaying live Dwell, exit speed, Shuffle, and stalls from the Phase 2 metrics, computed over the live stage.
- [ ] Apply the art direction to Modules and marbles per PLAN.md → "Art direction": glossy plastic materials, dark charcoal ground, glass/chrome marbles, bloom via `@react-three/postprocessing`.
- [ ] Point `src/main.tsx` at `<Showcase />`, replacing Phase 1's smoke scene. No router — Spec 4 decides routing.
- [ ] Set the on-screen-displacement threshold in `src/validator/metrics.ts` from what the chute actually reads once watchable, and record the chosen number in a comment.

**Phase gate (hard):**
- [ ] `pnpm typecheck` (project-wide `tsc -b`)
- [ ] `pnpm vitest related --run <changed files>` (fill from the real diff)

**Review checklist (user, at PR review):**
- [ ] **Do the marbles look fast?** Watch the chute at continuous feed. This is the toy-scale question the whole scale decision rests on; a no here means revisiting PLAN.md → "Scale and materials", not tuning onward.
- [ ] Dragging any chute param visibly changes behaviour, and the metrics readout moves with it.
- [ ] All three Feeder modes work.

**On completion:** run the phase gate; update STATUS + checkboxes; stop and ask before
push/PR. Review checklist goes into the PR description.

## Phase 4 — Vortex bowl

Branch: `marble-race-rebuild/phase-4-vortex-bowl` (stacked: `gh stack add`)

The spec's risk, isolated: the one Module that failed before, and the only one needing
revolved geometry rather than boxes.

Consumes: `ModuleDefinition`, `Spec`, `SCALE`, `<ModuleColliders>`, `<Showcase />`,
`validateModule`.
Produces: `vortexBowl: ModuleDefinition<VortexBowlParams>`;
`revolveProfile(profile, segments): ColliderSpec[]` in `src/modules/geometry/revolve.ts`.

Fresh review: not required

- [ ] Add `src/modules/geometry/revolve.ts` turning a 2D profile into a revolved trimesh collider, with a facet-chord margin sized against `SCALE.marbleRadius` so no marble tunnels a facet seam.
- [ ] Add `src/modules/vortexBowl/index.ts` building the mechanism PLAN.md → "The vortex bowl" specifies: tilted basin leaning into the Board, raised rim lip, **tangential rim entry spout**, and one rim exit gap. `role: "shuffle"`.
- [ ] Build the basin floor as a shallow inward spiral ramp with the exit at its inner end — the Dwell bound comes from this geometry, so `step` stays pure and no timer is added.
- [ ] Expose params: basin radius, rim bank angle, board tilt, exit gap width, wall friction, spiral pitch — the six dials that set orbit count.
- [ ] Add `src/modules/vortexBowl/vortexBowl.test.ts` asserting the Validator guardrails from PLAN.md → "Acceptance": orbit count ≥ 3 at nominal entry speed, Dwell p50 in 4–8 s, p99 under 15 s, zero stalls across 200 seeds.
- [ ] Tune the six params in the Showcase against the reference video (`/Users/thomasduong/Pictures/Trivial/Video-79749.mp4`, bowls at 4–12 s, 20–28 s, 44–64 s) until orbit-then-drain reads correctly, then record the settled values as the Module's defaults.

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
