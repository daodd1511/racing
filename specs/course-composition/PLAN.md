# Course composition — Plan

Spec 2 of two, following
[`module-candidate-expansion`](../module-candidate-expansion/PLAN.md). Spec 1
establishes truthful Module evidence and leaves every passing candidate
Showcase-only. This spec evaluates Course density, promotes candidates that work
in assembled Courses, and replaces the current fixed obstacle assignments with
a deterministic per-Slot composition policy.

Vocabulary is `CONTEXT.md`'s. Existing Board topology, immutable Course data,
fixed-step physics, tagged seed substreams, connector construction, start and
finish infrastructure, and honest watchdog behavior remain binding.

## Goal

Produce visibly varied Courses without changing the Board, weakening Module
evidence, biasing race outcomes by start position, or making a seed's result
depend on unrelated random draws.

The work has three ordered phases:

1. Composition evaluation
2. Course Eligibility
3. Production composition

Phase 1 ends at a hard checkpoint. Phases 2 and 3 must not proceed until the
user explicitly approves both the production Obstacle Module count policy and
the Course Fairness threshold.

## Current behavior to replace

The Course has 24 Slots on the fixed 8×3 serpentine Board: Start, Finish, 12
Chutes, and 10 Obstacle Modules. The obstacle inventory contains four Scatter,
three Shuffle, and three Sort entries.

Although `selectRoleModules()` and `enumerateRoleSelections()` exist, every
current obstacle Slot receives a `fixedModuleId`, and `randomizedArc()` assigns
only the fixed incumbent IDs from `COURSE_OBSTACLE_INVENTORY`. Adding a Module
to the eligible registry therefore does not make it appear in a live Course.
Spec 2 replaces these overlapping selection paths with one authoritative
composition policy.

## Scope

- Evaluate Courses containing 12, 13, 14, and 15 Obstacle Modules on the
  existing 24-Slot Board by replacing Chute Slots.
- Upgrade the existing Course review harness into a clean direct-access
  `/course` composition lab.
- Calibrate and freeze a Course Fairness regression gate.
- Determine the production obstacle-count policy through explicit user review.
- Evaluate every passing Spec 1 candidate independently for Course Eligibility.
- Generate deterministic Course layouts from the approved density policy,
  Role quotas, and Role-specific Module shuffle bags.
- Validate the resulting composition space with deterministic covering arrays
  and packed physics runs.
- Integrate the approved policy into production race assembly without adding
  picker navigation or controls.

## Out of scope

- Enlarging or reshaping the 24-Slot, 8×3 Board.
- Changing Module geometry, Role definitions, or isolated Module thresholds.
- Adding candidate-specific Course parameter values; Course composition uses
  validated Module defaults only.
- Padding connectors, slowing simulation, or targeting a preferred Course
  duration.
- Persisting a complete Course manifest for exact replay across catalogue or
  application versions.
- Linking `/course` from the picker or exposing development composition controls
  in the production UI.
- Promoting a candidate that failed Spec 1.

## Decisions

### Density changes the obstacle/chute mask, not the Board

- A Course always retains 22 Module Slots between Start and Finish.
- Evaluation densities contain 12–15 Obstacle Modules and therefore 10–7
  Chutes.
- The first Module after Start and the final Module before Finish remain fixed
  Chutes at every density. They stabilize launch acceleration and the finish
  approach.
- The remaining 5–8 Chutes are distributed through the interior. A valid mask
  contains no run of more than two consecutive Obstacle Modules.
- Mask generation is deterministic, uses a dedicated seed substream, and
  rejects an impossible policy with a named error. It never retries with a
  hidden replacement seed.

### Role allocation preserves the current dramatic balance

- Allocate approximately 40% Scatter, 30% Shuffle, and 30% Sort through the
  largest-remainder method.
- When equal remainders compete for a Slot, prefer the Role with more eligible
  Modules so the Course avoids needless repetition. If catalogue depths are
  also equal, use a dedicated deterministic Role-quota substream.
- With the provisional pool expected after Spec 1, evaluation starts with:

| Obstacle Modules | Scatter | Shuffle | Sort |
|---:|---:|---:|---:|
| 12 | 5 | 3 | 4 |
| 13 | 5 | 4 | 4 |
| 14 | 6 | 4 | 4 |
| 15 | 6 | 4 | 5 |

