# Module candidate expansion — Plan

Spec 1 of two. This spec establishes trustworthy Module evidence, remediates the
existing catalogue, rebuilds the Showcase around that evidence, and evaluates
three candidate Modules. Spec 2 will address Course composition after this plan
is complete.

The archived
[`module-candidates-schematics.html`](../archive/2026-08-21-marble-race-catalogue/prototypes/module-candidates-schematics.html)
is an immutable design input, not an implementation contract. This plan
supersedes its Role claims, proposed dimensions, shared-throat recommendation,
and Course-selection assumptions.

Vocabulary is `CONTEXT.md`'s. Existing topology, physics, and Module-contract
ADRs remain binding.

## Goal

Make every registered Module's Role claim measurable and truthful, give those
measurements a direct-access authoring surface at `/showcase`, and add every
candidate that passes the resulting behavioral, safety, and visual gates.

The work has four ordered phases:

1. Measurement foundation
2. Existing Module remediation
3. Showcase route
4. Candidate Modules

Phase 1 ends at a hard checkpoint. Phases 2–4 must not start until the user
explicitly approves the calibration report and complete Role threshold table.

## Scope

- Correct Module entry, exit, Dwell, stall, Accel, Scatter, Shuffle, and Sort
  observations in the shared measurement foundation.
- Add reproducible feed profiles and paired, Role-appropriate negative
  controls.
- Calibrate all four Role contracts before using them as acceptance gates.
- Revalidate and, when necessary, remediate Chute, Pin field, Whoops, and
  Staircase.
- Serve the existing Vite multi-page app's Showcase at `/showcase` for direct
  access only; do not add a link from the picker.
- Evaluate redesigned Crossover weave, Break table, and Anvil candidates.
- Add every passing candidate to the active Showcase catalogue while keeping
  it ineligible for live Course placement.
- Rename the Course-only diagnostic currently presented as Shuffle to
  `finishOrderInversionCoefficient`; it describes a race outcome, not a Module
  Role.

## Out of scope

- Changing the Arc, Slot counts, or Course selection policy.
- Adding candidates to `COURSE_MODULE_IDS` or otherwise making them Course
  eligible.
- Allowing different Modules of the same Role within one Course. Spec 2 owns
  that decision.
- Adding React Router; the project remains a Vite multi-page application.
- Rebuilding rejected candidate implementations into production or preserving
  dead candidate code in the shipping branch.
- Changing the archived prototype.
- Creating a general throat abstraction before two passing implementations
  demonstrate the same stable contract.

## Decisions

### Evidence authority

- The headless Validator is the sole pass/fail authority. Showcase metrics are
  indicative authoring evidence.
- Live and headless physics use a fixed `1/60 s` step. The live path uses an
  accumulator rather than variable render-frame timing.
- Every frozen report records the seed set, feed profile, parameter
  configuration, threshold-table version, and Rapier version.
- Randomized inputs are seeded. Showcase exposes the active seed and supports
  copy and replay.
- Behavior metrics never hide stalls. A stalled or incomplete cohort reports
  the safety failure separately and reports behavior as unavailable when too
  few valid completions remain.

### Crossing observations and Dwell

- Entry rank uses absolute Module entry-plane crossing time. Exit rank uses
  absolute Module exit-plane crossing time. Dwell is `exitTime - entryTime`;
  exit order must never be inferred from Dwell rank.
- Crossing times are linearly interpolated between the two fixed simulation
  steps that bracket the plane.
- Rankings are tie-aware.
- A crossing remains provisional until the marble travels at least one marble
  diameter beyond the plane. If it crosses back before that hysteresis distance,
  discard the provisional crossing and observe the next attempt.
- The visible Feeder apron sits before the entry plane and is excluded from
  Module Dwell. One pure `buildFeederApronSpec()`-style builder supplies the
  same apron geometry to live and headless paths; the apron is infrastructure,
  not a registered Module.

### Feed profiles and cohorts

- **Burst 15** reproduces the production start condition: 15 marbles in the
  existing non-overlapping 5×3 start grid, zero initial velocity, held behind a
  kinematic gate, and released on the same simulation tick. Any permitted
  placement jitter comes from the recorded seed.
- **Continuous** releases one marble every `0.4` simulated seconds. Validator
  runs use 30-marble cohorts. Showcase displays a rolling window of 30 resolved
  observations.
- **Single** releases one marble as an isolated cohort.
- Burst and Single feed commands remain disabled until the current cohort
  completes or times out. The simulated stall timeout is 15 seconds.
- Changing Module, parameters, feed profile, or seed resets the active cohort
  and its metrics. Metrics from different configurations must never mix.

### Paired controls

- Every behavioral comparison pairs the Module and its negative control with
  the same seed and nominal input.
- A control matches the Module's entry and exit anchors, centerline energy
  change, grade, and relevant entry constraint. It removes only the mechanism
  whose effect the gate intends to measure.
- Calibration also includes synthetic statistic fixtures and purpose-built
  controls. Synthetic fixtures cover preserved order, deterministic reversal,
  random order, tied crossings, incomplete cohorts, and wide versus constrained
  lateral inputs.

