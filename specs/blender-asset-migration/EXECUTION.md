# Blender asset migration — Execution Plan

Spec: [PLAN.md](PLAN.md). Rulebook: `specs/RULEBOOK.md`.
Integration branch: `main`. Branch model: stacked via `gh stack` (default).

Probe: `gh stack view --json` returned exit 6: `main` belongs to multiple stacks.
The command is installed; this is stack-selection ambiguity, not the exit-9 fallback.
At Phase 1 start, initialize the explicitly named new migration branch with
`gh stack init -b main blender-asset-migration/phase-1-asset-export` rather than
asking the CLI to select a stack from trunk. Do not adopt or change old stack branches.
If initialization reports remote unavailability, apply the rulebook's sequential fallback.

## STATUS

- Priority: deferred behind runtime-module-foundations; no migration phase has started.
- Current phase: 1 — pending
- Phase 1 — Extract and export authored assets: pending
- Phase 2 — Load unchanged assets alongside the baseline: pending
- Phase 3 — Tune all Modules and reassemble the Course: pending
- Phase 4 — Tune and save from development views: pending
- Phase 5 — Promote reviewed assets and retire the old path: pending
- Verification debt: none

## Phase 1 — Extract and export authored assets

Branch: `blender-asset-migration/phase-1-asset-export` (stacked: named initialization above)

Establish the source/export contract and preserve the working geometry before changing runtime consumers.

Produces: `AssetId`, `ModuleId`, `AuthoredAsset`, `AuthoredCatalog`, `ModuleTuning`, `ModuleSettings`, `SettingsSnapshot`, `SaveSettingsRequest`; `parseAuthoredAsset(value: unknown): AuthoredAsset`; version-1 `asset.json`, `visuals.glb` and `catalog.json` packages.

Fresh review: required — export publication and failure paths protect existing authored files and valid exports.

- [ ] Preserve optional `Spec.recoveryBoxes` in `src/assets/types.ts`, `src/assets/parseAuthoredAsset.ts` and `scripts/blender/export.py` as explicit position/rotation/half-extents metadata; capture `RegisteredModule.course.defaults` through `courseParamValues`, without adding boxes to existing baseline Specs.
- [ ] Create `src/assets/types.ts` and `src/assets/parseAuthoredAsset.ts` per PLAN.md → "Export and authoring contract" and "Shared tuning contract"; represent markers, collider kinds, physical profiles, authored visual IDs, rest geometry and control bindings as strict plain data.
- [ ] Add `scripts/assets/captureBaseline.ts`, `assets/baseline/` and `src/config/module-settings.json`; extract `courseParamValues`, each current Module's `buildSpec`, `buildStartSpec`, `buildFinishSpec`, marble styles and `raceVisibleSpec` visual adjustments without editing their existing generators.
- [ ] Add `tsx` as a development dependency in `package.json` and update `pnpm-lock.yaml`; provide `assets:capture` as `tsx scripts/assets/captureBaseline.ts` and record capture provenance in `assets/baseline/README.md`.
- [ ] Extend `tsconfig.json` coverage to `scripts/**/*.ts` and `vite.config.ts` so the project-wide typecheck covers the new server/export TypeScript; keep Python authoring code outside TypeScript coverage.
- [ ] Create `scripts/blender/bootstrap.py` and `assets/blender/{chute,pin-field,staircase,whoops,start,finish,marble}.blend`; consume captured geometry, establish named collections/markers/control bindings and preserve all baseline shapes/transforms; refuse existing source-file overwrites.
- [ ] Create `scripts/blender/export.py` and `scripts/assets/exportAssets.ts`; export with the installed Blender CLI into validated immutable package revisions under `src/assets/authored/`, then atomically update `catalog.json`; normal export never regenerates source models.
- [ ] Add `assets:export` as `tsx scripts/assets/exportAssets.ts` in `package.json`; the wrapper locates Blender through an explicit `BLENDER_BIN` override or the installed macOS executable, invokes Python with failure propagation and preserves the old catalog on failure.
- [ ] Add `src/assets/physicsProfiles.ts` with captured physical values; export material keys rather than changing friction/restitution or inferring collisions from visual meshes.
- [ ] Add `scripts/assets/checkAssets.ts` and `assets:check` (`tsx scripts/assets/checkAssets.ts`); check source/exporter/output hashes, referenced files and schema compatibility without Blender; leave production build integration to Phase 5.
- [ ] Add `src/assets/parseAuthoredAsset.test.ts` for invalid collider/marker/control data and `scripts/assets/exportAssets.test.ts` for failed publication preserving the prior catalog; use temporary fixtures, not a Blender subprocess on every related-test run.
- [ ] Run `pnpm assets:capture`, then bootstrap each named source with Blender `--background --python scripts/blender/bootstrap.py -- <captured-input> <blend-output>`, followed by `pnpm assets:export` and `pnpm assets:check`; compare exported baseline colliders/markers with the capture and correct conversion errors without redesigning shapes.
- [ ] Add `docs/blender-authoring.md` with named structure, commands and ownership boundaries; document metadata units, axis conversion and the prohibition on silently overwriting manual edits.

