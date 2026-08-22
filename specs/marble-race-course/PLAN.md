# Marble Race Course — Plan

Build the Board, assemble the Arc into a deterministic Course, run that Course
through the same live and headless physics contracts, and make the decisive
marble legible through a close camera and whole-Board minimap.

This is Spec 3 of [`../marble-race-rebuild/PLAN.md`](../marble-race-rebuild/PLAN.md).
Vocabulary is `CONTEXT.md`'s. The topology and simulation boundaries remain
those fixed by ADR 0001 and ADR 0002.

## Scope

This spec owns four dependency layers:

1. The fixed Board grid and placement transforms.
2. The Arc, Assembler, connector routing, Cell occupancy, and immutable Course.
3. Course-level headless validation and the live race loop.
4. The decisive-marble camera, minimap, and a development review harness.

Spec 4 still owns the React app shell, Roster/setup flow, persistence, audio,
result dialog, standings chrome, and finish reveal. Spec 3 exposes typed live
snapshots, events, and outcomes for it to consume.

The vortex bowl's deferred orbit guardrail and reference-video tuning remain
the debt recorded in `../marble-race-rebuild/EXECUTION.md`. Course validation
must exercise Courses containing the bowl, but this spec does not silently
redefine or close that separate acceptance debt.

## Decisions

### One seed reproduces one race

The existing stored race `seed` remains the root. Tagged deterministic
substreams derive Course selection, Roster-to-start-position assignment, and
any later random choice independently. Adding one draw to Course assembly must
not perturb start assignment or another subsystem.

Every new race gets a new root seed. Reusing a seed reproduces the Course and
start assignment. Rapier advances only in fixed 1/60 simulation steps. A render
frame may process a bounded number of steps, but unprocessed steps stay queued;
none are dropped. A weak device may show the race more slowly instead of
changing its physics result. All split times and watchdog limits use simulation
time, never wall time.

### The Arc has exactly 32 Course shapes

The fixed nine-Slot Arc remains:

| # | Slot | Role |
|---|---|---|
| 1 | Start | fixed |
| 2 | Build | `accel` |
| 3 | Scatter | `scatter` |
| 4 | Build | `accel` |
| 5 | Shuffle | `shuffle` |
| 6 | Sort | `sort` |
| 7 | Build | `accel` |
| 8 | Queue | `queue` |
| 9 | Finish | fixed |

One seeded choice is made per Role and reused by every Slot with that Role.
With two registered Modules per Role, that is `2^5 = 32` Course shapes. The
Assembler uses every chosen Module's validated default params; it does not draw
independent slider values. Parameter variation can follow only after the
catalogue exposes validated presets or coupled parameter constraints.

### The Board is fixed and serpentine

The Board is a fixed 3×3 grid of equal Slot bays. Start is at the top-left and
the path alternates left-to-right, then right-to-left by row, ending at the
bottom-right Finish. A Module is placed with yaw only: its local `+Z` travel
axis becomes left or right across the Board, while local `-Y` remains real
gravity. Depth stays 2.5D decoration/gameplay rather than becoming a routing
axis.

Board dimensions do not vary by seed. Bay size is derived once from the maximum
default projected bounds for every Module Role, rounded to whole Cells with
connector and Board-edge margins. If a future default no longer fits its bay,
assembly fails with a named Module/Slot error instead of resizing the Board.

The Board visual is a dark charcoal plane with an instanced visible-hole grid.
Its physical backstop prevents marbles escaping behind it; gameplay remains in
the placed Course colliders rather than on the Board surface.

### The Course is immutable shared data

`assembleCourse(seed)` returns fully materialized plain data. It contains no
React, Three.js, Rapier handles, callbacks, or closures. Both live rendering and
the headless Validator consume this same Course.

The contract is shaped around these exports:

```ts
interface BoardSpec {
  readonly columns: number;
  readonly rows: number;
  readonly cellPitch: number;
  readonly bounds: Footprint["bounds"];
}

interface CoursePlacement {
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

interface PlacedModule {
  readonly slotIndex: number;
  readonly role: Role;
  readonly moduleId: string;
  readonly params: ParamValues;
  readonly placement: CoursePlacement;
  readonly spec: Spec;
}

interface CourseConnector {
  readonly id: string;
  readonly fromSlotIndex: number;
  readonly toSlotIndex: number;
  readonly spec: Spec;
}

interface CourseCheckpoint {
  readonly slotIndex: number;
  readonly anchor: Anchor;
  readonly routeDistance: number;
}

interface Course {
  readonly seed: number;
  readonly board: BoardSpec;
  readonly modules: readonly PlacedModule[];
  readonly connectors: readonly CourseConnector[];
  readonly route: readonly Vector3[];
  readonly checkpoints: readonly CourseCheckpoint[];
  readonly start: Spec;
  readonly finish: Spec;
  readonly entry: Anchor;
  readonly exit: Anchor;
}

function assembleCourse(seed: number): Course;
function assembleCourseFromRoleSelection(
  seed: number,
  selection: Readonly<Record<Role, string>>,
): Course;
function stepCourse(course: Course, tSeconds: number): readonly KinematicTransform[];
```