- The Obstacle Module sequence cannot contain the same Role twice in a row,
  even when a Chute separates those Modules physically.
- If the promotion outcome changes the catalogue depth that resolved a quota
  tie, rerun the affected evaluation and return to the checkpoint. Production
  must not silently differ from the composition the user reviewed.

### Role-specific shuffle bags select Modules

- Select a Module independently for each compatible Role Slot; do not choose
  one Module per Role for the entire Course.
- Each Role uses its own deterministic shuffle bag and seed substream.
- Use every eligible Module in a Role once before repeating one. Across bag
  boundaries, prevent an immediate repeat when an alternative exists.
- A Role with one eligible Module may repeat it; eligibility and Role balance
  are not falsified to manufacture variety.
- Course assembly uses validated default parameters only. Seeded parameter
  variation requires a separate plan based on named, prevalidated presets.

### Randomness remains isolated

Derive independent tagged substreams for:

- production density selection, when the approved policy contains multiple
  counts;
- obstacle/chute mask selection;
- Role quota tie resolution;
- Role sequence selection;
- each Role's Module shuffle bag; and
- the existing start-position assignment.

Adding a draw or eligible Module in one substream must not perturb unrelated
subsystems. If several counts are approved, select uniformly from that set;
the policy contains no hidden density weighting.

The same root seed reproduces the same Course only within the same
composition/catalogue version. Existing race history continues to preserve the
recorded outcome, but Spec 2 does not promise exact cross-version Course replay.

### Course Fairness is a Course-level promotion gate

Course Fairness measures how little starting grid position predicts finishing
outcome. It does not require every static Module to be locally symmetric.

Use two complementary statistics across balanced packed races:

- the effect size of starting position on normalized finish rank, with a
  bootstrap confidence interval; and
- maximum starting-position selection-rate disparity for both `first` and
  `last` Selection Modes.

Calibrate the statistics against the current 10-obstacle Course and synthetic
biased controls. The Phase 1 report proposes the maximum allowed regression,
which the user freezes at the density checkpoint.

Final candidate promotion uses 300 paired packed races per candidate and
approved density. For every root seed, compare a candidate Course with an
otherwise identical Course where the candidate is replaced by the incumbent
Module of the same Role; reuse composition, start assignments, and physics
inputs. Pull requests run a deterministic 30-pair subset. The full set runs at
the checkpoint, after fairness-statistic or threshold changes, and for final
promotion.

### Course validation uses deterministic coverage

Independent per-Slot selection makes exhaustive Course enumeration
combinatorial. Replace the old “all shapes” claim with a generated covering
suite whose exact seeds and manifests are recorded.

The structural suite must cover:

- every eligible Module in every compatible Slot and travel direction;
- every ordered neighboring Module pair across every connector and seam type;
- every approved Obstacle Module count;
- every applicable Role-quota tie outcome;
- every valid first/last fixed-Chute and maximum-two-obstacle pacing boundary;
  and
- deterministic deep-equal assembly, connected anchors/routes, legal Cell
  occupancy, fixed Board bounds, unique IDs, and live/headless transform parity.

The physics suite must run every approved density independently; passing the
minimum and maximum does not imply intermediate densities pass. Every packed
race uses 15 marbles and must finish all of them with zero stalls before the
unchanged 120-second simulated watchdog.

Course duration remains reported evidence, not a target. Connectors may not be
padded and Modules may not be retuned to manufacture runtime.

### Performance remains comparable

Measure the current 10-obstacle Course and every evaluated density on the same
machine and production build with 15 marbles.

- p95 frame time may not regress by more than 10% from the current baseline.
- The fixed-step simulation backlog must not grow continuously during a race.
- A density or candidate that fails either condition cannot enter production
  merely because it looks better.

### Course Eligibility is independent per Module

- The `/course` lab may include all passing Spec 1 candidates in an explicitly
  provisional evaluation pool. This does not alter production eligibility.
- Evaluate each candidate independently in every compatible Slot orientation
  and representative neighbor combination, including the approved maximum
  density.
- A candidate must pass structural coverage, packed physics, Course Fairness,
  performance, and Course-level visual review.
- Review each candidate in both travel directions, at maximum approved density,
  and beside every neighboring Role represented by the covering suite.
- A passing candidate becomes Course-eligible and may enter production shuffle
  bags. A failing candidate remains active in Showcase without blocking other
  promotions.
