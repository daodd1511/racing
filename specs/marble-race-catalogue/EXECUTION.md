# Module Catalogue — Execution Plan

Spec: [PLAN.md](PLAN.md), which backfills Spec 2 of
[`../marble-race-rebuild/PLAN.md`](../marble-race-rebuild/PLAN.md). Rulebook:
`specs/RULEBOOK.md`. Integration branch: `main`. Branch model: stacked via
`gh stack` (default) — `gh stack view --json` exits 0 on 2026-08-20 and reports
`trunk: main`, so stacked PRs are enabled for this repo.

The tracked stack still holds Spec 1's four merged branches. Phase 1 runs
`gh stack sync --prune` (needs the user's yes to deleting merged phase
branches) before `gh stack add`, so Spec 2's branches do not stack on top of
merged work.

Dwell guardrails are **per Module**, per PLAN.md → "Decisions made for Spec 2".
Universal on every Module: zero stalls, and `minDisplacementPerSecond` above
`MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND`.

## STATUS

- Current phase: 2 — in-progress (checklist complete, blocked on re-review findings — see below)
- Phase 1 — Shared channel geometry and Module registry: done
- Phase 2 — Steep zigzag, pin field, rumble strip: in-progress, stopped for user
  direction per the rulebook's one-re-review cap. Fresh review found P1/P2
  issues (bounds-accumulation bugs, a schema gap allowing steepZigzag's
  spawn-outside-rails bug live, pinField's rowPitch lacking a clog floor,
  rumbleStrip's unfalsifiable Dwell-budget claim); all fixed and committed
  (`fix(modules): correct bounds, gap, and schema issues from fresh review`).
  The one allowed re-review then found: rumbleStrip's `barHeight` at its own
  schema maximum still stalls 4/100 marbles at default everything-else
  (confirmed independently — the implementer's own stress-test claim to the
  contrary used a stale, wrong `barSpacing` default value and was false);
  the pinField `minDisplacementPerSecond`-degrades-at-extremes gap (accepted
  as scoped-out, matching chute's own default-only guardrail precedent) was
  never recorded in this STATUS block, which the reviewer correctly flagged
  as making "Verification debt: none" below inaccurate; and a code comment
  in rumbleStrip misattributes `MAX_FLOOR_GRADE`'s value to the chute's
  grade schema max (it's actually steepZigzag's). No further autonomous
  fix-and-re-review — surfaced to the user.
- Phase 3 — Staircase, friction lanes: pending
- Phase 4 — Whoops: pending
- Phase 5 — Funnel choke: pending
- Phase 6 — Kinematic `step` application: pending
- Phase 7 — Windmill: pending
- Verification debt:
  - rumbleStrip: `barHeight` at its schema maximum (marbleRadius * 0.5),
    default `barSpacing`/`barCount`/`restitution` otherwise, stalls 4/100
    marbles (20 seeds × 5 marbles) — confirmed directly, not transient (still
    stalled at `maxSimulationSeconds: 30`). Not `[~]`: this is unresolved
    correctness debt, not an environment block.
  - pinField: `minDisplacementPerSecond` drops below
    `MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND` (though stalls stay at zero) at
    several individual schema extremes — measured: `postWidth` at max alone
    ~0.0045; all sliders combined at their extremes ~0.0023. The Module's own
    default-param guardrail test (the actual Phase 2 checklist deliverable)
    passes with margin (~0.027). Left unresolved pending the user's call on
    whether default-param-only coverage is sufficient scope for this phase,
    matching chute's own precedent (its guardrail test also only covers
    default-ish params, not a full schema sweep) — not the vortex bowl's
    debt, which is a wholly missing test, a materially different gap.
  - Inherited and explicitly **not** this spec's to close: the vortex bowl's
    guardrail test and Showcase tuning, deferred by the user to after
    Specs 2–4 — see `../marble-race-rebuild/EXECUTION.md` → STATUS.

## Phase 1 — Shared channel geometry and Module registry

Branch: `marble-race-catalogue/phase-1-channel-geometry` (stacked: `gh stack add`)

Every Module in Phases 2–5 sits in a floor-plus-rails channel that only the
chute currently builds, inline; nothing else starts until that is shared.

Consumes: `SCALE`, `Spec`, `ColliderSpec`, `ColliderMaterial`, `VisualSpec`,
`Footprint`, `Anchor`, `ModuleDefinition`, `ModuleMeta`, `ParamSchema`, `Role`,
`KinematicTransform`, `chute`, `vortexBowl`, `defaultParamValues`,
`ShowcaseEntry`, `toShowcaseEntry`.
Produces: from `src/modules/geometry/channel.ts` —
`interface ChannelSegment { readonly start: Vector3; readonly end: Vector3; readonly width: number }`,
`interface ChannelParts { readonly colliders: readonly ColliderSpec[]; readonly visuals: readonly VisualSpec[]; readonly entry: Anchor; readonly exit: Anchor; readonly bounds: Footprint["bounds"] }`,
and `buildChannel(segments: readonly ChannelSegment[], material: ColliderMaterial, idPrefix: string): ChannelParts`.
From `src/modules/registry.ts` —
`interface RegisteredModule { readonly id: string; readonly role: Role; readonly meta: ModuleMeta; buildSpec(params: ParamValues): Spec; step(spec: Spec, tSeconds: number): readonly KinematicTransform[] }`,
`ALL_MODULES: readonly RegisteredModule[]`, and
`modulesByRole(role: Role): readonly RegisteredModule[]`.
From `src/modules/params.ts` — `defaultParamValues(schema: ParamSchema): ParamValues`
and `type ParamValues`, both moved out of `src/showcase/ParamPanel.tsx`.

Fresh review: not required

- [x] Add `src/modules/geometry/channel.ts`: `buildChannel` emits a floor cuboid plus two rail cuboids per segment, chaining segment to segment, and returns the entry/exit `Anchor`s and local-space `bounds`. Derive each segment's rotation with `setFromUnitVectors` over `start → end`, never a hand-picked axis-angle sign — see the comment at `src/modules/chute/index.ts:88` for the bug that convention exists to prevent. Reuse the chute's `FLOOR_THICKNESS`/`RAIL_THICKNESS`/`RAIL_HEIGHT` values as the module-level defaults.
- [x] Add `src/modules/geometry/channel.test.ts`: a single segment reproduces the chute's current collider set; a two-segment chain leaves no gap at the joint (consecutive floor faces touch within one marble radius); `entry`/`exit` tangents and ups are unit vectors; a zero-length segment is rejected.
- [x] Rewrite `src/modules/chute/index.ts` to build its floor and rails through `buildChannel`, keeping `ChuteParams`, `PARAM_SCHEMA`, defaults, and the emitted `Spec` unchanged. `src/modules/purity.test.ts`'s existing chute cases are the regression check.
- [x] Move `defaultParamValues` and `ParamValues` from `src/showcase/ParamPanel.tsx` into a new `src/modules/params.ts` and re-export from `ParamPanel.tsx` so the Showcase imports do not change. They move because `src/modules/purity.test.ts` and `src/modules/registry.ts` need them and must not import a React component to get them.
- [x] Add `src/modules/registry.ts` with `ALL_MODULES` (`chute`, `vortexBowl`) and `modulesByRole`. This is the "Module registry" `CONTEXT.md` → "Assembler" already names; Spec 3 consumes it. Move `toShowcaseEntry`'s type-erasure here as the registry's own boundary and keep its `P`-unconstrained signature and single `as P` cast — `src/showcase/registry.ts`'s comment records why a `Record`-shaped constraint fails, so do not re-derive it.
- [x] Rewrite `src/showcase/registry.ts` to re-export `MODULES` from `ALL_MODULES`, so adding a Module is one line in `src/modules/registry.ts` and zero lines in the Showcase.
- [x] Generalize `src/modules/purity.test.ts` to iterate `ALL_MODULES`, building params from each Module's own `meta.params` defaults via `defaultParamValues`, and keep the chute's three explicit param cases alongside. Every Module added in a later phase is then covered by construction.

**Phase gate (hard):**
- [x] `pnpm typecheck` (project-wide `tsc -b`) — passed
- [x] `pnpm vitest related --run src/modules/chute/index.ts src/modules/purity.test.ts src/showcase/ParamPanel.tsx src/showcase/registry.ts src/modules/geometry/channel.test.ts src/modules/geometry/channel.ts src/modules/params.ts src/modules/registry.ts` — 13 tests passed

**Review checklist (user, at PR review):**
- [ ] The chute in the Showcase looks and behaves exactly as before the refactor.

**On completion:** run the phase gate; update STATUS + checkboxes; stop and ask
before push/PR. Review checklist goes into the PR description.

## Phase 2 — Steep zigzag, pin field, rumble strip

Branch: `marble-race-catalogue/phase-2-accel-scatter` (stacked: `gh stack add`)

The three Modules that are furniture on a straight channel floor — no new
geometry emitter, so they land together once `buildChannel` exists.

Consumes: `buildChannel`, `ChannelSegment`, `ALL_MODULES`, `SCALE`,
`ModuleDefinition`, `NumberParamField`, `validateModule`,
`MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND`.
Produces: `steepZigzag: ModuleDefinition<SteepZigzagParams>` from
`src/modules/steepZigzag/index.ts`; `pinField: ModuleDefinition<PinFieldParams>`
from `src/modules/pinField/index.ts`; `rumbleStrip:
ModuleDefinition<RumbleStripParams>` from `src/modules/rumbleStrip/index.ts`.

Fresh review: required — upgraded at completion. Each of the three Modules
needed multiple rounds of empirical correction to reach zero stalls
(spawn-width mismatch, joint V-notches, a dead-center post collision, a
too-short run-up before the first obstacle), well past the rulebook's
"same behavior needed two correction attempts" trigger, and rumbleStrip's
actual Dwell budget came in far outside what this phase's own checklist
item originally described (see its amended item).

- [x] Add `src/modules/steepZigzag/index.ts` — `role: "accel"`. A chain of `buildChannel` segments alternating lateral direction down a steep grade, so the marble gains speed while staying inside a compact footprint. `SteepZigzagParams`: `legLength`, `grade`, `legCount`, `turnAngle`, `width`. Each leg's outer rail must be tall enough to contain a marble arriving at the leg's own terminal speed — size it from `v²/(2g)`, the same calculation that fixed the vortex bowl's rim escapes (`../marble-race-rebuild/EXECUTION.md` → Phase 4 → "Result, 2026-08-20"), not by trying values. *(amended 2026-08-20)* `width` defaults to `SCALE.channelWidth` rather than a narrower value — the Validator's multi-marble spawn spread is hardcoded to `SCALE.channelWidth` regardless of a Module's own width, so a narrower default spread marbles outside this Module's own rails. Turning legs also needed a small joint overlap (their rails only touch at a point at each corner, leaving a V-notch a slow marble sticks in) plus a gentler default `turnAngle` and higher restitution/lower friction to reach zero stalls across the guardrail sweep.
- [x] Add `src/modules/pinField/index.ts` — `role: "scatter"`. Staggered rows of cuboid posts rotated 45° about `up` so each presents an edge to oncoming marbles, per OBSTACLE-IDEAS → "Diamond pin field". `PinFieldParams`: `rowCount`, `postSpacing`, `postHeight`, `postWidth`, `rowPitch`. Keep the post gap at or above the ratio OBSTACLE-IDEAS gives (1.2 m against a 0.7 m marble diameter ≈ 1.7 diameters) or a 15-marble pack clogs instead of draining. *(amended 2026-08-20)* The gap is sized against a post's real diagonal reach after the 45° turn (`postWidth * √2`), not its pre-rotation width — sizing off the narrower value packed posts closer than the ratio actually allows. A post landing exactly on the spawn centerline was also a dead-center hit with no left/right bias to deflect off, parking a marble near-motionless for many frames; `postLateralOffsets` now keeps every row off that line by a quarter-spacing.
- [x] Add `src/modules/rumbleStrip/index.ts` — `role: "scatter"`. Low transverse bars spanning the channel width, per OBSTACLE-IDEAS → "Rumble strip". `RumbleStripParams`: `barCount`, `barSpacing`, `barHeight`, `restitution`. Bars are for disruption, not holding: this Module's Dwell budget is well under a second and its guardrail test must say so rather than inheriting the bowl's 4–8 s. *(amended 2026-08-20)* Measured, this Module's Dwell budget is **not** well under a second — p50 ~2.1 s, p99 ~2.8 s across the guardrail sweep, dominated by the run-up length (`LEAD_IN`) a marble needs before the first bar. A short `LEAD_IN` (originally `MARBLE_DIAMETER * 3`, matching the "brief approach section" framing) parked every marble dead-still at the first bar: zero horizontal speed against a raised leading face is a wall, not a bump, regardless of friction. `rumbleStrip.test.ts`'s Dwell range and its comment record the actual measured budget and why "well under a second" describes each bar's own disruption, not this Module's total transit time.
- [x] Register all three in `src/modules/registry.ts`.
- [x] Add `src/modules/steepZigzag/steepZigzag.test.ts`, `src/modules/pinField/pinField.test.ts`, `src/modules/rumbleStrip/rumbleStrip.test.ts`, each driving `validateModule` over at least 20 seeds × 5 marbles and asserting: zero stalls, `minDisplacementPerSecond > MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND`, and that Module's own declared Dwell p50/p99 range. State the chosen range and the reasoning in a comment beside the assertion — a bare number is what made the bowl's guardrails unfalsifiable.
- [x] Assert exit speed rises across the steep zigzag (`accel` earns its Role) and that `shuffleCoefficient` is non-zero across seeds for the pin field and rumble strip (`scatter` earns theirs). A Module whose Role its own metrics cannot demonstrate is mis-tagged, and the Arc places by Role.

**Phase gate (hard):**
- [x] `pnpm typecheck` (project-wide `tsc -b`) — passed
- [x] `pnpm vitest related --run src/modules/pinField/index.ts src/modules/pinField/pinField.test.ts src/modules/registry.ts src/modules/rumbleStrip/index.ts src/modules/rumbleStrip/rumbleStrip.test.ts src/modules/steepZigzag/index.ts src/modules/steepZigzag/steepZigzag.test.ts` — 16 tests passed

**Review checklist (user, at PR review):**
- [ ] Each of the three appears in the Showcase sidebar and its sliders move real geometry.
- [ ] Marbles visibly speed up down the steep zigzag and do not fly over its outer rails.
- [ ] The pin field visibly splits marbles left and right; nothing wedges between posts.
- [ ] The rumble strip visibly shakes the pack without stopping it.

**On completion:** run the phase gate; update STATUS + checkboxes; stop and ask
before push/PR. Review checklist goes into the PR description.

## Phase 3 — Staircase, friction lanes

Branch: `marble-race-catalogue/phase-3-sort` (stacked: `gh stack add`)

Both `sort` Modules: they separate the field by speed rather than scattering it,
and both need per-collider material overrides rather than one shared material.

Consumes: `buildChannel`, `ChannelParts`, `ALL_MODULES`, `ColliderMaterial`,
`SCALE`, `validateModule`.
Produces: `staircase: ModuleDefinition<StaircaseParams>` from
`src/modules/staircase/index.ts`; `frictionLanes:
ModuleDefinition<FrictionLanesParams>` from `src/modules/frictionLanes/index.ts`.

Fresh review: not required

- [ ] Add `src/modules/staircase/index.ts` — `role: "sort"`. Full-width treads with a riser cuboid per step, per OBSTACLE-IDEAS → "Staircase drop", built as chained `buildChannel` segments plus riser colliders rather than by displacing a mesh (there is no bed trimesh to displace any more). `StaircaseParams`: `stepCount`, `tread`, `riseHeight`, `width`. The sort effect is that a fast marble carries over two treads while a slow one drops into every riser — the test asserts that separation, not just that marbles exit.
- [ ] Add `src/modules/frictionLanes/index.ts` — `role: "sort"`. Parallel lanes down one channel, divided by thin longitudinal walls, each lane's floor carrying its own `ColliderMaterial` friction, per OBSTACLE-IDEAS → "Friction patches". `FrictionLanesParams`: `laneCount`, `length`, `slowFriction`, `fastFriction`, `dividerHeight`. Marbles have no agency about which lane they land in; that is the point.
- [ ] Give the two lane materials distinct `VisualMaterial` colors so the fast and slow lanes are visually distinguishable, per `../marble-race-rebuild/PLAN.md` → "Art direction". Color is the only cue here, so state in a comment that lane identity is also readable from lane position, not color alone.
- [ ] Register both in `src/modules/registry.ts`.
- [ ] Add `src/modules/staircase/staircase.test.ts` and `src/modules/frictionLanes/frictionLanes.test.ts`: the universal guardrails, each Module's own Dwell range, and for both a `sort` assertion — exit-time spread across a multi-marble run must widen relative to the spread at entry. A `sort` Module that does not spread the field is not doing its Role.

**Phase gate (hard):**
- [ ] `pnpm typecheck` (project-wide `tsc -b`)
- [ ] `pnpm vitest related --run <changed files>` (fill from the real diff)

**Review checklist (user, at PR review):**
- [ ] Marbles visibly bounce down the staircase rather than sliding over it as a ramp.
- [ ] In friction lanes, a marble on the fast lane visibly pulls away from one on the slow lane in the same shot.

**On completion:** run the phase gate; update STATUS + checkboxes; stop and ask
before push/PR. Review checklist goes into the PR description.

## Phase 4 — Whoops

Branch: `marble-race-catalogue/phase-4-whoops` (stacked: `gh stack add`)

The only Spec 2 Module whose floor curves, so the only one bound by ADR 0003 —
it needs a swept-plate emitter that does not exist, which is why it is alone
here rather than grouped with the other static Modules.

Consumes: `buildChannel`, `PlatePlacement` and `revolveProfileToPlates` from
`src/modules/geometry/revolve.ts` (the type is reused; the function is the
reference implementation of the plate-emitter pattern, not called directly),
`SCALE`, `Shape`, `ColliderSpec`, `VisualSpec`, `validateModule`.
Produces: from `src/modules/geometry/sweep.ts` —
`sweepProfileToPlates(centreline: readonly Vector3[], width: number, marbleRadius: number, idPrefix: string): PlatePlacement[]`
and `sweepProfileToMesh(centreline: readonly Vector3[], width: number): Shape`,
the collider and visual emitters over one shared centreline. And
`whoops: ModuleDefinition<WhoopsParams>` from `src/modules/whoops/index.ts`.

Fresh review: not required

- [ ] Add `src/modules/geometry/sweep.ts`: both emitters consume the same sampled centreline, mirroring how `src/modules/geometry/revolve.ts` pairs `revolveProfile` with `revolveProfileToPlates`. Colliders are cuboid plates; the visual is a trimesh. **Do not emit a concave trimesh collider** — ADR 0003, and see `../marble-race-rebuild/EXECUTION.md` → Phase 4 → "Amended 2026-08-19 — why the construction changed" for the failure that rule came from.
- [ ] Size the plate count from the marble-radius sagitta margin, the same way `revolveProfileToPlates` does, and request the collider segment count at its true floor rather than reusing the visual's — `src/modules/vortexBowl/index.ts`'s `COLLIDER_SEGMENTS_REQUEST` comment records why (693 plates versus 1584).
- [ ] Add `src/modules/geometry/sweep.test.ts`: every plate's rotation is a unit, orthonormal, upward-facing basis; plate count matches one-per-cell against the mesh emitter's own tiling over the identical centreline; every plate's surface stays within the marble-radius sagitta margin of its sampled corners; a fewer-than-two-samples centreline is rejected. These are `revolve.test.ts`'s checks applied to the swept case; read it before writing them.
- [ ] Add `src/modules/whoops/index.ts` — `role: "shuffle"`. Centreline displaced along `up` by `amplitude * sin(2π * distance / wavelength)` over a descending run, per OBSTACLE-IDEAS → "Wave / whoops section". `WhoopsParams`: `amplitude`, `wavelength`, `length`, `grade`, `width`. Rails follow the displaced centreline, not an undisplaced one — OBSTACLE-IDEAS flags that exact mistake.
- [ ] Register in `src/modules/registry.ts`.
- [ ] Add `src/modules/whoops/whoops.test.ts`: universal guardrails, its own Dwell range, and a non-zero `shuffleCoefficient` across seeds. Also assert no marble leaves the channel laterally at the crest of a hump — the compression-and-stretch this Module trades on is one parameter step away from launching marbles out.

**Phase gate (hard):**
- [ ] `pnpm typecheck` (project-wide `tsc -b`)
- [ ] `pnpm vitest related --run <changed files>` (fill from the real diff)

**Review checklist (user, at PR review):**
- [ ] Marbles ride the humps and compress into a bunch, rather than launching off a crest.
- [ ] The visual surface and the collider plates line up — no marble floats above or sinks into the drawn mesh.

**On completion:** run the phase gate; update STATUS + checkboxes; stop and ask
before push/PR. Review checklist goes into the PR description.

## Phase 5 — Funnel choke

Branch: `marble-race-catalogue/phase-5-funnel-choke` (stacked: `gh stack add`)

The static half of the `queue` Role, and the first Module built to bunch the
field rather than move it along — the one place a stall is a design risk rather
than a bug.

Consumes: `buildChannel`, `ChannelParts`, `SCALE`, `ALL_MODULES`,
`validateModule`, `shuffleCoefficient`.
Produces: `funnelChoke: ModuleDefinition<FunnelChokeParams>` from
`src/modules/funnelChoke/index.ts`.

Fresh review: not required

- [ ] Add `src/modules/funnelChoke/index.ts` — `role: "queue"`. Angled walls narrowing the channel to a throat, then flaring back out, per OBSTACLE-IDEAS → "Funnel choke". Build each side as two chained straight walls rather than one long rotated cuboid. `FunnelChokeParams`: `throatWidth`, `approachAngle`, `wallFriction`, `wallRestitution`, `length`. Slippery walls (low friction, low restitution) so marbles slide along rather than stick.
- [ ] Enforce a `throatWidth` schema minimum of at least 6 marble diameters. OBSTACLE-IDEAS gives that floor and then violates it in its own build note (2.2 m throat against a 4.2 m floor); take the ratio, not the number, and record in a comment that the two disagree so nobody re-derives the smaller value from that document.
- [ ] Register in `src/modules/registry.ts`.
- [ ] Add `src/modules/funnelChoke/funnelChoke.test.ts`: universal guardrails at **15 marbles**, not the 5 the other Modules use — a choke only jams under a full pack, so testing it with a light one tests nothing. Assert a non-zero `shuffleCoefficient` and that exit times separate into a queue rather than arriving together.
- [ ] Sweep `throatWidth` across its full schema range at 15 marbles and assert zero stalls at every step. This is the Module most able to strand a race, and PLAN.md → "Duration is an outcome" rules out a timer rescuing it.

**Phase gate (hard):**
- [ ] `pnpm typecheck` (project-wide `tsc -b`)
- [ ] `pnpm vitest related --run <changed files>` (fill from the real diff)

**Review checklist (user, at PR review):**
- [ ] Feed 15 marbles at once: they pile at the mouth and squeeze through one at a time, and the pile always clears.
- [ ] Marbles leave the throat in a visibly different order than they arrived.

**On completion:** run the phase gate; update STATUS + checkboxes; stop and ask
before push/PR. Review checklist goes into the PR description.

## Phase 6 — Kinematic `step` application

Branch: `marble-race-catalogue/phase-6-kinematic-step` (stacked: `gh stack add`)

`ModuleDefinition.step` is declared but nothing calls it — see PLAN.md →
"Decisions made for Spec 2", item 1. Both construction paths gain kinematic
support here, before any Module depends on it, because ADR 0002's honesty claim
is exactly what a second path diverging would break.

Consumes: `ModuleDefinition`, `KinematicTransform`, `ColliderSpec`, `Spec`,
`buildWorld`, `ModuleColliders`, `validateModule`, `chute`, `vortexBowl`.
Produces: `ColliderSpec.kinematic?: boolean` in `src/modules/types.ts`;
`buildWorld` attaching kinematic-position-based bodies for those colliders and
returning their handles as
`interface BuiltWorld { readonly world: RAPIER.World; readonly kinematicBodies: ReadonlyMap<string, RAPIER.RigidBody> }`;
`applyStep(transforms: readonly KinematicTransform[], bodies: ReadonlyMap<string, RAPIER.RigidBody>): void`
from `src/validator/applyStep.ts`; and `<ModuleColliders>` rendering kinematic
colliders under their own `<RigidBody type="kinematicPosition">`, driven by
`useFrame`.

Fresh review: not required

- [ ] Add `readonly kinematic?: boolean` to `ColliderSpec` in `src/modules/types.ts`. Absent or `false` means fixed, so every existing Module and both existing construction paths are unchanged by the addition.
- [ ] Change `src/validator/buildWorld.ts` to return `BuiltWorld` and attach `RigidBodyDesc.kinematicPositionBased()` for kinematic colliders, keyed by `ColliderSpec.id`. Update `src/validator/validateModule.ts`'s call site.
- [ ] Add `src/validator/applyStep.ts` with `applyStep`, and call `module.step(spec, tSeconds)` once per fixed 1/60 step inside `validateModule`'s loop, before `world.step()`. `tSeconds` is the accumulated fixed-step time already computed there — never wall clock, per the contract's "pure in `tSeconds`".
- [ ] Change `src/modules/render/ModuleColliders.tsx` to mount kinematic colliders under a separate `<RigidBody type="kinematicPosition">` per collider id, and drive them from `step` via `useFrame` using an accumulated fixed-step clock, not `delta`. Feeding R3F's variable frame delta here is what would make the renderer and the Validator disagree; the whole phase exists to prevent that.
- [ ] Pass the elapsed clock into `<ModuleColliders>` explicitly rather than reading it inside — the Showcase owns time, and Spec 3's race loop will own it differently.
- [ ] Add `src/validator/applyStep.test.ts`: a synthetic two-collider `Spec` with one kinematic collider whose `step` returns a known rotation at known times; assert the body's transform matches the returned `KinematicTransform` exactly at several `tSeconds`, and that the fixed collider never moves.
- [ ] Add `src/modules/divergence.test.ts` asserting the two paths agree: for a synthetic kinematic Module, the transform `applyStep` writes at `t` and the transform the renderer's own clock computes at the same `t` are identical. This is the test ADR 0002 has needed since the second path existed; a rendering-free extraction of the renderer's clock arithmetic is what makes it testable, so extract it rather than mounting React.
- [ ] Keep `Footprint.cells` empty and change nothing about `buildSpec` purity — `step` is the only thing gaining a consumer here.

**Phase gate (hard):**
- [ ] `pnpm typecheck` (project-wide `tsc -b`)
- [ ] `pnpm vitest related --run <changed files>` (fill from the real diff)

**Review checklist (user, at PR review):**
- [ ] The chute and vortex bowl in the Showcase are unchanged — no Module has moving parts yet, so anything that looks different is a regression.

**On completion:** run the phase gate; update STATUS + checkboxes; stop and ask
before push/PR. Review checklist goes into the PR description.

## Phase 7 — Windmill

Branch: `marble-race-catalogue/phase-7-windmill` (stacked: `gh stack add`)

The catalogue's tenth Module and the first with a non-empty `step`. Last,
because it is the only one that can prove Phase 6's infrastructure works.

Consumes: `buildChannel`, `ColliderSpec.kinematic`, `applyStep`, `BuiltWorld`,
`KinematicTransform`, `ALL_MODULES`, `SCALE`, `validateModule`.
Produces: `windmill: ModuleDefinition<WindmillParams>` from
`src/modules/windmill/index.ts`.

Fresh review: not required

- [ ] Add `src/modules/windmill/index.ts` — `role: "queue"`. A hub with cuboid blades rotating about the channel's tangent axis, low enough that a blade sweeps the floor at any moment, per OBSTACLE-IDEAS → "Windmill paddle wheel". `WindmillParams`: `bladeCount`, `bladeLength`, `bladeThickness`, `angularVelocity`, `hubHeight`. Blade colliders carry `kinematic: true`; the hub and the surrounding channel stay fixed.
- [ ] Implement `step(spec, tSeconds)` returning one `KinematicTransform` per blade at `angle = angularVelocity * tSeconds`, read from the blade's own id. Pure in `tSeconds`: no accumulated state, no `Math.random`, no wall clock — a stateful `step` costs the Validator its reproducibility, per `../marble-race-rebuild/PLAN.md` → "The Module contract".
- [ ] Cap `angularVelocity`'s schema maximum so the blade tip sweeps under one marble diameter per 1/60 step. Marbles have CCD; kinematic colliders do not, so a fast blade passes through a marble instead of hitting it — OBSTACLE-IDEAS' constraint 5, restated at toy scale. Derive the cap from `bladeLength` and `SCALE.marbleRadius` in a comment, do not pick a round number.
- [ ] Register in `src/modules/registry.ts`.
- [ ] Add `src/modules/windmill/windmill.test.ts`: universal guardrails, its own Dwell range, `step` purity (same `tSeconds` gives a deep-equal result on repeat calls and is independent of call order), and a tunnelling assertion — sweep `angularVelocity` to its schema maximum and confirm no marble ever ends up on the far side of a blade it should have been struck by.
- [ ] Confirm `src/modules/purity.test.ts`'s generalized loop covers the windmill's non-empty `step`, and extend it if the existing static-`step` assertion assumes `[]`.

**Phase gate (hard):**
- [ ] `pnpm typecheck` (project-wide `tsc -b`)
- [ ] `pnpm vitest related --run <changed files>` (fill from the real diff)

**Review checklist (user, at PR review):**
- [ ] The blades turn smoothly in the Showcase at a rate that matches the slider.
- [ ] Marbles arrive continuously and leave in batches; a marble catching a blade on the wrong side is swept backwards rather than passing through it.
- [ ] Nothing ever passes through a blade, at any slider position.

**On completion:** run the phase gate; update STATUS + checkboxes; stop and ask
before push/PR. Review checklist goes into the PR description.

## Spec gate (hard — once, before the final phase's PR)

- [ ] `pnpm test` (full local suite)
- [ ] `pnpm build` — Phase 6 changes `ModuleColliders.tsx` and the `Spec` types the entry point pulls in, so the build is breakable here
- [ ] `pnpm lint` and `pnpm format:check` — both run in `.github/workflows/deploy-pages.yml`, and `format:check` is what Spec 1's spec gate caught late
