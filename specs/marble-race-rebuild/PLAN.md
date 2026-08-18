# Marble Race Rebuild — Plan

Rebuild the race as composable Modules on a pegboard Board, rendered with React
Three Fiber and stepped live by Rapier, so Courses can be assembled from a
Module catalogue instead of hand-tuned as one spline.

Vocabulary is `CONTEXT.md`'s. Topology and simulation model are fixed by
`docs/adr/0001-pegboard-course-topology.md` and
`docs/adr/0002-live-physics-with-headless-validation.md`.

Reference for the vortex bowl: `/Users/thomasduong/Pictures/Trivial/Video-79749.mp4`
(a physical pegboard marble run; the bowls appear at 4–12 s, 20–28 s, 44–64 s).

## Why the first build failed

Four distinct failures, diagnosed from the code rather than guessed:

**Marbles looked slow.** The Course was built at human scale — `trackHalfWidth:
5.5` (an 11 m channel), `marbleRadius: 0.35` (a 70 cm ball), ~270 m of path.
Absolute speed was fine; apparent speed was not. Framing an 11 m channel pushes
the camera far enough back that angular velocity across the screen collapses.
Apparent speed goes as `v/L ≈ √(g/L)`, so the fix is smaller `L`, not more `g`.

**Marbles appeared to decelerate near the finish with no uphill.** Two
compounding causes: friction 0.10–0.12 on a rolling sphere plus
`linearDamping`/`angularDamping` of 0.02 put the marble at terminal velocity, and
`restitution: 0` on every surface made each contact a pure energy sink. After a
visibly accelerating start, constant velocity reads as slowing down. The finish
stretch also ran at grade 0.2 against a 0.227 course average.

**The bowl did not spin like a tornado.** It was built as a funnel a marble
drops into. A funnel has no orbit-decay mechanism, so it cannot produce the
reference behaviour at any parameter setting — which is why six fixes left it at
0/10 and the archived spec correctly called it "a structural mismatch, not a
fixable parameter". See "The vortex bowl" below for the mechanism it actually is.

**Nothing was modular.** `src/track/definition.ts` held a hardcoded
`COURSE_WAYPOINTS` array with obstacles pinned to fixed arc-distances; inserting
a lead-in required shifting every downstream obstacle by
`LEAD_IN_LENGTH_METERS` to preserve its hand-tuned curvature context. Composition
was not a missing feature, it was structurally precluded.

Content was thin as a consequence: one rumble strip, one pin field, then turns.

## Product decisions

### Duration is an outcome, never a control

A Course is built long and rich enough that a run lands near 60 s. The actual
number is whatever the marbles do; ±5 s or more is expected and correct. There
are no timers, no clamps, no speed scaling, and nothing nudges a stuck marble.

The Validator measures duration at authoring time to accept or reject a Course
*design*. It never touches a live race. The product's claim is that physics picks
the person; the moment the clock becomes a knob, that claim is false.

A face-on Board caps how much path exists, so ~60 s cannot come from travel
alone (20–30 m of path is a 10–15 s race). It comes from a large Board with
80–120 m of switchback path *plus* genuine Dwell. This yields the governing rule
for every Module:

> **Dwell must be paid for with visible motion.** A marble orbiting a bowl for
> 6 s is spectacle. A marble rolling down a flat 18 m stretch at terminal
> velocity for 6 s is the failure being refactored away. Same 6 s; the
> difference is whether the eye sees change.

### The Arc

Every Course has the same dramatic shape and different content. Nine Slots, each
tagged with the Role a Module must have to fill it:

| # | Slot | Role | Fills from |
|---|------|------|-----------|
| 1 | Start | fixed | start grid |
| 2 | Build | `accel` | chute, steep zigzag |
| 3 | Scatter | `scatter` | pin field, rumble strip |
| 4 | Build | `accel` | chute, steep zigzag |
| 5 | Shuffle | `shuffle` | **vortex bowl**, whoops |
| 6 | Sort | `sort` | staircase, friction lanes |
| 7 | Build | `accel` | chute, steep zigzag |
| 8 | Queue | `queue` | funnel choke, windmill |
| 9 | Finish | fixed | photo-finish straight |