- Spec 2 may constrain composition or revoke Course Eligibility, but it may not
  retune Module geometry. If revocation leaves a required Role empty, stop for
  an explicit redesign decision.

## Phase 1 — Composition evaluation

Turn the existing Course review harness into an instrumented comparison lab
without changing production Course selection.

### Route and controls

- Serve the harness at clean direct-access `/course`; a trailing-slash redirect
  is acceptable, but `course.html` is not the public URL.
- Do not link the route from the picker.
- Provide seed, Selection Mode, and 12–15 Obstacle Module count controls.
- Keep the seed fixed when switching counts. Render one live physics Course at
  a time so comparison instrumentation does not distort frame time.
- Include passing Spec 1 candidates only in the clearly labeled provisional
  evaluation pool.

### Composition evidence

Before a race, show:

- the ordered Slot manifest;
- Module name, Role, provisional or approved Course Eligibility, and behavior
  summary;
- the obstacle/chute mask; and
- the seed and density policy inputs.

After a race, append a session-only comparison-ledger row containing seed,
Obstacle Module count, ordered Module manifest, completion or watchdog result,
simulated duration, Course Fairness indicator, and p95 frame time. Switching
density does not clear the ledger; an explicit reset does.

### Evaluation report and checkpoint

- Run the same three fixed reference seeds at every 12–15 count in `last` mode
  so all marbles traverse the complete Course. Additional seeds diagnose issues
  but do not replace the reference comparison.
- Run automated completion, duration, fairness, and performance suites for all
  four counts using the provisional catalogue.
- Include the current 10-obstacle baseline and synthetic fairness controls.
- Report distributions and confidence evidence, not only point estimates.

Exit condition: the user explicitly approves:

1. one fixed production Obstacle Module count or an approved subset/range; and
2. the maximum permitted Course Fairness regression.

Neither approval may be inferred from structural fit. If multiple counts are
approved, each must later pass the full validation matrix independently.

## Phase 2 — Course Eligibility

Build the deterministic covering suite against the approved density policy,
then evaluate each passing Spec 1 candidate independently.

Required outcomes:

1. The covering generator proves and reports required Slot, direction,
   neighbor, seam, density, and quota coverage.
2. The fast 30-pair fairness subset and full 300-pair promotion suite share the
   same measurement implementation and frozen threshold.
3. Packed physics, performance, and Course-level visual evidence exist for
   every promotion decision.
4. Every passing candidate joins the production eligible registry; every
   failing candidate remains Showcase-only with a recorded reason.
5. Any eligibility result that changes quota-tie catalogue depth returns the
   affected densities to Phase 1 review before production integration.

## Phase 3 — Production composition

Replace fixed obstacle assignments and redundant Role-selection behavior with
one immutable composition pipeline.

Required outcomes:

1. Production assembly applies the approved density policy, fixed boundary
   Chutes, pacing mask, Role quotas, nonrepeating Role sequence, and
   Role-specific Module shuffle bags.
2. Course Eligibility has one authoritative source. Showcase derives and
   displays it; the provisional lab pool cannot leak into production assembly.
3. `assembleCourse(seed)` remains pure, deterministic, and isolated from
   unrelated seed-substream draws.
4. The production picker receives the new Courses without new composition UI
   or route links.
5. The full structural covering suite, per-density packed physics suite,
   fairness regression suite, performance gate, typecheck, tests, and
   production build pass over the accumulated change.

## Acceptance

Spec 2 is complete only when:

1. The user approved the production density policy and Course Fairness
   threshold at the Phase 1 checkpoint.
2. `/course` supports reproducible 12–15 evaluation, composition inspection,
   and comparison evidence without entering the picker navigation.
3. Every promoted Module has independent structural, physics, fairness,
   performance, and visual evidence; failures remain Showcase-only.
4. Every approved density passes its own full validation matrix with all 15
   marbles finishing before 120 simulated seconds and zero stalls.
5. Production uses one deterministic per-Slot composition pipeline with
   isolated seed substreams and validated defaults.
6. Course duration is reported without padding or a preferred-duration gate.

## Documentation outcome

- `CONTEXT.md` records Obstacle Module and Course Fairness as domain language.
- Density policy, quota rules, fairness statistics, thresholds, promotion
  outcomes, and seed-version scope remain in this spec and its reports.
- No ADR is required: the Board and deterministic-seed architecture remain
  unchanged, and these choices are scoped to Course composition.