`assembleCourseFromRoleSelection` exists so structural and physics validation
can enumerate all 32 shapes directly instead of hoping a seed sample covers
them. `assembleCourse` maps the Course-selection substream to one such Role
selection.

Placed collider and visual ids are namespaced by Slot/connector before entering
the Course. Placement transforms positions, rotations, anchors, bounds, motion
axes, and motion pivots together; a transformed windmill must still produce the
same live/headless transforms through its registry `step`.

### Footprints gain a shared route

`Footprint` gains `route: readonly Vector3[]`, an ordered local centreline from
entry to exit. Every Module emits it from the same centreline/profile already
driving its geometry. The Assembler transforms and concatenates Module and
connector routes into `Course.route`.

The route has three consumers:

- placement/connectivity checks;
- progress ranking and decisive-marble selection;
- the whole-Board minimap.

Passed Slot checkpoints constrain route projection so a marble orbiting the
bowl or near another serpentine row cannot jump to the wrong part of the Course.

### The Assembler derives occupied Cells

Modules do not hand-maintain `Footprint.cells`. After placement, the Assembler
rasterizes the transformed `Footprint.bounds` onto the fixed Board grid and
populates the placed Spec's Cells. Rectangular occupancy is intentionally
conservative; safe assembly matters more than packing density on a fixed Board.

All Cell overlap is rejected except between immediately consecutive Course
elements inside the one Cell containing their matched exit/entry anchors. This
allows a sealed physical joint without permitting a Module or connector to
intrude elsewhere. The Assembler also rejects:

- entry/exit anchors separated by more than one marble radius;
- opposing rather than continuous tangents;
- occupied Cells outside the Board;
- a Module outside its assigned bay;
- disconnected or zero-length route segments.

### Connectors are Course infrastructure

Connectors are not Modules and never fill Arc Slots. The Assembler generates
them deterministically through the shared channel geometry:

- short continuously descending links between same-row Slots;
- multi-segment downhill hairpins at row ends;
- overlapping physical joints and speed-derived outer rail height at turns.

Connector Specs, routes, colliders, visuals, and occupied Cells are part of the
Course and therefore visible to both runtime and Validator. Connectors may not
be padded to manipulate race duration.

### Start and Finish are fixed infrastructure

Start is a 5-wide × 3-deep corral for the maximum 15-marble Roster. The
start-assignment substream shuffles Roster indices over those positions. A
single kinematic gate holds the pack at rest and opens once at race time zero;
its transform comes from `stepCourse`, so live and headless construction agree.

Finish is a photo-finish straight with a finite Rapier sensor spanning the
channel. It records each marble's first forward crossing once. It never uses an
infinite plane, which previously false-triggered around the tilted vortex bowl.

- `first` completes and freezes on the first crossing.
- `last` continues until every marble crosses; finished marbles remain visible
  in a catch tray.

Crossing order is immutable. In `first`, the partial crossing order plus live
progress produces `finalRanking`; in `last`, the complete crossing order does.

### The watchdog fails honestly

At 120 simulation seconds without the Selection Mode's required finish, the
race stops with an explicit watchdog outcome containing the seed and unfinished
marble indices. It selects nobody, writes no history, nudges nothing, teleports
nothing, and never retries invisibly. Spec 4 may offer a visible new-race action.

### Course duration is measured, not forced

The catalogue's measured default Dwell Times put this nine-Slot Arc well below
the rebuild plan's original ~60-second estimate. Reaching that estimate now
would require dead connector stretches, unvalidated Module parameters, or a
larger Arc. All contradict decisions above.

Course validation therefore records the actual duration distribution but does
not assert a preferred duration. The 120-second watchdog remains a failure
ceiling. If the review harness feels too short, the next decision must change
the Arc or Module Dwell explicitly; connector padding and time scaling remain
forbidden.

### Course validation is exhaustive over shapes

Structural validation enumerates all 32 Role selections and asserts:

- deterministic deep-equal assembly;
- connected anchors and route;
- fixed Board dimensions;
- no illegal Cell overlap or out-of-Board occupancy;
- unique collider/visual ids;
- transformed kinematic motion remains live/headless equivalent.

Physics validation runs every shape with five deterministic start-assignment
seeds and 15 marbles: 160 packed races. Every marble must cross Finish before
the watchdog, with zero stalls and finite Dwell Time, exit-speed, Shuffle, and
duration metrics. The report records duration percentiles without a target.

### Live race exports state, not app behavior

The race API is shaped around these plain types:

