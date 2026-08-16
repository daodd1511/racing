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

### The bowl is a real funnel, bridged out of the centreline

**Revised 2026-08-15.** The original plan routed the bowl's geometry itself
through the centreline as a tight descending spiral, specifically to avoid
forking `measureTrackProgress`. Six independently-verified fixes to that
spiral (curvature sampling, banking-ceiling discontinuity, a buffer transition
span, correct-width self-intersection, and more — see
`specs/raceway-obstacles/EXECUTION.md`'s Phase 3 park note) still left it
unable to reliably complete even a solo-marble race once narrowed to a safe,
meaningfully-banked width. That was a structural mismatch, not a tuning
problem: a tight helical chute is not what "marbles spool around a bowl and
drop through a centre hole" looks like, and building it as a ribbon was
fighting the shape the whole time.

The bowl is now built as what it actually is: **an open, cone-shaped funnel
with a drain hole at its centre.** A marble enters at the rim, loses energy to
friction as it spirals inward and downward across the funnel surface, and
eventually drops through the hole into a short chute that reconnects to the
centreline below. A frictional cone has no stable orbit — every orbit loses
energy, so the radius can only shrink — which is why this retains far less
readily than the banked spiral chute it replaces.

**Funnel geometry: revolved triangles in the existing trimesh, not panels.**
`TrackSurface` is already `{ vertices, indices }` handed straight to
`RAPIER.ColliderDesc.trimesh` (`src/track/colliders.ts`) and to
`THREE.Float32BufferAttribute` (`src/render/createRaceScene.ts`). A revolved
cone is therefore *just more triangles appended to those two arrays* — no new
mesh source, no new collider kind, no `TrackBox` entries, and it renders for
free from the same data the physics uses. This supersedes an earlier revision
of this section that specified a ring of tilted cuboid panels: tiling a cone
from flat slabs puts a vertical ridge at every azimuthal seam, so an orbiting
marble crosses a washboard for its entire descent, and the upward-facing seam
lip gets *worse* with more panels, not better. Faceting is part of what killed
the spiral; the revolved surface has no seams to catch on. Ring and radial
segment counts are chosen so the facet chord stays well under the marble
radius (0.35 m).

**Progress while inside the bowl.** `measureTrackProgress`'s nearest-segment
projection cannot be fed an open, non-ribbon surface — a marble circling the
rim projects onto whichever centreline segment happens to be nearest, and
progress oscillates. The centreline gets a single **virtual bridge span**: one
span whose control points are the bowl's entry point (rim, where the ribbon
ends) and exit point (below the drain, where the ribbon resumes), with a
distance cost derived from the funnel's physical diameter and drop rather than
the straight-line waypoint distance. No path samples are generated between
them, and neither the surface-index loop nor the side-rail loop in
`createTrackDefinition` builds ribbon geometry across the pair.

While a marble is inside the bowl's bounding volume, `measureTrackProgress`
returns a value that **advances with descent depth**, not a flat one:

```
f = clamp01((rimY - y) / (rimY - drainY))
progress = bridgeEntryDistance + bridgeSpanLength * f
```

A flat value was considered and rejected. `createFinalRanking` and
`rankAtFrame` both break ties on marble index, so a constant would tie every
marble in the bowl and silently re-sort the leaderboard into roster order —
the same "blank the leaderboard during the most dramatic ten seconds" defect
the original spiral design was chosen to avoid, merely wearing a different
hat. Depth is the right measure because a marble resting on a cone has its
depth rigidly coupled to its radius, so `f` is a genuine read of how close it
is to dropping: the marble ranked first is the one the viewer can see is
about to go through the hole. Residual wobble in `y` is absorbed by the
monotone tracker.

Past the exit point, `measureTrackProgress` resumes normal nearest-segment
projection on the post-bowl ribbon.

**The bounding volume must not swallow unrelated track.** The volume test is
pure geometry with no notion of which part of the course a marble is on, and
the course doubles back in XZ repeatedly while descending (`x` swings −8→+10
four times across `PRE_BOWL_WAYPOINTS`). A ribbon segment passing through the
bowl's footprint would teleport a marble there to the bridge distance, and the
monotone tracker would then make that jump permanent and unrecoverable. A
build-time assertion (not a runtime guard) rejects this: no path sample
outside the bridge span may lie within the bowl volume, with margin.

