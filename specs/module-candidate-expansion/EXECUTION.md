# Module candidate expansion — Execution Plan

Spec: [PLAN.md](PLAN.md). Rulebook: `specs/RULEBOOK.md`.
Integration branch: `main`. Branch model: stacked via `gh stack` (default).

## STATUS

- Current phase: 1 — in-progress
- Phase 1 — Measurement foundation: in-progress
- Phase 2 — Existing Module remediation: pending
- Phase 3 — Showcase route: pending
- Phase 4 — Candidate Modules: pending
- Verification debt: none

## Phase 1 — Measurement foundation

Branch: `module-candidate-expansion/phase-1-measurement-foundation` (stacked: `gh stack init --base main module-candidate-expansion/phase-1-measurement-foundation`)

This phase owns the shared evidence boundary; no Module, Showcase, or candidate acceptance may rely on corrected measurements until it lands and its calibration checkpoint is approved.

Produces: `buildFeederApronSpec(entry: Anchor): Spec`; `FeedProfile = "burst15" | "continuous" | "single"`; `FeedCohort`; `CrossingObservation`; `RoleEvidence`; `RoleThresholdTable`; `validateModule<P>(module: ModuleDefinition<P>, params: P, options: ValidateModuleOptions): Promise<ModuleValidationReport>`; `ROLE_THRESHOLDS: RoleThresholdTable`.

Fresh review: required — validation and threshold code defines the spec's test-gate infrastructure

- [ ] Add `src/modules/feederApron.ts` with pure `buildFeederApronSpec(entry: Anchor): Spec`; consume it from `src/showcase/Feeder.tsx` and `src/validator/validateModule.ts`, and cover geometry purity plus matching live/headless placement in `src/modules/feederApron.test.ts`.
- [ ] Replace frame-relative exit-only logic in `src/validator/metrics.ts` with `CrossingObservation` entry/exit interpolation, one-diameter hysteresis, tie-aware ranks, `exitTime - entryTime` Dwell, completion validity, and unavailable behavior for undersized valid cohorts; cover crossings, reversals, ties, incomplete cohorts, and Dwell in `src/validator/metrics.test.ts`.
- [ ] Add seeded `FeedProfile` and `FeedCohort` generation for Burst 15, Continuous, and Single in `src/validator/feedProfiles.ts`; reuse `startGridPositions()` for Burst 15, enforce the 0.4-second Continuous cadence and 15-second timeout, and cover reproducibility, same-tick release, cohort sizes, and reset identity in `src/validator/feedProfiles.test.ts`.
- [ ] Add Accel, wide-entry Scatter, constrained-entry Scatter, Shuffle Kendall `tau-b` plus outcome entropy, Sort temporal separation, Dwell `p95`/maximum, and cohort-validity evidence in `src/validator/roleMetrics.ts`; cover preserved order, deterministic reversal, random order, tied crossings, incomplete cohorts, and wide versus constrained inputs in `src/validator/roleMetrics.test.ts`.
- [ ] Add same-seed, anchor/energy/grade/entry-constraint-matched negative controls in `src/validator/moduleControls.ts` for Accel, both Scatter modes, Shuffle, and Sort; verify each control removes only its target mechanism in `src/validator/moduleControls.test.ts`.
- [ ] Rewrite `src/validator/validateModule.ts` and `src/validator/validateModule.test.ts` around `ValidateModuleOptions`, `ModuleValidationReport`, the three feed profiles, paired controls, zero-stall/timeout safety, all legal parameter combinations, 300-run full cohorts, and 60-seed Single identity checks; retain the small deterministic PR subset separately from the full matrix.
- [ ] Add `tsx` as a dev dependency, `scripts/validate-modules.ts`, `"validate:modules": "tsx scripts/validate-modules.ts"` in `package.json`, and focused CLI tests in `src/validator/validateModulesCli.test.ts` for `--matrix pr|full`, recorded seeds/configuration/Rapier version, threshold version, and `--report <path>` output.
- [ ] Rename the Course-only diagnostic in `src/validator/validateCourse.ts`, `src/validator/validateCourse.test.ts`, and `src/validator/courseValidation.test.ts` from `shuffleCoefficient`/`shuffleCoefficients` to `finishOrderInversionCoefficient`/`finishOrderInversionCoefficients`; do not reuse it as Module Shuffle evidence.
- [ ] Run `npm run validate:modules -- --matrix full --report specs/module-candidate-expansion/reports/calibration-v1.md`; record distributions, confidence evidence, exclusions, compute cost, Rapier version, proposed Accel/Scatter/Shuffle/Sort/Dwell/cohort thresholds, the calibrated Break table identity ratio, and before/after evidence for Chute, Pin field, Whoops, and Staircase without changing their Roles or geometry.
- [ ] After explicit user approval of the complete `specs/module-candidate-expansion/reports/calibration-v1.md`, freeze the approved `RoleThresholdTable` as `ROLE_THRESHOLDS` in `src/validator/roleThresholds.ts`, record its version in the report, and stop rather than advancing Phase 2 without that approval.

