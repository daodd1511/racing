# Raceway Obstacles — Plan

Replace the raceway's single repeated obstacle shape with modules that visibly
change the race. Follows the catalogue in [`OBSTACLE-IDEAS.md`](OBSTACLE-IDEAS.md) and its
diagrams in [`obstacle-ideas.html`](obstacle-ideas.html).

Phase numbering note: `marble-race-picker/EXECUTION.md` already assigns Phase 6
to GitHub Pages deployment, so this work is written as its own spec rather than
as that spec's Phase 6. If it should instead extend the picker spec, it
renumbers to Phase 7 and this file folds into that `EXECUTION.md` unchanged in
substance.

## The problem

The course has nine obstacles and one obstacle *design*. All seven `gate` boxes
and both `deflector`s in `src/track/definition.ts:343-365` are the same
1.9 × 0.7 × 0.4 m cuboid, differing only in position and angle. Their material,
`BUMPER_MATERIAL`, is `{ restitution: 0, friction: 0.04 }` — a dead, frictionless
wall that nudges a marble sideways and does nothing else: no speed change, no
scatter, no queueing. `TrackBoxKind` still declares `"splitter"` and
`"chicane"`; nothing constructs either.

The consequence is that the race is decided almost entirely by the start slot
and the bed's banking, which is both dull to watch and a weaker fairness story
than the physics deserves.

## Product decisions

### What an obstacle is for

Every module earns its place by doing one of three things, and the plan states
which for each:

1. **Shuffle** — destroys correlation between entry order and exit order.
2. **Spread** — stretches or compresses the field so `first` and `last` mode
   both have a visible moment.
3. **Read** — gives the camera something legible at 1080p on a shared screen.

A module that only looks busy is not built.

### Scheduled modules

In build order. Numbers in brackets are catalogue IDs.

1. **Diamond pin field** [2] — *shuffle*. A Plinko board of 45°-rotated posts;
   three or four rows destroy any lane advantage.
2. **Rumble strip** [4] — *read*. Full-width 5 cm bars that shake the pack and
   produce a burst of contact events the existing audio layer already consumes.
3. **Cylinder bumper posts** [7] — *shuffle*. Replaces the diamond pins once
   round colliders exist; deflection varies continuously with impact parameter
   instead of splitting two ways.
4. **Wave section** [8] — *spread*. The bed itself rolls in 0.3 m humps.
5. **Vortex bowl** [9] — *shuffle, read*. An 8 m banked bowl; marbles spiral the
   rim and exit through a drain in an order unrelated to the one they entered
   in. Placed late in the course, before the finish straight, where it is the
   race's decisive moment in `first` mode.
6. **Windmill paddle** [11] — *shuffle, read*. Blades sweep the bed and release
   marbles in batches.
7. **Traffic-light gates** [13] — *spread*. Three barriers on staggered cycles
   split the field into waves; strands stragglers visibly in `last` mode.

With the funnel cut, the bowl is the spec's only queueing module and the pin
field and windmill are the only other shuffles. If the bowl is descoped later,
the spec loses most of its reason to exist — that dependency is deliberate and
worth knowing before Phase A starts.

### Explicitly not scheduled

- **Funnel choke** [1] — cut at the user's direction. It was the plan's other
  queueing module; the bowl now does that job alone.
- **Ice and mud friction patches** [3] — cut at the user's direction. An
  invisible lane advantage reads poorly on camera and is the hardest module to
  defend as fair to a room watching a colleague lose.
- **Lane comb** [5], **staircase** [6], **hanging balls** [10],
  **boost/drag pads** [14], **turntable** [15] — held in the catalogue,
  unscheduled. Boost pads are the designated escape hatch if added obstacles
  push race duration toward the 120 s simulation cap.

### The old obstacles

`gateLayout` and both `deflector` boxes are deleted once the pin field lands —
they occupy the same 0.18–0.76 fraction range and do a strictly weaker version
of the same job. The unused `"splitter"` and `"chicane"` members
of `TrackBoxKind` are either constructed or dropped; no dead literals survive
this spec.

## Technical decisions

These follow from the existing architecture, not from preference.

### Motion must be a pure function of frame index

`RaceRecording.frames` holds marble transforms only, and `createRaceScene`
builds obstacles once from `TrackDefinition` and never moves them. Any moving
part therefore needs

