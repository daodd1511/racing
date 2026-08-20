# Obstacle Ideas for the Raceway

Catalogue of obstacle modules that would replace the current gate/deflector set,
which is visually flat (all barriers are the same 0.95 × 0.70 × 0.20 box) and
mechanically weak (`BUMPER_MATERIAL` has restitution 0 and friction 0.04, so a
gate nudges a marble sideways and nothing else).

Course facts these designs assume, from `src/track/definition.ts`:

- Centreline length ≈ 255 m over 13 waypoints, dropping 30 m → −26.5 m in y.
- `trackHalfWidth` 5.5 m (11 m wide bed), `railHeight` 1.35 m, `railThickness`
  0.2 m, `marbleRadius` 0.35 m, up to 15 marbles.
- Placement API today is `addBarrier(kind, fraction, direction, halfWidth,
  lateralOffset, angle)` where `fraction` is a 0–1 position along the centreline.

## Engineering constraints any new obstacle must respect

These are properties of the current architecture, not preferences. Read them
before picking from the list — they decide the cost column.

1. **Replay records marbles only.** `RaceRecording.frames` (`src/race/types.ts`)
   holds marble transforms; `createRaceScene` builds obstacles once from
   `TrackDefinition` and never moves them. Any *moving* obstacle must therefore
   be a pure function of frame index — `obstacleTransformAt(id, frameIndex)` —
   called identically by `simulateRace` (to drive kinematic bodies) and by the
   render loop. The alternative, adding an obstacle-transform channel to the
   recording, costs memory (a 60 s race is 3600 frames) and a storage-schema
   version bump. Prefer the pure function; never seed motion from wall time.
2. **The collider vocabulary is cuboid-only.** `TrackBox` carries
   `halfExtents`, and `attachBoxCollider` emits `ColliderDesc.cuboid`. Anything
   round, sloped or hollow needs `TrackBox` to become a discriminated union on a
   `shape` field, with matching cases in `src/track/colliders.ts` and in the
   mesh factory in `src/render/createRaceScene.ts` (plus a `TRACK_COLORS` entry
   per new `kind`).
3. **This world does not bounce.** Marble restitution is 0
   (`DEFAULT_MARBLE_MATERIAL`), track friction 0.1. Deflection obstacles need
   their own material with restitution around 0.12–0.25. Going above ~0.35
   reintroduces the launch bug that Phase 5 already fixed once.
4. **`src/simulation/trackStress.test.ts` is the fence.** It asserts every
   marble stays within `trackHalfWidth + 1.2` of the centreline, never rises
   more than 0.6 m above the bed surface between 16 % and 94 % of the course,
   and that races run 40–120 s with at least two distinct ranking orders. Ramps,
   drops and jumps break the clearance assertion by design. Amend the assertion
   with a per-section allowance keyed to the module's `fraction` range — do not
   weaken it globally and do not delete it.
5. **Tunnelling.** Marbles use CCD; static obstacles do not. A fast kinematic
   part sweeping more than ~0.35 m per 16.7 ms step (≈21 m/s) can pass through a
   marble. Keep angular rates modest or thicken the part.
6. **Determinism is the product.** No `Math.random` outside
   `createSeededRandom`, no per-frame wall-clock input in the simulation.

---

## Tier 1 — box colliders only, no schema change

Buildable inside today's `addBarrier` shape by adding new `TrackBoxKind`s and
per-kind materials. Highest drama per unit of work.

### 1. Funnel choke — *not scheduled*

**Looks like** two long walls angled inward from both rails, narrowing the 11 m
bed to a ~2.2 m throat over about 8 m, then flaring back out. Cyan like the
gates, with the throat edges emissive so the pinch reads on camera.

**Does** the single best thing a picker race can do: it converts a spread-out
field into a queue. Marbles pile at the mouth, squeeze through in an order
decided by contact, and exit in a genuinely reshuffled sequence. It also burns
speed, which helps hold the 40 s minimum duration.