**Phase gate (hard):**
- [ ] `npm run typecheck`
- [ ] `npx vitest related --run <changed files>`

**Review checklist (user, at PR review):**
- [ ] Confirm the calibration report justifies every proposed threshold, identifies exclusions and compute cost, records Rapier/configuration/seed evidence, and shows existing-Module before/after results.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 2 — Existing Module remediation

Branch: `module-candidate-expansion/phase-2-existing-module-remediation` (stacked: `gh stack add`)

This phase consumes the approved evidence contract and makes the existing active catalogue truthful before the workshop or candidates build on it.

Consumes: `validateModule<P>(module: ModuleDefinition<P>, params: P, options: ValidateModuleOptions): Promise<ModuleValidationReport>`; `ROLE_THRESHOLDS`; `FeedProfile`; `RoleEvidence`.

Fresh review: not required

- [ ] Enumerate every schema-defined legal configuration from `src/modules/chute/index.ts`, validate Chute against paired Accel plus safety/Dwell gates in `src/modules/chute/chute.test.ts`, and narrow or identity-preservingly retune `ChuteParams` only if the corrected evidence requires it.
- [ ] Enumerate every schema-defined legal configuration from `src/modules/pinField/index.ts`, replace inversion-based assertions in `src/modules/pinField/pinField.test.ts` with wide-entry Scatter plus safety/Dwell gates, and narrow or identity-preservingly retune `PinFieldParams` only if the corrected evidence requires it.
- [ ] Enumerate every schema-defined legal configuration from `src/modules/whoops/index.ts`, replace `shuffleCoefficient` assertions in `src/modules/whoops/whoops.test.ts` with Shuffle `tau-b` plus outcome-entropy and safety/Dwell gates, and permit at most one identity-preserving `WhoopsParams`/geometry retune before stopping for the plan's explicit failure choice.
- [ ] Enumerate every schema-defined legal configuration from `src/modules/staircase/index.ts`, validate Staircase against paired Sort temporal separation plus safety/Dwell gates in `src/modules/staircase/staircase.test.ts`, and narrow or identity-preservingly retune `StaircaseParams` only if the corrected evidence requires it.
- [ ] Recheck corrected observation boundaries against `src/modules/purity.test.ts`, `src/modules/route.test.ts`, `src/modules/render/visualGeometry.test.ts`, collider/render parity, clearance, and visible-movement guardrails; keep all four active Roles truthful in `src/modules/registry.ts` and keep a Course-eligible Shuffle implementation in `src/course/courseModules.ts`.
- [ ] Write per-Module results and any schema/geometry changes to `specs/module-candidate-expansion/reports/existing-modules-v1.md`; if a sound measurement still fails after one identity-preserving retune, stop for explicit user choice among reclassification, redesign, replacement, or removal.

**Phase gate (hard):**
- [ ] `npm run typecheck`
- [ ] `npx vitest related --run <changed files>`

**Review checklist (user, at PR review):**
- [ ] If any Module geometry changed, confirm Chute, Pin field, Whoops, and Staircase retain their recognizable mechanism and the report shows every legal configuration passing its claimed Role and safety gates.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 3 — Showcase route

Branch: `module-candidate-expansion/phase-3-showcase-route` (stacked: `gh stack add`)

This phase exposes the approved shared evidence through the direct-access authoring surface without changing the production picker or Course selection.

Consumes: `buildFeederApronSpec(entry: Anchor): Spec`; `FeedProfile`; `FeedCohort`; `RoleEvidence`; `ROLE_THRESHOLDS`; `ALL_MODULES`; `COURSE_MODULES`.
Produces: `ModuleMeta.behaviorSummary: string`; the direct-access `/showcase/` Vite entry consumed by Phase 4 catalogue additions.

Fresh review: not required

- [ ] Extend `ModuleMeta` in `src/modules/types.ts` and all definitions in `src/modules/chute/index.ts`, `src/modules/pinField/index.ts`, `src/modules/whoops/index.ts`, and `src/modules/staircase/index.ts` with `behaviorSummary`; derive Course Eligibility in `src/showcase/registry.ts` from `COURSE_MODULES` rather than duplicating state.
- [ ] Move the Showcase entry from `showcase.html` to `showcase/index.html`, update `vite.config.ts` and `src/dev/buildEntries.test.ts` so `/showcase/` is the built public path, and keep `src/main.tsx` plus picker UI free of Showcase links.
- [ ] Rework `src/showcase/Feeder.tsx` around the shared visible Feeder apron, seeded `FeedProfile` cohorts, kinematic Burst 15 release gate, 30-result Continuous window, 15-second timeout, disabled Burst/Single commands while active, and reset on Module/params/profile/seed changes; cover feed state and resource cleanup in `src/showcase/Feeder.test.tsx`.
- [ ] Rework `src/showcase/Showcase.tsx`, `src/showcase/MetricsReadout.tsx`, and `src/showcase/ParamPanel.tsx` to provide Module/parameter/profile controls, pause/reset, seed copy/replay, Role-specific evidence, Dwell/completion/stall/timeout text, behavior summary, derived Course Eligibility, an indicative-evidence label, and a discoverable link to the authoritative Validator report.
- [ ] Add `src/showcase/Showcase.test.tsx` for active-only catalogue rendering, reset isolation, bounded observations, keyboard labels, text-based status/errors, non-interrupting metric updates, seed replay, and reduced-motion behavior; ensure `src/showcase/Showcase.tsx`, `src/showcase/Feeder.tsx`, and `src/modules/render/ModuleColliders.tsx` dispose replaced Three.js and Rapier resources.
- [ ] Move Showcase presentation from inline declarations into `src/styles/showcase.css`, import it from `src/dev/showcase.tsx`, and add production-build Burst 15 frame-time capture instructions plus same-machine before/after results to `specs/module-candidate-expansion/reports/showcase-performance-v1.md`.