```ts
interface RaceRequest {
  readonly seed: number;
  readonly roster: readonly string[];
  readonly selectionMode: SelectionMode;
}

interface MarbleTransform {
  readonly marbleIndex: number;
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

interface RaceContactEvent {
  readonly elapsedSeconds: number;
  readonly marbleIndices: readonly number[];
  readonly impulse: number;
}

interface RaceSnapshot {
  readonly elapsedSeconds: number;
  readonly marbleTransforms: readonly MarbleTransform[];
  readonly ranking: readonly number[];
  readonly decisiveMarbleIndex: number;
  readonly passedCheckpoints: readonly number[];
  readonly splitTimes: readonly (readonly (number | null)[])[];
}

type RaceOutcome =
  | {
      readonly kind: "completed";
      readonly seed: number;
      readonly selectedMarbleIndex: number;
      readonly finishOrder: readonly number[];
      readonly finalRanking: readonly number[];
      readonly elapsedSeconds: number;
    }
  | {
      readonly kind: "watchdog";
      readonly seed: number;
      readonly unfinishedMarbleIndices: readonly number[];
      readonly elapsedSeconds: number;
    };
```

The live race emits immutable snapshots, contact events for Spec 4's audio, and
exactly one terminal outcome. It never imports the race store or result dialog.
Progress is the highest passed checkpoint plus projection onto the allowed
Course-route interval. The leader is decisive in `first`; the trailing
unfinished marble is decisive in `last`.

### Camera and minimap share progress data

The race camera is face-on perspective with fixed rotation, field of view, and
distance sized to the largest Slot bay. It pans in Board `x/y`, never rotates,
and never changes zoom. A decisive-marble handover within one viewport uses a
damped follow with hysteresis; a larger handover cuts immediately.

The minimap is a React SVG overlay derived from Board bounds, `Course.route`,
checkpoints, and live marble `x/y` positions. It shows the whole Board and every
marble. The decisive marble is identified by shape and an accessible label, not
color alone.

### Spec 3 has an isolated review harness

`course.html` mounts the real Course/live-race components with a fixed Roster
and editable seed/Selection Mode controls. It is a development harness, not the
production app shell. `index.html` remains the Showcase until Spec 4 decides
the final routing and composes setup, race, results, persistence, audio, and
broadcast chrome.

## Acceptance

Agent-owned checks:

- Same seed produces a deep-equal Course and start assignment regardless of
  unrelated substream draws.
- Every one of the 32 Course shapes passes structural validation.
- All 160 packed validation races finish all 15 marbles before 120 simulation
  seconds with zero stalls and finite metrics.
- Validator and live helpers produce identical placed and kinematic transforms
  at the same fixed step.
- `first`, `last`, finite Finish sensing, immutable split times, and watchdog
  outcomes have deterministic tests.
- Typecheck, full tests, production build, lint, and format check pass.

User review in `course.html`:

- All three rows read as one continuous Course with no floating, intersecting,
  or visibly dead connector.
- The starting gate releases a packed 15-marble field together, and both
  Selection Modes end on the correct marble.
- The camera stays close without hunting; large decisive handovers cut cleanly.
- The minimap keeps every marble and the decisive marker legible throughout.
- Several seeds produce visibly different Module choices while retaining the
  same Board and Arc.
- The observed duration feels complete enough without hidden timing controls;
  rejection here reopens Arc/Module Dwell, not connector length.

## Out of scope

- Production setup, persistence, audio, results, standings chrome, and routing
  (Spec 4).
- A Course editor, saved/shared Course JSON, multiple Boards, or free-3D
  routing.
- Random Module parameters, weighted Role choices, runtime Course rejection,
  invisible retries, physics nudges, or duration controls.
- Closing the vortex bowl's previously accepted visual/orbit debt.

## Decisions log

1. One Spec with four dependency phases, over splitting headless Course work
   from its live consumer.
2. One stored root seed with tagged substreams, over unrelated mutable random
   draws or a fixed Course.
3. Default Module params only, over unvalidated slider randomization.
4. Fixed 3×3 serpentine Board with yaw-only placement, over dynamic packing or
   arbitrary 3D rotation.
5. One Module choice per Role (`2^5 = 32`), over independent per-Slot choices.
6. Immutable materialized Course data, over runtime objects or reconstruction
   in each consumer.
7. Assembler-derived conservative Cells, over hand-authored Module occupancy.
8. Generated connector infrastructure, over connector Modules or empty Slots.
9. Honest watchdog failure, over retrying, nudging, or fabricating a result.
10. Measured duration, over padding the Course toward the stale ~60-second
    estimate.
11. Fixed-step backlog retention, over dropped simulation time.
12. Shared route/checkpoints, over inferring progress from Board position.
13. Fixed-scale decisive camera and SVG minimap, over dynamic zoom or a second
    Three.js render.
14. Development-only Course harness, over deciding Spec 4's routing early.

## Open items

None.