**Phase gate (hard):**

- [ ] `./node_modules/.bin/tsc -b`
- [ ] `./node_modules/.bin/vitest related --run <changed-source-files>` — fill arguments from this phase's real diff, including exporter wrapper changes; use reverse dependencies, not selected test paths.

**Review checklist (user, at PR review):**

- [ ] Open the Blender sources and compare their shapes with the current Course; confirm this is the tuned geometry, including Pin field bumpers and Whoops plates.
- [ ] Change a supported visual detail, export, and verify the saved Blender edit remains intact; break a required marker and confirm export explains the error without replacing valid assets.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 2 — Load unchanged assets alongside the baseline

Branch: `blender-asset-migration/phase-2-asset-runtime` (stacked: `gh stack add`)

Prove the unchanged asset round trip through the existing runtime before introducing geometry tuning.

Consumes: existing `Spec` from `src/modules/types.ts`, `AuthoredAsset`, `AuthoredCatalog`, `ModuleTuning`, `parseAuthoredAsset(value: unknown): AuthoredAsset` and exported version-1 packages.
Produces: `buildAuthoredSpec(asset: AuthoredAsset, tuning: ModuleTuning): Spec` (baseline values only in this phase); `loadAuthoredCatalog(): AuthoredCatalog`; `CourseAssemblyOptions` with `source?: "legacy" | "authored"`; `assembleCourse(seed: number, options?: CourseAssemblyOptions): Course`.

Fresh review: not required

- [ ] Create `src/assets/catalog.ts` and `src/assets/buildAuthoredSpec.ts`; synchronously import validated JSON and resolve physical profiles into a pure `Spec` with the captured collision types, geometry, route and markers; reject non-baseline tuning until Phase 3.
- [ ] Extend `src/modules/types.ts` with authored mesh references/deformation bindings while retaining procedural visuals; create `src/assets/render/AuthoredVisuals.tsx` and `src/assets/render/useAuthoredAssets.ts` to load GLBs through Vite-resolved URLs, reuse immutable assets and dispose only owned replacements.
- [ ] Update `src/modules/render/{ModuleColliders,StaticSpecVisuals}.tsx`, `src/course/transformSpec.ts`, `src/course/render/{CourseScene.tsx,raceVisuals.ts}` and `src/modules/render/visualGeometry.ts` to render authored visuals in the same placement frame without reapplying old appearance replacements to imported meshes.
- [ ] Add `src/assets/authoredRegistry.ts` and the optional source selection in `src/course/assembleCourse.ts`; use authored start/finish Specs and gate pivot while keeping timing, sensor semantics, live Rapier stepping and headless consumers shared.
- [ ] Update marble rendering in `src/course/render/CourseScene.tsx` and `src/showcase/Feeder.tsx` to support the captured marble visual asset, retaining Roster identity, existing stripe designs, spherical colliders and physical radius.
- [ ] Add `src/dev/AssetComparison.tsx` and wire it into `src/dev/coursePreview.tsx` and `src/showcase/Showcase.tsx`; offer explicit old/new comparison at matched baseline settings, retain the legacy default, and keep comparison code development-only.
- [ ] Show loading/error/retry state before starting authored races in `src/dev/coursePreview.tsx`, `src/showcase/Showcase.tsx` and `src/assets/render/useAuthoredAssets.ts`; never silently load legacy assets on authored failure.
- [ ] Add `src/assets/buildAuthoredSpec.test.ts` for baseline geometry/marker preservation and adapt `src/course/transformSpec.test.ts` for authored placement; retain existing physics tests without creating a seed matrix.

**Phase gate (hard):**

- [ ] `./node_modules/.bin/tsc -b`
- [ ] `./node_modules/.bin/vitest related --run <changed-source-files>` — resolve arguments from the actual phase diff.

**Review checklist (user, at PR review):**

- [ ] Inspect old/new Course views at the same seed; run each and inspect gate release, all four Modules, connector transitions and finish. Finish-order equality is not required.
- [ ] Confirm the current style, marble identities and live/headless geometry alignment; report visible differences before parameterized editing obscures their cause.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 3 — Tune all Modules and reassemble the Course

Branch: `blender-asset-migration/phase-3-shared-tuning` (stacked: `gh stack add`)

Build one pure geometry transformation path before exposing editing and persistence in the UI.