**Phase gate (hard):**
- [ ] `npm run typecheck`
- [ ] `npx vitest related --run <changed files>`

**Review checklist (user, at PR review):**
- [ ] Open `/showcase/` directly and verify every active Module shows its Role, summary, Course Eligibility, indicative Role evidence, Dwell/completion/failure state, and authoritative-report link while the picker exposes no Showcase link.
- [ ] Using only the keyboard, change Module, parameters, profile, and seed; exercise pause/reset and copy/replay; confirm cohort metrics reset and Burst/Single commands remain disabled until completion or timeout.
- [ ] With reduced motion enabled, confirm nonessential camera/interface motion is suppressed without changing physics, status never relies on color, metric updates do not repeatedly announce, and Burst 15 p95 frame time stays within 10% of the recorded baseline.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 4 — Candidate Modules

Branch: `module-candidate-expansion/phase-4-candidate-modules` (stacked: `gh stack add`)

This phase implements and evaluates the three static candidates against the same frozen contracts, then registers only candidates whose complete legal parameter spaces pass.

Consumes: `ModuleDefinition<P>`; `RoleThresholdTable`; `ROLE_THRESHOLDS`; `validateModule<P>(module: ModuleDefinition<P>, params: P, options: ValidateModuleOptions): Promise<ModuleValidationReport>`; `ALL_MODULES`; the `/showcase/` catalogue.
Produces: `crossoverWeave: ModuleDefinition<CrossoverWeaveParams>`; `breakTable: ModuleDefinition<BreakTableParams>`; `anvil: ModuleDefinition<AnvilParams>` for passing candidates only.

Fresh review: not required

- [ ] Add static `crossoverWeave` in `src/modules/crossoverWeave/index.ts` with `crossingLength` and `slowLaneDetour`, one `Footprint.route`, derived bridge clearance/safe grades, asymmetric no-merge over/under geometry, and at most 25 legal combinations; cover purity, collider/render parity, clearance, safety/Dwell, and paired Sort temporal separation in `src/modules/crossoverWeave/crossoverWeave.test.ts`.
- [ ] Add static `breakTable` in `src/modules/breakTable/index.ts` with `panLength` and `grade`, one `Footprint.route`, a derived at-least-`2.5 ×` marble-diameter throat/flares, and at most 25 legal combinations; cover purity, clearance, safety/Dwell, constrained-entry Scatter, and the frozen Single-to-Burst exit-span identity ratio in `src/modules/breakTable/breakTable.test.ts`.
- [ ] Add static `anvil` in `src/modules/anvil/index.ts` with `plateAngle` and `throatLength`, one `Footprint.route`, derived plate placement/length/clearances/runout, no single-file aim point or Burst 15 arch-forming outlet, and at most 25 legal combinations; cover purity, clearance, Continuous/Burst safety/Dwell, and constrained-entry Scatter in `src/modules/anvil/anvil.test.ts`.
- [ ] Run `npm run validate:modules -- --matrix full --module crossover-weave --report specs/module-candidate-expansion/reports/crossover-weave-v1.md`, `npm run validate:modules -- --matrix full --module break-table --report specs/module-candidate-expansion/reports/break-table-v1.md`, and `npm run validate:modules -- --matrix full --module anvil --report specs/module-candidate-expansion/reports/anvil-v1.md`; allow at most two identity-preserving geometry/schema revisions per candidate, record each cycle, and stop for approval before any mechanism-changing redesign.
- [ ] After automated gates and mandatory visual signoff, add each passing candidate export to `ALL_MODULES` in `src/modules/registry.ts` so it appears in `/showcase/`; keep it absent from `COURSE_MODULE_IDS` in `src/course/courseModules.ts`, and remove rejected production implementations while retaining their versioned reports and Git history.

**Phase gate (hard):**
- [ ] `npm run typecheck`
- [ ] `npx vitest related --run <changed files>`

**Review checklist (user, at PR review):**
- [ ] Visually approve each passing candidate in `/showcase/`, including every default mechanism's legibility and the candidate's Role-specific evidence.
- [ ] Confirm every passing candidate appears in the active Showcase catalogue with Course Eligibility false, and every rejected candidate is absent while its outcome report remains.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Spec gate (hard — once, before the final phase's PR)

- [ ] `npm run validate:modules -- --matrix full --verify-thresholds`
- [ ] `npm test`
- [ ] `npm run build`