No Slot may hold a bare connector, which is what kills the dead-stretch problem
structurally. No two adjacent Slots draw the same Module. Two Modules per Role
gives 32 Course shapes before parameter variation — one per Role would make the
Assembler decorative.

### Camera

The camera follows the **decisive marble**: the leader in `first` mode, the
trailing marble in `last` mode — the marble contesting the result. In `last` mode
this puts the camera behind the pack all race and ends on the sole straggler
still orbiting a bowl after everyone else has finished, which is that mode's best
possible climax and costs nothing.

Framing stays close, because close framing is what keeps apparent speed high;
this is what the reference video does with its cuts. A minimap inset shows the
whole Board and every marble, so an off-screen overtake is still legible.

On a decisive-marble handover: **cut** when the handover distance exceeds one
viewport, smooth-follow with hysteresis below it, so the camera does not hunt
between two marbles trading places. The Board is 2.5D, so the camera pans in x
and y and never rotates.

### Art direction

Toy-real Modules on a dark Board with broadcast chrome.

- **Modules** — glossy injection-moulded plastic in saturated colours, chunky
  and tactile, following the reference video's parts.
- **Board** — dark charcoal pegboard with visible holes.
- **Marbles** — chrome and coloured glass with real speculars, subtle bloom. A
  dark ground is what makes 15 distinguishable hues readable and is the only
  environment where glass speculars register at all.
- **UI** — `ui-variant-1-broadcast.html`'s chrome: live standings, split times,
  the decisive marble flagged, DM Mono numerals, acid `#d8ff42` accents.

### What carries over unchanged

Roster paste and the copy-list button, `first`/`last` Selection Mode semantics,
the Result Label config string, `localStorage` roster and history (schema
unchanged), collision and finish audio muted by default, the result dialog, and
GitHub Pages deployment. These work and are not what is being refactored.

## Technical decisions

### Scale and materials

Toy scale, real gravity. Marbles are ~32 mm (`marbleRadius` ≈ 0.016), the
channel ~50 cm wide — roughly 15 marble diameters, enough for a 15-marble pack
to spread. Gravity stays `-9.81`. This buys ≈ 4.5× apparent speed over the old
scale by `√(g/L)` alone, and lands object sizes in the 0.1–10 m band Rapier's
default solver tolerances are calibrated for.

Restitution rises off zero on every surface and damping goes to zero. Dead
contacts were half of why the old build read as slow.

Boosting gravity at the old scale would have bought the identical 4.5× and
touched no geometry, and was rejected: every Module would then be authored in a
world where no number means anything to the person reading it.

### Stack

| Package | Version | Note |
|---|---|---|
| `react`, `react-dom` | 19.2.8 | |
| `@react-three/fiber` | 9.7.0 | |
| `@react-three/rapier` | 2.2.0 | bundles its own `rapier3d-compat` |
| `@react-three/drei` | 10.7.8 | |
| `@react-three/postprocessing` | 3.0.5 | bloom only |
| `three` | 0.185.1 | already present |
| `@dimforge/rapier3d-compat` | 0.20.0 | direct dep, for the Validator |

Vite 8, TypeScript 6 strict, oxlint, oxfmt, Vitest 4 + happy-dom all stay.

**`@dimforge/rapier3d-compat` must be pinned to the same version
`@react-three/rapier` resolves.** The Validator drives it directly because it
cannot mount React; if the versions drift, the Validator validates different
physics than the runtime plays and lies about it silently. A test asserts the
two resolve equal.

### The Module contract

One directory per Module. Geometry is a pure function; the component renders that
function's output. This is the only shape under which live physics and headless
validation can both be honest — see ADR 0002.

```ts
interface ModuleDefinition<P> {
  readonly id: string;
  readonly role: Role;              // accel | scatter | shuffle | sort | queue
  readonly meta: ModuleMeta;        // display name, params schema for the Showcase
  buildSpec(params: P): Spec;       // pure: colliders + footprint + visuals
  step(spec: Spec, tSeconds: number): KinematicTransform[];  // pure in t
}

interface Spec {
  readonly colliders: readonly ColliderSpec[];
  readonly footprint: Footprint;    // cells occupied, entry anchor, exit anchor
  readonly visuals: readonly VisualSpec[];
}
```