Consumes: `buildAuthoredSpec(asset: AuthoredAsset, tuning: ModuleTuning): Spec`, `loadAuthoredCatalog(): AuthoredCatalog`, `ModuleSettings` and `CourseAssemblyOptions`.
Produces: existing `BoardSpec` from `src/course/types.ts`; `parseModuleSettings(value: unknown): ModuleSettings`; `loadSavedModuleSettings(): ModuleSettings`; `validateCourseSettings(settings: ModuleSettings): void`; `CourseAssemblyOptions.settings?: ModuleSettings`; `buildBoard(specs: readonly Spec[]): BoardSpec`.

Fresh review: not required

- [ ] In `src/assets/buildAuthoredSpec.ts`, preserve/deform optional recovery boxes alongside authored geometry and keep `RegisteredModule.course.defaults` as the Course defaults source; reject unsupported deformation rather than changing recovery semantics.
- [ ] Create `src/assets/tuning/{chute,pinField,staircase,whoops}.ts` and extend `src/assets/buildAuthoredSpec.ts` with every agreed control; transform saved rest parts and collider frames together, preserve baseline identity, and use explicit authored repeat/deformation bindings per PLAN.md → "Shared tuning contract".
- [ ] Create `src/assets/settings.ts` with strict parsing, saved defaults and existing ranges extended to include current Course settings; create `src/assets/validateCourseSettings.ts` to reject unusable dimensions/connections through the actual Assembler without running a race simulation.
- [ ] Update `src/course/{assembleCourse,board,courseModules,occupancy}.ts` to derive Board dimensions from configured Specs, preserve seeded inventory ordering and regenerate placement, Cells, connectors, checkpoints and routes for shared settings; eliminate hidden Course-specific parameter overrides for authored assets.
- [ ] Preserve compatibility for existing `BOARD`/`assembleCourse(seed)` consumers while introducing `buildBoard(specs)` and optional settings; ensure settings validation does not recursively call itself through assembly.
- [ ] Update `src/assets/authoredRegistry.ts`, `src/validator/{validateModule,validateCourse}.ts` and `src/showcase/registry.ts` so the same asset-derived Spec and settings reach isolated and complete-Course consumers.
- [ ] Extend `src/assets/buildAuthoredSpec.test.ts` for representative geometry/collider/anchor alignment across all four adapters and adapt `src/course/{assembleCourse,board,occupancy}.test.ts` for changed dimensions and rejected overlaps; do not add statistical acceptance sweeps.

**Phase gate (hard):**

- [ ] `./node_modules/.bin/tsc -b`
- [ ] `./node_modules/.bin/vitest related --run <changed-source-files>` — resolve arguments from the actual phase diff.

**Review checklist (user, at PR review):**

- [ ] Change a representative parameter for each Module through shared settings and inspect the regenerated Course; confirm all placements update and collisions match the visible geometry.
- [ ] Confirm restored baseline values recover the reference shapes and an invalid configuration reports a useful error without corrupting saved settings.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 4 — Tune and save from development views

Branch: `blender-asset-migration/phase-4-course-editor` (stacked: `gh stack add`)

Expose the shared tuning path with deliberate restart and durable local saving.

Consumes: `ModuleSettings`, `SettingsSnapshot`, `SaveSettingsRequest`, `parseModuleSettings(value: unknown): ModuleSettings`, `validateCourseSettings(settings: ModuleSettings): void`, `assembleCourse(seed: number, options?: CourseAssemblyOptions): Course`.
Produces: `readModuleSettings(): Promise<SettingsSnapshot>`; `saveModuleSettings(request: SaveSettingsRequest): Promise<SettingsSnapshot>`; `moduleSettingsPlugin(): Plugin`; development GET/PUT `/__dev/module-settings`.

Fresh review: required — development HTTP write boundary and atomic/conflict-safe persistence protect repository settings.

- [ ] Create `scripts/dev/moduleSettingsPlugin.ts` and register it in `vite.config.ts` for local development only; implement the fixed-path, loopback/same-origin, body-limit, revision-check and atomic-save contract in PLAN.md → "Settings and local save API".
- [ ] Create `src/dev/moduleSettingsClient.ts` and `src/dev/ModuleTuningPanel.tsx`; expose named Module selection, supported sliders, draft/applied/saved states, restart, Save and visible validation/conflict errors.
- [ ] Update `src/dev/coursePreview.tsx` and `src/styles/course.css` to apply drafts only on restart, keep the same seed/Roster/Selection Mode, update every instance and retain the last runnable Course after rejected assembly.
- [ ] Update `src/showcase/{Showcase,ParamPanel}.tsx` to use the same Module controls/configuration and retain Feeder/metrics; do not reintroduce independent hidden Showcase presets or placement-specific overrides.
- [ ] Keep editing and save code under `import.meta.env.DEV`; intercept configuration-file HMR in `scripts/dev/moduleSettingsPlugin.ts` so Save does not mutate or restart an active physics world.
- [ ] Add `scripts/dev/moduleSettingsPlugin.test.ts` for invalid/untrusted requests, concurrent stale revisions and write failures retaining the original file; extend `src/dev/coursePreview.test.tsx` for apply-on-restart/shared placement behavior and `src/dev/buildEntries.test.ts` for production exclusion.
- [ ] Update `docs/blender-authoring.md` with the geometry-edit versus parameter-tune workflows, shared settings behavior, restart semantics and stale-save recovery.