`createProgressTracker` (`src/track/progress.ts`, shipped in Phase 3 item 1,
already wired into `simulateRace`, `createRaceView`, and `createFinalRanking`)
stays applied globally, not only across the bridge span — tight radii
elsewhere on the course make small projection errors read as backward movement
too, and a leaderboard that flickers backwards looks broken whatever the
cause.

### The drain must be provably clearable

A bowl that retains one marble does not produce a bad race, it produces a
timeout: `simulateRace` returns `null` at 120 s and `simulateWithRetry` silently
burns a seed and runs the whole thing again. In `last` mode, where the race
waits for the final marble, a sticky drain is fatal rather than cosmetic.

**Drain sizing, revised 2026-08-15.** The original six-marble-diameter floor
described a *bed pinch* in the spiral chute — a place marbles arrive at abreast
and can arch across. Carried onto a funnel hole it is actively wrong: six
diameters is 4.2 m, which in an 8 m bowl leaves a 1.9 m ledge, so marbles drop
almost straight through with no spiral at all. That deletes the module's entire
visual premise (marbles circling, then slipping through) to satisfy a rule
about a different failure mode.

A gravity-fed funnel drain feeds marbles in single file down a converging
surface, so it does not arch the way a level pinch does. The drain is sized at
**~3 marble diameters (2.1 m, ≈26 % of an 8 m bowl)**, leaving a real
spiralling ledge. This number is *not* assumed safe on that reasoning: because
it overrides a stated safety floor, Phase C measures it directly with a
worst-case simultaneous-arrival test (15 marbles entering the bowl together)
and treats a jam as a phase-blocking result, not a tuning nit. If it jams, the
diameter goes up until it does not, and the visual loses to the timeout risk.

The exit chute drops away from the bowl floor so gravity always has somewhere
to take a marble, and coverage asserts that in a 15-marble run every marble's
progress passes the bowl's exit fraction — measured past the exit point, not
merely reaching the rim, and not merely that the race finished.

### No section of track may fall below a 0.15 grade

Found the hard way (2026-08-15). The parked spiral WIP appended a finish
straight at 1 m of drop over 15 m — a grade of 0.067 — and marbles visibly
decelerated on the approach to the line, the most-watched ten metres of the
race. The cause is not subtle once measured: track friction is 0.1 and marble
friction 0.12, so at `tan θ = 0.067` the slope sits *below* the friction
coefficient and gravity can no longer overcome contact friction. The marble
stops accelerating and starts coasting down.

For reference, the hand-authored course runs at a mean grade of 0.227 and
never drops below 0.171:

| Section | Grade |
| --- | --- |
| Course mean (wp0→wp10) | 0.227 |
| Shallowest normal span | 0.171 |
| Return loop (parked WIP) | 0.159 |
| Finish straight (parked WIP) | 0.067 |

So: **every span of track keeps a grade of at least 0.15**, and new geometry
should target the course's own 0.17 floor rather than the bare minimum. This
binds the funnel's exit chute in particular — "drops away steeply enough that
gravity always has somewhere to take a marble" is otherwise a vibe, and this
is the number that makes it checkable. Coverage asserts it over every span at
build time, so a shallow section can never ship silently again.

### Obstacles are distributed, not hand-placed

Every obstacle currently sits at a literal distance written into
`createTrackDefinition`, chosen while that module was being proven. The
result, measured on the current course: the three rumble bars (47.9–50.5 m)
and all four pin rows (51.7–67.3 m) occupy a single 20 m cluster on a ~255 m
course, with the wave section at 100–120 m the only other feature. Roughly
three quarters of the race is empty bed. That is not a tuning miss — nothing
ever spread them out, because each was placed where it could be tested.

Obstacle placement becomes a function of course length rather than a table of
constants: `distributeObstacles(courseLength)` returns the placement list,
spacing instances of every scheduled module across the whole course with
per-module minimum separation (so a pin field never lands inside the wave
section, and no module lands on the start apron or the finish straight).
Density rises well beyond today's seven-obstacle cluster.

**The layout stays identical between races for now.** `createTrackDefinition`
gains no seed parameter in this spec. Per-race variation is a genuinely
attractive follow-up and the fairness story survives it — every marble in a
race faces the same course, so varying the course across races biases nobody
— but it is deferred deliberately, because it touches replay: `simulateRace`
and `createRaceView` build the track from `DEFAULT_TRACK_CONFIG`
independently, and a seeded course must reach both from `recording.seed` or
the replay renders marbles against a track they never raced on. Recordings
persisted before such a change would need the generator versioned. Building
the distributor first and making it seed-driven afterwards keeps that risk
out of the phase that does the hard part.

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