### Role contracts

Phase 1 determines numeric thresholds. These semantic contracts are fixed:

- **Accel** compares exit speed with its paired control and rejects intentional
  lateral redistribution, gap widening, or order unpredictability.
- **Wide-entry Scatter** applies to Modules such as Pin field. It measures
  tie-aware entry-to-exit lateral decorrelation and exit occupancy against an
  energy-matched wide-entry control.
- **Constrained-entry Scatter** applies to Break table and Anvil. With the same
  constrained nominal input repeated across seeds, it measures exit-lane
  diversity and lateral span against a matched constraining control. Collapsing
  entry variance cannot itself earn Scatter credit.
- **Shuffle** requires both low absolute tie-aware Kendall `tau-b` between entry
  and exit order within runs and high average pairwise outcome entropy across
  repeated seeds. Deterministic preservation and deterministic reversal both
  fail.
- **Sort** measures increased temporal separation at exit against its paired
  control. A deterministic fast/slow path may satisfy Sort but not Shuffle.

Each applicable behavioral gate must pass. Improvement in one statistic cannot
offset failure in another.

### Safety and sample policy

- Safety requires zero stalls and zero 15-second timeouts. Compare `p95` Dwell
  with the approved matched-control threshold and report maximum Dwell for
  diagnosis. Do not label a small-sample maximum as `p99`.
- Full validation targets 300 completed marble-runs per feed profile and
  parameter configuration: 10 seeds × 30 Continuous marbles and 20 seeds × 15
  Burst 15 marbles. Lone-marble identity checks use 60 seeds because they do
  not estimate a tail percentile.
- A small deterministic subset runs on each pull request. The full matrix runs
  during calibration, after a threshold or metric change, after a Rapier
  upgrade, and for final Module acceptance.
- Existing geometry purity, collider/render parity, clearance, and visible
  movement guardrails remain in force and are rechecked against the corrected
  observation boundaries.

### Threshold governance

- All previous numeric behavior thresholds are invalid evidence because they
  were derived from incorrect entry and exit ordering. Treat them as
  provisional inputs only.
- Phase 1 produces a versioned calibration report and one proposed threshold
  table covering Accel, both Scatter modes, Shuffle, Sort, Dwell, and cohort
  validity.
- The user must explicitly approve the report and table before Phase 2 starts.
- After approval, changing a frozen threshold requires the full calibration
  matrix, a versioned replacement report, and fresh explicit approval. A Module
  failure cannot silently lower a gate.

## Phase 1 — Measurement foundation

Build and verify the shared observation layer before judging physics geometry.

Required outcomes:

1. Live and headless paths consume the same pure Feeder apron and observation
   definitions.
2. Crossing interpolation, hysteresis, ties, completion validity, and Dwell
   have focused deterministic tests.
3. Burst 15, Continuous, and Single profiles are reproducible from recorded
   seeds.
4. Role statistics pass their synthetic fixtures before physics calibration
   begins.
5. Each Role has an appropriate same-seed, energy-matched control.
6. The full calibration matrix produces distributions and confidence evidence,
   not only point estimates.
7. The calibration report explains the proposed thresholds, identifies sample
   exclusions, records compute cost and Rapier version, and includes before/after
   results for every existing Module without yet changing its Role or geometry.
8. The Course diagnostic rename prevents it from being confused with Module
   Shuffle.

Exit condition: the user explicitly approves the calibration report and the
complete threshold table. Approval is a hard execution checkpoint, not an
assumption the implementation may infer.

## Phase 2 — Existing Module remediation

Apply the approved gates to the current active catalogue:

| Module | Claimed Role | Required measurement mode |
|---|---|---|
| Chute | Accel | Paired Accel |
| Pin field | Scatter | Wide-entry Scatter |
| Whoops | Shuffle | Shuffle decorrelation and outcome entropy |
| Staircase | Sort | Paired temporal separation |

For each Module:

- Rebaseline Dwell from the valid entry crossing.
- Validate every schema-defined legal configuration and narrow its schema if a
  value cannot safely preserve the claimed Role.
- If it fails, first rule out a metric, control, feeder, or harness defect.
- If the measurement is sound, permit one identity-preserving geometry or
  schema retune and rerun the full matrix.
- If that retune fails, stop for explicit user choice among reclassification,
  mechanism redesign, replacement, or removal.

Whoops currently supplies the only Course-eligible Shuffle implementation. The
phase and Spec 1 remain blocked until a truthful Course-eligible Module fills
that Role; no recorded exception or false label may bypass the gate.

## Phase 3 — Showcase route

Redesign Showcase as an instrumented race workshop rather than a static gallery.

### Routing and catalogue

- Serve a clean `/showcase` direct-access route through the existing Vite
  multi-page setup. A trailing-slash redirect is acceptable, but `showcase.html`
  is not the public URL.
- Do not link Showcase from the picker or other main UI.
- List active registered Modules only. Do not show archived, rejected, or
  partially implemented candidates.
