# Module Catalogue — Plan

Spec 2 of the four in
[`specs/marble-race-rebuild/PLAN.md`](../marble-race-rebuild/PLAN.md). That
document is authoritative for scope, vocabulary, and the Arc; read its
"Spec 2 — The Module catalogue" section, "The Module contract", "Duration is an
outcome", and "Acceptance" before executing anything here. This file records
only what Spec 1's findings settled and what Spec 2 decided on top — the parts
`marble-race-rebuild/PLAN.md` deliberately left open, because "planning specs
2–4 against a Module contract that does not exist yet would be planning blind."

The contract now exists and ships on `main`. This is the backfill.

Vocabulary is `CONTEXT.md`'s. Topology and simulation model stay fixed by
`docs/adr/0001-pegboard-course-topology.md`,
`docs/adr/0002-live-physics-with-headless-validation.md`, and
`docs/adr/0003-cuboid-colliders-under-revolved-visuals.md`.

## Scope

The eight Modules that complete two per Role, alongside Spec 1's chute
(`accel`) and vortex bowl (`shuffle`):

| Role | Spec 1 | Spec 2 adds |
|---|---|---|
| `accel` | chute | steep zigzag |
| `scatter` | — | pin field, rumble strip |
| `shuffle` | vortex bowl | whoops |
| `sort` | — | staircase, friction lanes |
| `queue` | — | funnel choke, windmill |

Design source for seven of them is
[`specs/archive/2026-08-18-raceway-obstacles/OBSTACLE-IDEAS.md`](../archive/2026-08-18-raceway-obstacles/OBSTACLE-IDEAS.md).
Read it for what each Module *does* and what it looks like; ignore its build
instructions wholesale. They target `TrackBox`, `addBarrier`, and a
`fraction`-along-a-centreline placement API, none of which exist any more, and
its `Tier 1/2/3` grouping describes a collider vocabulary this codebase
replaced. The steep zigzag has no entry there; it comes from
`marble-race-rebuild/PLAN.md`'s Arc table.

## What Spec 1 settled that constrains every Module here

1. **`buildSpec` is pure and is the only source of geometry.** Both
   `src/validator/buildWorld.ts` and `src/modules/render/ModuleColliders.tsx`
   consume its output; neither re-derives anything. `src/modules/purity.test.ts`
   enforces it.
2. **Curved surfaces collide as cuboid plates, never as a concave trimesh**
   (ADR 0003). The revolved or swept mesh survives as the `VisualSpec` only.
   This is not a preference — a concave trimesh ejected every marble that
   entered the vortex bowl's rim with speed, across every parameter swept.
   It binds the whoops, the only Spec 2 Module whose floor curves.
3. **Toy scale.** `SCALE` in `src/race/scale.ts`: `marbleRadius` 0.016 m,
   `channelWidth` 0.5 m, real gravity, `defaultRestitution` 0.15,
   `defaultFriction` 0.08, zero damping.
4. **Modules author in their own local frame** — +Y up, +Z direction of travel,
   +X lateral — and leave `Footprint.cells` empty. Placing a Module on the
   Board is the Assembler's job in Spec 3, not any Module's.

### Converting OBSTACLE-IDEAS dimensions

Its numbers assume the deleted 11 m bed: `trackHalfWidth` 5.5 m and
`marbleRadius` 0.35 m. Both shrink by the same factor reaching toy scale
(5.5 → 0.25 and 0.35 → 0.016 are each ≈ 22:1), so its dimensions convert by
dividing by 22 and its *ratios* — post spacing in marble diameters, throat
width in marble diameters, step drop against marble radius — carry over
unchanged. Prefer the ratios. They are what its clog and clearance warnings
were actually about.

## Decisions made for Spec 2

Resolved 2026-08-20 with the user, before phasing.

1. **`ModuleDefinition.step` has never been called.** It is declared in
   `src/modules/types.ts` and implemented as `() => []` by both Spec 1
   Modules, but `<ModuleColliders>` mounts every collider under
   `<RigidBody type="fixed">` and `buildWorld` attaches every collider as
   `RigidBodyDesc.fixed()`. The windmill therefore needs kinematic-body
   support built into *both* paths, plus a test that the two agree — ADR
   0002's honesty claim is exactly the thing at risk when a second
   construction path gains a feature. This is its own phase, placed after the
   seven static Modules and before the windmill.
2. **Dwell Time guardrails are per Module, not universal.**
   `marble-race-rebuild/PLAN.md`'s "Dwell p50 in 4–8 s, p99 under 15 s" was
   written for the vortex bowl and does not describe a rumble strip, whose
   whole job is a fraction of a second of disruption. Each Module declares its
   own expected Dwell range in its own test, chosen from its Role. What stays
   universal is **zero stalls** and **`minDisplacementPerSecond` above
   `MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND`** — the guardrail enforcing "Dwell
   must be paid for with visible motion". Whether the assembled Course lands
   near 60 s is Spec 3's check on the Course, not a sum this spec can enforce
   one Module at a time.
3. **Spec 2's branches use the `marble-race-catalogue` slug**, so they do not
   collide with Spec 1's merged `marble-race-rebuild/phase-1..4`.

## Acceptance

Spec 2 does **not** inherit Spec 1's "the user watches it and says it looks
right" gate, because Spec 1 already answered the question that gate existed to
answer: whether toy scale reads as fast and whether the contract can express a
hard Module. Spec 2's Modules are judged on their guardrails plus the review
checklist in `EXECUTION.md`, which the user walks in the Showcase at PR review.

Two carry-overs stay open and are **not** Spec 2's to close, per
`marble-race-rebuild/EXECUTION.md`'s STATUS: the vortex bowl's guardrail test
and its Showcase tuning, deferred by the user to after Specs 2, 3, and 4.

## Out of scope

Everything `marble-race-rebuild/PLAN.md`'s "Out of scope" lists, plus: the
Board, Cells, the Arc, and the Assembler (Spec 3); stateful `step` Modules; and
the Tier 3 catalogue beyond the windmill — pendulum gate, drop gates, boost
pads, rotating turntable — which stay unbuilt per that document's decision 9,
"two Modules per Role (~10 total)".