`step` is a pure function of elapsed time and never of accumulated state, which
is what keeps a windmill identical in the Validator and at runtime. Modules
wanting real feedback loops (a spinner that speeds up when struck, a see-saw that
tips under load) are deferred until a specific Module earns the exception; a
stateful `step` costs the Validator its reproducibility.

### The vortex bowl

The mechanism is a **roulette wheel**, not a funnel. Read off the reference
video at 20–28 s:

- A tilted circular basin with a raised rim lip, leaning back into the Board.
- The marble enters **tangentially at the rim** through a side spout. It is never
  dropped into the centre.
- Board tilt gives gravity a component in the basin plane, so the marble
  accelerates down one side of the rim and decelerates up the other. It
  circulates instead of settling.
- One exit gap sits in the rim. The marble leaves not when it reaches the exit
  but when it is slow enough to **fall into** the exit while passing — exactly a
  roulette ball passing pockets too fast to be captured. This is what produces
  the orbit count and the suspense.
- Several marbles orbit at once and collide. That is the Shuffle.

Orbit-decay has unbounded worst-case Dwell Time, which `last` mode makes worse.
The bound comes from **geometry, not a timer**: the basin floor is a shallow
inward spiral ramp, so a marble losing speed necessarily drifts inward and down,
and the exit sits at the inner end. Fast marbles ride the outer rim and orbit
(the spectacle); slow ones sink and drain (the guarantee). `step` stays pure, and
the Validator can measure the worst-case tail rather than trust it.

A timed widening gate was rejected: a visibly opening gap looks like the game
helping, which undercuts the no-rigging claim.

### The Validator

A headless harness (Vitest/node, no React) that builds a raw Rapier world from
`buildSpec` output, steps it at a fixed 1/60, and reports per Module and per
Course: Dwell Time distribution, exit speed, Shuffle coefficient (did the order
change?), stall count, and on-screen displacement per second — the metric that
enforces "Dwell must be paid for with visible motion".

It runs over many seeds. It clears Course *designs*; it never runs during a race.
A runtime watchdog covers the escape case.

### What gets deleted

`src/track/definition.ts`, `src/track/colliders.ts`, `src/track/progress.ts`,
`src/render/cameraTarget.ts`, `src/render/createRaceScene.ts`,
`src/replay/createReplayController.ts`, the `RaceRecording`/`TransformFrame`
recording types, `src/simulation/simulateRace.ts`,
`src/simulation/simulateWithRetry.ts`, and their tests — live physics obsoletes
all of it. Tests for surviving logic (`raceStore`, `random`, `marbleStyles`,
`createResultDialog`) are ported. `trackStress.test.ts` is replaced by Validator
tests.

Also removed: the unreferenced Vite scaffold leftovers `src/counter.ts`,
`src/style.css`, `src/assets/{hero.png,typescript.svg,vite.svg}`; the three
root-level `ui-variant-*.html` design explorations, once their direction is
absorbed into the UI; and `.prettierignore`, which survives from a Prettier this
project does not depend on.

## Where the risk actually sits

**The bowl.** It is the one Module that failed before, the one the user cares
most about, and the only one needing revolved geometry rather than boxes. If the
Module contract cannot express it cleanly, that must surface on Module 1, not
Module 10 — which is why Spec 1 builds it.

**Judging fun.** The last bowl shipped with a green phase gate, 53/53 tests, a
clean fresh review, and a 15-seed scan showing zero bowl stalls, and it was still
not fun. Every objective gate passed and the artefact was wrong, because the
metrics measured what was easy to measure. Hence the acceptance rule below.

**Validator/runtime divergence.** Two Rapier construction paths from one Spec.
Mitigated by `buildSpec` purity, the pinned-version test, and treating any
observed divergence as a defect in the contract rather than a tuning problem.

## Acceptance

**Spec 1 cannot be marked done by an agent.** It ends when the user opens the
Showcase, watches the bowl, and says it looks like the reference video and the
marbles look fast.