**Build** two boxes per side chained end-to-end (a straight angled wall reads
better than one long rotated box because the bed banks). Half-extents
`[0.18, railHeight * 0.9, 4.0]`, rotated so the long axis sits at ~18° to the
tangent, `lateralOffset` running from `±5.0` at the mouth to `±1.3` at the
throat. Material: friction 0.08, restitution 0.05 — a slippery wall so marbles
slide along it rather than sticking. Place at `fraction` 0.30 and again at 0.62.
Risk: with 15 marbles a throat under 2 m can jam; keep throat ≥ 6 × marble
diameter and verify with the 15-marble stress case.

### 2. Diamond pin field (Plinko)

**Looks like** 20–30 short posts standing on the bed in a staggered grid,
each a box rotated 45° about the track normal so it presents a diamond edge to
oncoming marbles. Amber, 0.9 m tall, 0.5 m across.

**Does** the classic Galton-board scatter: marbles hitting an edge split left or
right, and a field three or four rows deep destroys any lane advantage. This is
the module that most reliably produces the ranking changes the stress test looks
for.

**Build** a `"pin"` kind. Rows at `fraction` 0.20–0.26, spacing 1.6 m laterally
with alternate rows offset 0.8 m; half-extents `[0.25, 0.45, 0.25]`; rotation is
the existing `quaternionFromBasis(side, up, tangent)` composed with a 45° spin
about `up`. Material: friction 0.06, restitution 0.18. Keep the gap between
posts ≥ 1.2 m so a 15-marble pack drains instead of clogging.

### 3. Friction patches — mud and ice — *not scheduled*

**Looks like** flat panels flush with the bed, one lane wide and 6–10 m long.
Mud is dark brown and matte (`roughness` 0.95); ice is pale blue and glossy
(`clearcoat` 1.0). No geometry above the surface at all.

**Does** creates real lane value with zero collision violence: the ice lane is
fast, the mud lane is slow, and marbles have no agency about which they land in.
Cheap way to make the middle third of the course matter.

**Build** a box of half-extents `[1.6, 0.02, 4.0]` sunk so its top face sits
0.005 m above the bed, positioned with the existing `lateralOffset` mechanism.
Ice: friction 0.01, restitution 0. Mud: friction 0.85, restitution 0. Pair them
side by side at `fraction` 0.42 so the camera sees a marble on ice pull away
from a neighbour in mud in the same shot. Note the bed is a trimesh, so a
perfectly flush panel can z-fight in the renderer — the 0.005 m lift avoids it.

### 4. Rumble strip

**Looks like** eight to twelve low transverse bars spanning the full bed width,
spaced ~1.1 m apart, like a cattle grid. Yellow.

**Does** shakes the pack. Each bar throws marbles a few centimetres, breaking up
clean rolling lines and amplifying tiny differences into visible ones just
before a choke or pin field. Also a good audio moment — it produces a burst of
regular contact events that `createRaceAudio` already consumes.

**Build** boxes with half-extents `[trackHalfWidth, 0.05, 0.12]`, sitting on the
bed, aligned to `side`. Restitution 0.1, friction 0.3. Height is deliberately
below the 0.6 m clearance assertion so no test change is needed. Best used as a
2–3 m approach section, not a standalone module.

### 5. Lane comb with unequal exits

**Looks like** four or five long thin walls running *along* the track for 12 m,
splitting the bed into parallel channels; each channel exits into something
different — one straight to open track, one into a mud patch, one into a tight
right-hand kink.

**Does** a visible fork with visibly different outcomes. Spectators can see
which lane is winning before the marbles get there, which is exactly the kind of
tension the plan asks for ("spectacle is a requirement").

**Build** `"comb"` boxes, half-extents `[0.15, railHeight * 0.7, 6.0]`, laid at
`lateralOffset` −4.4, −2.2, 0, 2.2, 4.4 at `fraction` 0.52. The interesting work
is downstream, not in the comb itself. Keep channel width ≥ 1.5 m.