```
obstacleTransformAt(id: ObstacleId, frameIndex: number): { position, rotation }
```

called by `simulateRace` to drive kinematic position-based bodies and by the
render loop to draw them. No wall-clock input, no `Math.random` outside
`createSeededRandom`. The alternative — recording obstacle transforms per frame
— costs 3600 frames of extra payload on a 60 s race and a `PickerStateV1` schema
bump, and is rejected.

### `TrackBox` becomes a shape union

`attachBoxCollider` emits `ColliderDesc.cuboid` exclusively. Round and sloped
parts need

```
shape: { kind: "cuboid" | "cylinder" | "ball"; … }
```

with matching switches in `src/track/colliders.ts` and the mesh factory in
`src/render/createRaceScene.ts`, plus a `TRACK_COLORS` entry per new
`TrackBoxKind`. One refactor unlocks the cylinder posts, the wave section and
the bowl's rim wall.

### The bowl is a spiral centreline, not an exception to the centreline

This is the decision the whole bowl rests on, so it is stated before the
geometry. `measureTrackProgress` projects a marble onto the nearest segment of
the centreline polyline and returns cumulative distance. Feed it an open bowl
and it returns garbage: a marble circling the rim projects onto whichever
segment happens to be nearest, so progress oscillates instead of advancing.
That single number drives the live leaderboard in `createRaceView`, the camera
target in `createCameraTarget`, the final ranking in `createFinalRanking`, and
the containment assertions in `trackStress.test.ts`. Corrupting it corrupts all
four.

Three options were considered. Freezing progress while a marble is inside the
bowl is rejected — it blanks the leaderboard during the most dramatic ten
seconds of the race. A per-marble monotone clamp,
`progress = max(previousProgress, measured)`, is rejected as the primary
mechanism because it makes rim-circling read as total stasis, though it is kept
as a general safety net (below).

The chosen mechanism: **route the centreline itself through the bowl as a
descending spiral of two and a half turns.** The bowl stops being an exception —
it is a section of track whose centreline happens to coil. Progress advances
monotonically along the spiral, the camera's tangent look-ahead sweeps the bowl
correctly for free, and finish detection and ranking need no special case. What
this costs is honesty about what the bowl is: marbles are not free to wander an
open dish, they are in a wide banked chute that coils. That is a fair trade for
not forking the progress model, and on camera the two are hard to tell apart.

`COURSE_WAYPOINTS` gains the spiral turns, so `createPath`'s Catmull-Rom
sampling and `trackHalfWidthAtDistance` need to survive a tight radius:
`samplesPerSpan` rises for those spans, and `maximumBankRadians` (currently
0.08) must lift locally to bank the rim — the wall does the containment work,
not friction. The bowl floor slopes toward the drain so no marble can settle at
the low point.

The monotone clamp still ships, applied globally in `src/track/progress.ts`.
Tight radii make small projection errors read as backward movement anywhere on
the course, not only in the bowl, and a leaderboard that flickers backwards
looks broken whatever the cause.

### The drain must be provably clearable

A bowl that retains one marble does not produce a bad race, it produces a
timeout: `simulateRace` returns `null` at 120 s and `simulateWithRetry` silently
burns a seed and runs the whole thing again. In `last` mode, where the race
waits for the final marble, a sticky drain is fatal rather than cosmetic.

The drain is sized at no less than six marble diameters, the exit chute drops
away from the bowl floor so gravity always has somewhere to take a marble, and
coverage asserts that in a 15-marble run every marble's progress passes the
bowl's exit fraction — not merely that the race finished.

### Materials

Marble restitution is 0 and track friction 0.1: this world does not bounce.
Deflection modules get their own material at restitution 0.12–0.25. Above ~0.35
the Phase 5 launch bug returns, and the ceiling is a hard constraint, not a
tuning range.

### Tunnelling

Marbles have CCD; obstacles do not. A kinematic part sweeping more than
~0.35 m per 16.7 ms step (≈21 m/s) can pass through a marble. Blade tip speed
stays under 3 m/s; gates ramp over ≥ 0.4 s so a closing gate never resolves an
overlap explosively.

### The stress test is amended, never weakened

`src/simulation/trackStress.test.ts` asserts marbles stay within
`trackHalfWidth + 1.2` laterally, never exceed 0.6 m clearance above the bed
between 16 % and 94 % of the course, and that races run 40–120 s with at least
two distinct ranking orders. The wave section breaks the clearance assertion by
design; it gets a per-section allowance keyed to its `fraction` range. The
global threshold does not move and the assertion is not deleted.