**Phase gate (hard):**

- [ ] `./node_modules/.bin/tsc -b`
- [ ] `./node_modules/.bin/vitest related --run <changed-source-files>` — resolve arguments from the actual phase diff, including Vite middleware consumers.

**Review checklist (user, at PR review):**

- [ ] Tune each Module while viewing the Course, restart the same race, and confirm all matching placements update while the Roster and seed stay fixed.
- [ ] Save, inspect the Git configuration diff, reload and verify persistence; confirm a stale second tab cannot silently replace a newer save.
- [ ] Confirm the deployed/static view offers no write endpoint or active Save controls.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 5 — Promote reviewed assets and retire the old path

Branch: `blender-asset-migration/phase-5-authored-default` (stacked: `gh stack add`)

Complete the switch only after the author has accepted the migrated Modules in the working Course.

Consumes: authored catalog/Specs, shared Module settings, development tuning/save workflow and explicit user approval of all four migrated Modules.

Fresh review: required — build-gate integration and removal of the comparison implementation after the user-approved migration.

- [ ] Before retiring the old path, record the user's Module-by-Module visual/behavioral acceptance in `specs/blender-asset-migration/REVIEW.md`; missing approval prevents retirement, not completion of earlier phases or their manual checklists.
- [ ] Make authored assets the normal path in `src/modules/registry.ts`, `src/course/{assembleCourse,courseModules,startFinish}.ts`, `src/showcase/registry.ts` and `src/course/render/CourseScene.tsx`; preserve game gate motion/sensors, connector generation, Board, selection semantics and history.
- [ ] Adapt `src/modules/{chute,pinField,staircase,whoops}/index.ts` into asset-backed definitions; remove only replaced generator bodies, `src/dev/AssetComparison.tsx` and temporary source toggles; retain helpers still used by connectors or tuning, captured baseline data and applicable tests.
- [ ] Wire `scripts/assets/checkAssets.ts` into `package.json`'s build before TypeScript/Vite; maintain the existing build output and GitHub Pages relative URLs without launching Blender or requiring a new server.
- [ ] Preserve loading/error/retry handling for the production asset path in `src/app/App.tsx` and `src/ui/BroadcastRace.tsx` and `src/assets/render/useAuthoredAssets.ts`; start physics only after required visuals are available and reject missing/corrupt packages without choosing legacy geometry.
- [ ] Reconcile `src/modules/{purity,divergence,route}.test.ts`, `src/modules/{pinField/pinField,staircase/staircase,whoops/whoops}.test.ts`, `src/course/assembleCourse.test.ts` and `src/dev/buildEntries.test.ts` with the asset-backed API; preserve relevant assertions and do not delete or skip tests to bypass failures.
- [ ] Write `docs/adr/0004-blender-authored-module-assets.md`, reconcile `docs/adr/{0002-live-physics-with-headless-validation,0003-cuboid-colliders-under-curved-visuals}.md`, and update `README.md` plus `docs/blender-authoring.md` with final commands and procedural exceptions.
- [ ] Run `pnpm assets:check` and inspect the final Course using the existing development view; correct concrete visible regressions without introducing a benchmark or fairness subsystem.

**Phase gate (hard):**

- [ ] `./node_modules/.bin/tsc -b`
- [ ] `./node_modules/.bin/vitest related --run <changed-source-files>` — resolve arguments from the actual phase diff.

**Review checklist (user, at PR review):**

- [ ] Confirm the familiar Course still looks and behaves as intended, including First/Last results, all Module controls, start/finish and marble identities.
- [ ] Edit a structured Blender asset, export, tune, restart and Save; confirm this complete workflow works and builds use checked-in exports without Blender.
- [ ] Confirm stale assets block a build with a clear export instruction and new Obstacle Modules/realism redesign remain outside this change.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Spec gate (hard — once, before the final phase's PR)

- [ ] `./node_modules/.bin/vitest run` — full existing suite over the accumulated migration; no additional statistical framework.
- [ ] `pnpm build` — includes asset freshness check, TypeScript and Vite; Blender is not required.