### 6. Staircase drop

**Looks like** four or five full-width steps, each dropping 0.22 m with a 2.5 m
tread, cut into the descent.

**Does** re-sorts by speed. A fast marble carries over two steps; a slow one
drops into every riser and loses more. Cheap way to punish the tail of the field
and stop the pack finishing as one blob (which makes `last` mode dull).

**Build** this is a bed change, not a barrier: modulate the y of the surface
vertices over a `fraction` window in `createTrackDefinition` before the trimesh
is emitted, and add a full-width riser box per step so the collision edge is
crisp. Keep the drop ≤ 0.25 m to stay under the 0.6 m clearance assertion.

---

## Tier 2 — needs a shape union on `TrackBox`

Add `shape: { kind: "cuboid" | "cylinder" | "ball" | "cone", … }` to `TrackBox`
and switch in `colliders.ts` and `createRaceScene.ts`. One refactor unlocks all
of these.

### 7. Cylinder bumper posts

**Looks like** fat vertical cylinders, 0.4 m radius, 1.0 m tall, teal with an
emissive ring at the base.

**Does** the same scatter as the diamond pins, but a round post deflects by
impact parameter rather than by which flat face you hit, so the outcome varies
continuously instead of binary-splitting. Reads better and is less prone to the
edge-catch stalls flat posts can cause.

**Build** `ColliderDesc.cylinder(halfHeight, radius)` + `THREE.CylinderGeometry`,
oriented along the track normal `up`. Restitution 0.2, friction 0.05. Direct
replacement for module 2 once the union exists.

### 8. Wave / whoops section

**Looks like** the bed itself rolling in three or four sine humps, 0.3 m
amplitude over a 20 m stretch.

**Does** compresses and stretches the field without any barrier at all, and
looks fast on camera because the chase camera pitches over each crest.

**Build** displace the surface vertices along `up` by
`amplitude * sin(2π * (distance − start) / wavelength)` inside the surface loop
in `createTrackDefinition`; rails follow automatically because they are placed
from path samples — but the rails are placed from the *unmodified* path, so the
same displacement has to be applied to the rail centres or they float. Also
recompute `computeVertexNormals` (already done). Amplitude 0.3 m keeps it under
the clearance assertion.

### 9. Vortex bowl

**Looks like** the track opening into a circular bowl 8 m across with banked
walls and a drain on the far side; marbles spiral around the rim before exiting.

**Does** the single biggest shuffle in the course, and the best "hold your
breath" shot in the race — perfect immediately before the finish for `first`
mode. Order in equals nothing; order out is the race.

**Build** a revolved trimesh section appended to the surface mesh, with the
centreline routed in and out. This is the most expensive item in this document
because `createTrackDefinition` currently assumes one ribbon swept along one
spline; a bowl needs a second mesh source and a progress-measurement carve-out
(`measureTrackProgress` projects onto the centreline and will read garbage
inside a bowl). Budget it as its own phase, not as a tweak.

### 10. Pendulum wrecking balls (static hazard variant)

**Looks like** heavy spheres hanging on visible rods from an overhead gantry.

**Does** as *static* obstacles they are just round posts hung above the bed —
still useful, because a hanging ball only strikes the top half of a marble and
sends it skittering. See module 12 for the moving version.

**Build** ball collider at 0.55 m radius with its centre 0.7 m above the bed, so
the sphere's lower cap intersects the marble line. Restitution 0.15.

---

## Tier 3 — needs deterministic motion or sensor logic

Each of these requires either the `obstacleTransformAt(id, frameIndex)` pure
function from constraint 1, or a sensor-collider pass inside the simulation
loop. Both are contained changes to `simulateRace`, but they are new machinery.

### 11. Windmill paddle wheel

**Looks like** a four-blade paddle rotating about the track's tangent axis, low
enough that two blades sweep the bed at any moment.