## Where the risk actually sits

- **The bowl, on every axis.** It is the largest, latest-placed and
  highest-blast-radius module in the spec, it is now the only queueing module,
  and it is the one that touches progress measurement. Retention stalls a race
  into a timeout; a spiral radius too tight for Catmull-Rom sampling produces a
  faceted mesh marbles catch on; a rim bank too shallow throws them out. Its
  15-marble case in `last` mode is the spec's single most important test.
- **Duration drift.** Every scheduled module removes energy. Seven of them
  could push a race past the 120 s cap, where `simulateWithRetry` starts
  burning seeds. Duration is measured after each module lands, not at the end.
- **Sim/render drift on moving parts.** If the motion function is called with
  different arguments in the two consumers, the replay shows a marble bouncing
  off nothing. Coverage asserts both call sites agree at sampled frames.
- **Overtake coverage becomes tautological.** The existing test proves ranking
  changed *somewhere*. With seven modules that is nearly free and stops meaning
  anything; it should be bound to module boundaries instead.

## Assumptions

- Phase 5 lands first. This spec edits the same three files
  (`definition.ts`, `colliders.ts`, `createRaceScene.ts`) and starts from its
  final state, not from `main`.
- The 15-marble ceiling and 11 m bed width stay as they are.
- No new dependencies.

## Out of scope

- A second mesh source. The bowl is built as a coiled section of the existing
  swept ribbon; if that proves untenable in Phase C, the spec stops and the
  question comes back to the user rather than a revolved-mesh path being
  invented mid-phase.
- Track authoring, editor UI, or per-race obstacle randomisation — the course
  is fixed geometry; only the marbles vary.
- Any change to selection, persistence, audio, or the result dialog.

## Implementation map

Five phases, each independently mergeable and each leaving the race playable.
The ordering principle: the change with the widest blast radius — the bowl and
the progress work under it — lands in the middle, early enough that everything
after it is tuned against final geometry, late enough that the cheap modules
are already proving the pipeline.

### Phase A — Static modules

Delete `gateLayout` and the deflector pair. Add `"pin"` and `"rumble"` to
`TrackBoxKind` with per-kind materials; pin field at fractions 0.20–0.26, the
rumble strip as a 2–3 m approach. Extend `definition.test.ts` for post spacing,
drain-free bed geometry, and that no dead `TrackBoxKind` remains.

### Phase B — Shape union

Turn `TrackBox` into a shape union across `definition.ts`, `colliders.ts` and
`createRaceScene.ts`. Replace the diamond pins with cylinder posts. Add the
wave section by displacing surface vertices *and* the rail centres derived from
the same path samples — the rails do not follow automatically. Amend the
clearance assertion with the wave section's allowance.

### Phase C — Progress hardening and the vortex bowl

The spec's centre of gravity, and the one phase that should be expected to
overrun. Land the monotone progress clamp in `src/track/progress.ts` first,
with coverage, on the *existing* course — so the safety net is proven before
anything depends on it. Then coil `COURSE_WAYPOINTS` into the spiral, raise
`samplesPerSpan` and local `maximumBankRadians` for those spans, slope the
floor to the drain, and build the rim wall from the Phase B shape union.

Coverage: progress is non-decreasing for every marble across a 15-marble run;
every marble clears the bowl's exit fraction in both modes; the leaderboard
order changes across the bowl; containment holds through the coil.

Fresh review: required — this rewrites the measurement that ranking, camera and
finish detection all read.

### Phase D — Deterministic motion

Add `obstacleTransformAt`, kinematic position-based bodies in `simulateRace`,
and the matching render-side call keyed to the replay's current frame index.
Ship the windmill and the traffic-light gates on it, the latter with the
≥ 0.4 s ramp. Coverage: the two call sites agree at sampled frames, and a fixed
seed produces an identical recording across runs.

### Phase E — Tuning and coverage

Retune so 5- and 15-marble runs in both modes land in the 40–120 s window
against the finished geometry. Rebind the overtake assertion to module
boundaries so it stops being tautological. Manual review at 1080p: every module
visually distinct, all marbles inside the rails, leaderboard readable, and the
bowl legible as the race's decisive moment.