The Validator's numbers are **guardrails, not acceptance criteria**: bowl orbit
count ≥ 3 at nominal entry speed, Dwell p50 in 4–8 s and p99 under 15 s, zero
stalls across 200 seeds, and on-screen displacement above threshold on every
frame of every Module. Guardrails green with the user unconvinced is **not
done**, and a green suite grants no authority to close the phase. No exceptions.

## Sequencing

Four specs, risk front-loaded. Spec 1 is the only one specified in detail here,
deliberately: its findings will reshape the rest, and planning specs 2–4 against
a Module contract that does not exist yet would be planning blind.

### Spec 1 — Feel and contract

The smallest build that can answer "do 32 mm marbles look fast?" and "does the
bowl orbit like the video?", answered in the stack that ships so the answer
transfers.

- React + R3F + `@react-three/rapier` scaffold; version-pin test.
- The `ModuleDefinition` / `Spec` / `Footprint` / `Role` contract.
- The Showcase route: Module sidebar, one live canvas, a control panel generated
  from the Module's params schema, the Feeder (continuous / burst 15 / single),
  and a metrics readout.
- The Validator.
- Two Modules: a chute (proves toy-scale feel) and the vortex bowl (proves the
  hard one).
- Gate: the acceptance rule above.

This reverses the session's opening answer — "tune feel on the current vanilla
codebase first" — and honours its intent. The vanilla Course is being deleted, so
tuning it is discarded work, and it cannot answer the question anyway: nothing at
toy scale, no pegboard, and no roulette bowl exists in it. The Showcase *is* the
feel lab, and it is a small enough React surface to not confuse the diagnosis.

### Spec 2 — The Module catalogue

The remaining eight: steep zigzag, pin field, rumble strip, whoops, staircase,
friction lanes, funnel choke, windmill. Seven need box colliders only. Drawn from
`specs/archive/2026-08-18-raceway-obstacles/OBSTACLE-IDEAS.md`, which already
designs fourteen. The windmill is the first Module exercising `step`.

### Spec 3 — Board, Course, race

Board and Cell grid, the Arc and the Assembler, Cell-occupancy overlap checking,
switchback path generation between Slots, the decisive-marble camera and minimap,
the live race loop, the runtime watchdog, and Validator coverage over generated
Courses.

### Spec 4 — Broadcast UI

Port the app shell to React (setup view, roster, persistence, Selection Mode,
audio, result dialog), then the broadcast chrome: standings, split times,
decisive-marble flag, and the finish reveal. Remove the `ui-variant-*.html`
explorations. Confirm the Pages deploy.

## Out of scope

Multiple Boards with cuts between them; free-3D Course routing; a Course editor;
saving or sharing a Course as JSON; stateful `step` Modules; the Tier 3 kinematic
catalogue beyond the windmill (pendulum gate, drop gates, boost pads); any
duration setting; and any server, account, or network transmission — the app
stays client-only.

## Decisions log

Feature-scoped decisions from the grilling session, recorded here rather than as
ADRs. App-wide ones are in `docs/adr/`.

1. Toy scale with real gravity, over boosted gravity at the old scale.
2. Module contract: pure `buildSpec` plus pure-in-time `step`, over a
   component-only contract validated through `@react-three/test-renderer`, and
   over a central descriptor registry.
3. Vortex bowl bounded by a spiral floor, over a timed widening gate, a centre
   drain, or no bound at all.
4. Showcase as a single-Module tuning lab, over a live contact sheet of the whole
   catalogue.
5. Role-based fixed Arc, over a weighted random walk with adjacency rules and
   over hand-authored presets.
6. Duration is an outcome; no `short`/`normal`/`long` setting.
7. Large Board with a decisive-marble follow camera, over a fixed wide shot and
   over a chain of Boards with cuts.
8. Keep the app shell and delete only what live physics obsoletes, over a
   greenfield rewrite and over running both builds side by side.
9. Two Modules per Role (~10 total), over one per Role and over all fourteen.
10. Canonical term is **Module**, not "obstacle" — a chute composes but obstructs
    nothing, and two of five Roles obstruct at all.
11. Spec 1's gate is the user's eyes; Validator metrics are guardrails.