- Imported mesh assets or a second collider source for the funnel. Its
  revolved cone is emitted as triangles into the *existing* `TrackSurface`
  trimesh (see "The bowl is a real funnel, bridged out of the centreline") —
  no asset pipeline, no new primitive, no second mesh path to keep in sync.
- Track authoring or editor UI.
- **Per-race obstacle randomisation** — deferred, not rejected (see "Obstacles
  are distributed, not hand-placed"). This spec builds the distributor and
  keeps the layout identical between races; `createTrackDefinition` gains no
  seed parameter here. Making it seed-driven is a follow-up, and the reason it
  is not folded in is replay: a seeded course must reach both `simulateRace`
  and `createRaceView` from `recording.seed`, and persisted recordings need
  the generator versioned.
- Any change to selection, persistence, audio, or the result dialog.

## Implementation map

Six phases, each independently mergeable and each leaving the race playable.
The ordering principle: the change with the widest blast radius — the bowl and
the progress work under it — lands in the middle, early enough that everything
after it is tuned against final geometry, late enough that the cheap modules
are already proving the pipeline.

### Phase A — Static modules

Delete `gateLayout` and the deflector pair. Add `"pin"` and `"rumble"` to
`TrackBoxKind` with per-kind materials; pin field at fractions 0.20–0.26, the
rumble strip as a 2–3 m approach. Extend `definition.test.ts` for post spacing,
drain-free bed geometry, and that no dead `TrackBoxKind` remains.

Carries forward Phase 5's open item (`marble-race-picker/EXECUTION.md`,
amended 2026-08-13, fresh-review correction): enforce a maximum 0.05 m
sphere-to-surface gap in `src/simulation/trackStress.test.ts`. Deferred here
rather than fixed on Phase 5's own branch because the ~0.24–0.29 m clearance
measured against `main` traces to contact with the `gate` boxes this phase
deletes — tuning their contact physics before deletion would be wasted work.
Tighten `trackStress.test.ts:236` from `0.6` to `0.05` once the pin field and
rumble strip replace the gates, and confirm the new obstacles do not reproduce
the launch behavior. If clearance is still above 0.05 after replacement, that
is this phase's obstacle physics to fix, not a test-only change.

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
anything depends on it (done: `createProgressTracker`, shipped and wired
into `simulateRace`/`createRaceView`/`createFinalRanking`).

Then build the funnel itself: a revolved cone emitted into the existing
`TrackSurface` trimesh with a ~3-marble-diameter centre drain, and a virtual
bridge span in the centreline (entry at the rim, exit below the drain) so
`measureTrackProgress` has a defined, depth-advancing answer for any position
inside the bowl's bounding volume, resuming normal projection past the exit.

Coverage: progress is non-decreasing for every marble across a 15-marble run;
every marble clears the bowl's exit fraction in both modes (i.e. actually
falls through the drain, not merely reaches the rim); a 15-marble
simultaneous-arrival test proves the drain does not jam; the build-time
assertion proves no non-bridge path sample lies inside the bowl volume; the
leaderboard order changes across the bowl; containment holds at the rim and
through the exit chute.

Fresh review: required — this rewrites the measurement that ranking, camera and
finish detection all read.

### Phase D — Deterministic motion

Add `obstacleTransformAt`, kinematic position-based bodies in `simulateRace`,
and the matching render-side call keyed to the replay's current frame index.
Ship the windmill and the traffic-light gates on it, the latter with the
≥ 0.4 s ramp. Coverage: the two call sites agree at sampled frames, and a fixed
seed produces an identical recording across runs.

### Phase E — Obstacle distribution

Replace the hand-placed distance constants with `distributeObstacles`, spread
every scheduled module across the full course at a real density, and assert
the 0.15 minimum grade over every span. Lands *before* tuning on purpose: this
moves every obstacle on the course, so tuning against the old layout would be
thrown away.

Coverage: no module overlaps another or the start apron / finish straight;
per-module minimum separation holds; every span's grade clears 0.15.

### Phase F — Tuning and coverage

Retune so 5- and 15-marble runs in both modes land in the 40–120 s window
against the finished geometry — the distributed layout from Phase E, not the
clustered one. Rebind the overtake assertion to module boundaries so it stops
being tautological. Manual review at 1080p: every module visually distinct,
all marbles inside the rails, leaderboard readable, no visible deceleration
anywhere (least of all the run to the line), and the bowl legible as the
race's decisive moment.