- Show each Module's Role, behavior summary, and Course Eligibility. Add the
  behavior summary to `ModuleMeta`; derive eligibility from the Course registry
  rather than duplicating mutable state.

### Workshop behavior

- Render the visible Feeder apron and target Module while measuring only the
  target's entry-to-exit interval.
- Offer Continuous, Burst 15, and Single profiles, pause/reset, seed copy/replay,
  and Module parameter controls.
- Present Role-specific evidence, Dwell, completion counts, stalls, and timeout
  failures. Label Showcase values as indicative and make the authoritative
  Validator report discoverable.
- Bound all observation history and dispose replaced Three.js and Rapier
  resources.

### Accessibility and performance

- Every selector and control is keyboard operable and has an accessible label.
- State, pass/fail, and errors use text rather than color alone. Frequent metric
  updates do not continuously interrupt assistive technology.
- Respect reduced-motion preferences without changing authoritative physics;
  suppress nonessential camera and interface motion and provide pause/reset.
- Under Burst 15, p95 frame time must not regress by more than 10% from the
  current Showcase on the same machine and production build. Record the before
  and after runs.

## Phase 4 — Candidate Modules

All candidates are static Modules. Each candidate keeps one local centerline in
`Footprint.route`; visual branching does not create multiple Assembler routes.
Safety geometry is derived rather than exposed as extra behavior controls.

| Candidate | Role | Mechanism | Exposed controls |
|---|---|---|---|
| Crossover weave | Sort | An asymmetric two-lane over/under section gives one path a longer delay than the other, followed by a full-width runout. It has no merge. | `crossingLength`, `slowLaneDetour` |
| Break table | Constrained-entry Scatter | An asymmetric converging throat at least `2.5 ×` marble diameter wide admits two-abreast flow into an empty downhill pan; marble-to-marble collisions create the spread. | `panLength`, `grade` |
| Anvil | Constrained-entry Scatter | A constrained pack strikes different positions along one long oblique plate, giving each marble one decisive contact before a wide runout. | `plateAngle`, `throatLength` |

Derived geometry includes Crossover bridge clearance and safe grades, Break
table throat clearance and flares, and Anvil plate length, placement, clearances,
and runout. Anvil's throat must not recreate a single-file aim point or
arch-forming outlet under Burst 15.

### Candidate schemas and gates

- A candidate exposes no more than two behavioral controls. Each control has at
  most five stepped legal values, so two controls produce at most 25 fully
  enumerable combinations.
- Every legal combination must pass the candidate's Role and safety gates. If
  one fails, narrow or remove the setting; do not keep behavior-invalid tuning
  space in Showcase.
- Defaults prioritize visual legibility after the complete legal set passes.
- Break table additionally demonstrates field-size identity: under matched
  inputs, its lone-marble exit span is less than 25% of its Burst 15 exit span.
  The 25% value remains provisional until Phase 1 calibration and is frozen at
  the checkpoint with the other thresholds.
- Anvil must pass Dwell and stall gates under both Continuous and Burst 15. Its
  long oblique plate distributes packed arrivals; Burst 15 receives no safety
  exemption.
- Crossover is judged as Sort. Fixed path-delay reversal cannot earn Shuffle
  credit.
- Manual visual signoff is mandatory for each candidate after automated gates
  pass.

### Tuning and outcomes

- Initial implementation is followed by at most two identity-preserving
  candidate revisions.
- A revision cycle starts when candidate geometry or its control schema changes
  and ends after the full gate matrix and visual review.
- Fixing a defective metric, control, feeder, or harness pauses validation and
  consumes no candidate revision.
- A mechanism-changing redesign requires explicit user approval and resets no
  budget implicitly.
- Every passing candidate joins `ALL_MODULES` and appears in Showcase with
  Course Eligibility false. It does not join `COURSE_MODULE_IDS`.
- A candidate that still fails after its allowed revisions is rejected unless
  the user approves a redesign. Remove its production implementation from the
  shipping branch, but preserve its versioned validation report and outcome in
  this spec's records and Git history.

## Acceptance

Spec 1 is complete only when:

1. The user approved the Phase 1 calibration report and complete threshold
   table before any later-phase acceptance claim.
2. Every active existing Module truthfully passes its Role and safety gates at
   every legal configuration, with the Whoops failure path resolved rather than
   waived.
3. `/showcase` directly exposes every active Module with reproducible,
   role-specific evidence and the agreed accessibility and performance
   behavior.
4. Each candidate has a versioned pass or rejection report, and every passing
   candidate appears in Showcase while remaining Course-ineligible.
5. The user completes manual visual review for each passing candidate.
6. Unit tests, project typecheck, the full Validator matrix, the production
   build, and the repository's spec gate pass on the accumulated change.

## Documentation outcome

- `CONTEXT.md` carries only the resolved ubiquitous language: Course
  Eligibility, the four Role meanings, Dwell Time, Showcase, Feeder, and Burst
  15.
- Feature-scoped thresholds, candidate mechanisms, correction budgets, and
  routing choices remain in this spec and its reports.
- No ADR is required: the new choices are feature-scoped and do not satisfy the
  repository's three-part ADR threshold.