**Does** meters the field. Marbles arrive continuously and leave in discrete
batches, and a marble catching a blade on the wrong side gets swept backwards.
This is the highest-drama moving part per unit of implementation cost.

**Build** one kinematic position-based body per module, rotation
`angle = ω * frameIndex * fixedTimeStepSeconds` with ω ≈ 1.6 rad/s (blade tip at
1.5 m travels 2.4 m/s — far under the tunnelling limit). Blades are cuboids
`[0.12, 1.5, 0.12]` on a common hub. The renderer calls the same function with
the replay's current frame index, so sim and playback never drift.

### 12. Swinging pendulum gate

**Looks like** a single heavy paddle swinging across the bed like a metronome.

**Does** a timing gate. Because the swing is a pure function of frame index and
the marbles' arrival time is not, the same seed always gives the same result
while adjacent marbles get wildly different treatment.

**Build** `angle = maxAngle * sin(2π * frameIndex * dt / period)`, period ≈ 2.4 s,
maxAngle ≈ 0.9 rad. Same kinematic-body mechanism as module 11.

### 13. Traffic-light drop gates

**Looks like** three full-height barriers across the bed that rise and fall on
staggered cycles, each glowing red when down and green when up.

**Does** splits the field into waves and creates the "will it make it" beat
right before the finish. In `last` mode it is especially good — it strands
stragglers visibly.

**Build** kinematic translation along `up`:
`y = closedY + openHeight * step(phase(frameIndex))`, with a smoothed ramp so a
marble is never teleported through. The gate must not close *onto* a marble
faster than ~5 m/s or Rapier will resolve the overlap explosively; ramp over
0.4 s minimum.

### 14. Boost pads and drag zones

**Looks like** flat glowing chevrons on the bed — orange for boost, violet for
drag. No geometry above the surface.

**Does** the same job as the friction patches, but sharper and controllable in
magnitude rather than depending on contact time.

**Build** sensor colliders (`setSensor(true)`), and each step query
`world.intersectionPairsWith(sensorCollider, …)` and apply
`body.applyImpulse(scale(tangentAt(position), ±impulse), true)`. Deterministic
as long as the impulse depends only on the marble's own state. Cheaper than it
sounds — no new shapes, no motion function — and it is the only mechanism here
that can *speed the race up* if duration becomes a problem.

### 15. Rotating turntable

**Looks like** a flush disc, 6 m across, set into the bed and spinning slowly.

**Does** drags whatever lands on it sideways into a rail or across a lane
divider. Visually calm, mechanically vicious.

**Build** a kinematic cylinder rotating about `up` at ~1.2 rad/s. Friction 0.6
so the surface actually carries marbles. The disc's top face must be flush with
the bed within a millimetre or marbles catch its edge.

---

## Recommended build order

Scheduled in [`PLAN.md`](PLAN.md):

1. **Diamond pin field** (2) and **rumble strip** (4) — biggest change in race
   character for zero architectural cost, and they directly strengthen the
   ranking-changes-over-time assertion the stress test already makes.
2. **Shape union refactor**, then **cylinder posts** (7) replacing the diamond
   pins, and the **wave section** (8).
3. **Progress hardening**, then the **vortex bowl** (9) — the spec's centre of
   gravity, pulled in from its own phase at the user's direction.
4. **Motion function** (constraint 1), then **windmill** (11) and
   **traffic-light gates** (13).
5. **Tuning** against the finished geometry.

Cut: the **funnel choke** (1) and the **friction patches** (3), both at the
user's direction. Boost pads (14) are the escape hatch if the added obstacles
push race duration past the 120 s simulation cap.

## What to delete

The current `gateLayout` — seven identical 1.9 m boxes at fixed fractions — and
the pair of `deflector` boxes at 0.92 should go once module 2 lands. They occupy
the same fractions (0.18–0.76) and add nothing the pin field does not do better. `TrackBoxKind` still declares `"splitter"` and `"chicane"`,
which nothing constructs; either build them as modules 5 and 1 or drop the
literals.
