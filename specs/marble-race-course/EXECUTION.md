# Marble Race Course — Execution Plan

Spec: [PLAN.md](PLAN.md). Rulebook: `specs/RULEBOOK.md`.
Integration branch: `main`. Branch model: stacked via `gh stack` (default) —
the CLI and repository support stacks. Phase 1 initializes the stack with
`gh stack init --base main marble-race-course/phase-1-course-contracts` because
the installed CLI requires the first branch as an argument; later phases use
`gh stack add` from the stack top.

## STATUS

- Current phase: 4 — done (user-accepted verification waiver 2026-08-23)
- Phase 1 — Course contracts and placement: done
- Phase 2 — Arc and Assembler: done
- Phase 3 — Course Validator and live race: done (user-accepted verification waiver 2026-08-23)
- Phase 4 — Board camera, minimap, and harness: done (user-accepted verification waiver 2026-08-23)
- Phase 3 resumed: user direction on 2026-08-22 excludes vortex shapes from
  the successful packed-physics gate while preserving honest live watchdogs.
- User acceptance record: user directed completion and merge despite the unresolved
  packed-physics gate. The last completed matrix had 1,199/1,200 finishes; Shape 28,
  Start seed 1 escaped at the Slot 3 same-row connector entrance. No gate waiver is
  represented as a passing test result.
- Verification debt: inherited vortex-bowl orbit/reference-video work remains
  deferred per `../marble-race-rebuild/EXECUTION.md`; this spec preserves but
  does not close that user-accepted debt.

## Phase 1 — Course contracts and placement

Branch: `marble-race-course/phase-1-course-contracts` (stack root: `gh stack
init --base main marble-race-course/phase-1-course-contracts`)

Nothing can assemble until every Module exposes a route and a pure placement
layer can transform Specs onto the fixed Board grid.

Consumes: `Spec`, `Footprint`, `Cell`, `Anchor`, `Role`, `ParamValues`,
`KinematicTransform`, `ALL_MODULES`, `defaultParamValues`, `SCALE.cellPitch`,
`createSeededRandom(seed: number): () => number`.
Produces: `Footprint.route: readonly Vector3[]`; `RaceRandomStream`,
`deriveRaceSeed(seed: number, stream: RaceRandomStream): number`; `BoardSpec`,
`ArcSlot`, `CoursePlacement`, `PlacedModule`, `CourseConnector`,
`CourseCheckpoint`, `Course`; `BOARD`; `transformSpec(spec: Spec, placement:
CoursePlacement, idPrefix: string): Spec`; `rasterizeFootprintCells(footprint:
Footprint, board: BoardSpec): readonly Cell[]`.

Fresh review: not required

- [x] Add required `route: readonly Vector3[]` to `Footprint` in `src/modules/types.ts`; change `ChannelParts` in `src/modules/geometry/channel.ts` to return its ordered segment-centreline route with exact entry/exit endpoints.
- [x] Populate `Footprint.route` from the geometry-driving centreline/profile in `src/modules/chute/index.ts`, `src/modules/steepZigzag/index.ts`, `src/modules/pinField/index.ts`, `src/modules/rumbleStrip/index.ts`, `src/modules/staircase/index.ts`, `src/modules/frictionLanes/index.ts`, `src/modules/whoops/index.ts`, `src/modules/funnelChoke/index.ts`, `src/modules/windmill/index.ts`, and `src/modules/vortexBowl/index.ts`; the bowl route follows its entry ramp and inward spiral rather than an entry/exit chord.
- [x] Add `src/modules/route.test.ts` and extend `src/modules/geometry/channel.test.ts`: every registered Module's default route has at least two finite points, begins/ends at its anchors, advances without zero-length segments, and remains pure under the existing generalized purity loop.
- [x] (amended 2026-08-22) Add entry-to-exit routes to the synthetic `Spec` fixtures in `src/modules/divergence.test.ts` and `src/validator/applyStep.test.ts` so they satisfy the required `Footprint.route` contract.
- [x] Add `RaceRandomStream = "course" | "start"` and `deriveRaceSeed` to `src/race/random.ts`, using fixed tag salts so draws or call order in one stream cannot perturb the other; extend `src/race/random.test.ts` with repeatability and substream-isolation cases.
- [x] Add the immutable plain-data contracts from PLAN.md → "The Course is immutable shared data" to `src/course/types.ts`, including the fixed nine-entry `ArcSlot` shape but no renderer, Rapier handle, callback, or function field.
- [x] Add `src/course/board.ts` exporting seed-independent `BOARD`: derive equal 3×3 bay dimensions from every Role's maximum default projected Module bounds, round to whole `SCALE.cellPitch` Cells, and add named connector/edge margins; throw a Module/Role-specific error if any current default does not fit its assigned bay.
- [x] Add `src/course/transformSpec.ts`: `transformSpec` namespaces collider/visual ids and applies one placement consistently to colliders, visuals, anchors, route, bounds, motion axes, and motion pivots; rotations remain normalized and source Specs remain unchanged.
- [x] Add `src/course/occupancy.ts`: rasterize transformed bounds conservatively into Board Cells, reject non-finite/out-of-Board bounds, and return stable row-major unique Cells without mutating the Footprint.
- [x] Add `src/course/board.test.ts`, `src/course/transformSpec.test.ts`, and `src/course/occupancy.test.ts` covering seed-independent dimensions, all default Modules fitting, yaw-only left/right placement, id namespacing, transformed windmill motion, conservative edge-cell inclusion, and out-of-Board rejection.

**Phase gate (hard):**
- [x] `pnpm typecheck` (project-wide `tsc -b`)
- [x] `pnpm vitest related --run <changed files>`

**Review checklist (user, at PR review):**
- [ ] Inspect the transformed chute and windmill fixtures: anchors, routes, ids, and the windmill's motion pivot/axis all share one placement without mutating the source Spec.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 2 — Arc and Assembler

Branch: `marble-race-course/phase-2-assembler` (stacked: `gh stack add`)

The pure Course must exist and clear structural checks before either physics
consumer builds it.

Consumes: `BoardSpec`, `ArcSlot`, `CoursePlacement`, `PlacedModule`,
`CourseConnector`, `CourseCheckpoint`, `Course`, `BOARD`, `transformSpec`,
`rasterizeFootprintCells`, `buildChannel`, `ALL_MODULES`, `modulesByRole`,
`defaultParamValues`, `deriveRaceSeed`, `SCALE`.
Produces: `ARC: readonly ArcSlot[]`; `RoleSelection = Readonly<Record<Role,
string>>`; `enumerateRoleSelections(): readonly RoleSelection[]`;
`selectRoleModules(seed: number): RoleSelection`; `ConnectorRequest`;
`buildCourseConnector(request: ConnectorRequest): CourseConnector`;
`START_POSITIONS: readonly Vector3[]`; `buildStartSpec(): Spec`;
`buildFinishSpec(): Spec`; `stepStartGate(spec: Spec, tSeconds: number):
readonly KinematicTransform[]`;
`assembleCourse(seed: number): Course`;
`assembleCourseFromRoleSelection(seed: number, selection: RoleSelection):
Course`; `stepCourse(course: Course, tSeconds: number): readonly
KinematicTransform[]`.

Fresh review: required — upgraded after multiple Cell-overlap corrections; initial review and re-review findings corrected

- [x] Add `src/course/arc.ts` with the fixed nine-Slot 3×3 serpentine `ARC`, exhaustive `enumerateRoleSelections` in stable Role order, and `selectRoleModules` using only the tagged Course substream; one selection per Role is reused by all matching Slots.
- [x] Add `src/course/connectors.ts`: `buildCourseConnector` emits short continuously descending same-row channels and multi-segment downhill row-end hairpins through `buildChannel`, with overlapping physical joints, route samples, and outer rail height derived from incoming terminal speed (`v²/(2g)`), never connector padding for duration.
- [x] Add `src/course/startFinish.ts`: the fixed 5×3 Start corral and pure rotating gate motion, plus the photo-finish straight, finite sensor descriptor, and catch tray; neither uses an infinite finish plane.
- [x] (amended 2026-08-22) Update `BoardSpec` in `src/course/types.ts` plus `src/course/board.ts` and `src/course/board.test.ts` so fixed bay height covers the maximum same-row default geometry across all 32 Arc selections and explicit Board-edge margin covers the generated hairpin's reach plus channel half-width.
- [x] Add `src/course/assembleCourse.ts`: materialize default-param Modules from one Role selection, place them yaw-only into `BOARD`, namespace/transform their Specs, connect every adjacent pair, concatenate route/checkpoints, populate Cells, and return a deeply immutable Course.
- [x] Enforce structural invariants inside `assembleCourseFromRoleSelection`: every Module fits its bay; anchors meet within one marble radius with continuous tangents; routes have no gaps/zero-length segments; ids are globally unique; Cells remain on Board; overlap occurs only for consecutive elements inside their one matched-anchor Cell.
- [x] (amended 2026-08-22) Replace the impossible single-Cell joint-overlap rule with a local Slot-neighborhood rule: `SCALE.channelWidth` spans five `SCALE.cellPitch` Cells, conservative edge inclusion assigns multiple Cells to a sealed joint, and the tilted vortex bowl's conservative AABB extends upstream of its entry far enough that its incoming and outgoing connector Cell sets also meet. Allow overlap only between elements whose Slot ranges touch; require directly consecutive elements to include the matched joint cross-section inside its one-marble-radius longitudinal neighborhood; reject every remote overlap. Phase 3 physics validation remains responsible for real collider intersections hidden by conservative bounds.
- [x] (amended 2026-08-22) Estimate each connector's incoming terminal speed from the immediately preceding default element's gravitational drop, not accumulated Course elevation; accumulated-drop rails intersect earlier rows, while the connector retains the specified `v²/(2g)` containment formula. Derive Board edge clearance from the maximum such default energy height.
- [x] (amended 2026-08-22) Rasterize connector Cells as the conservative union of their projected collider cuboids rather than their whole multi-segment `Footprint.bounds`; a hairpin's axis-aligned outer bounds fill the empty bend interior and falsely overlap its destination Module.
- [x] Implement `stepCourse` in `src/course/stepCourse.ts`: combine registry `step` output for every placed Module with the Start gate's pure-in-time transform, preserving namespaced ids and returning call-order-independent results.
- [x] Add `src/course/arc.test.ts`, `src/course/connectors.test.ts`, `src/course/startFinish.test.ts`, and `src/course/assembleCourse.test.ts`: enumerate exactly 32 unique selections; same seed is deep-equal; unrelated Start-substream draws do not alter Course selection; Board/Arc stay fixed; all 32 selections clear every structural invariant; source Module Specs remain unchanged.
- [x] Extend `src/modules/divergence.test.ts` with a placed windmill and Start gate at several fixed steps, asserting `stepCourse` produces transforms the headless `applyStep` path can apply identically to the live path's shared kinematic helpers.
- [x] (amended 2026-08-22, fresh review P2) Deep-freeze every exported `ARC` Slot record as well as the containing array, and cover nested runtime immutability so a consumer cannot mutate later assembly topology.
- [x] (amended 2026-08-22, fresh review P2) Derive matched seam Cells from the Anchor's projected tangent with exactly one marble radius of longitudinal tolerance and a bounded two-radius cross-section; add a regression proving a Cell outside that neighborhood cannot satisfy the seam check.

**Phase gate (hard):**
- [x] `pnpm typecheck` (project-wide `tsc -b`)
- [x] `pnpm vitest related --run <changed files>`

**Review checklist (user, at PR review):**
- [ ] Inspect three fixed-seed Course fixtures: all keep the same 3×3 Board/Arc while Module choices change only by Role and all three Build Slots reuse one `accel` choice.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 3 — Course Validator and live race

Branch: `marble-race-course/phase-3-live-race` (stacked: `gh stack add`)

The headless and live consumers land together because their shared finish,
progress, fixed-step, and watchdog semantics are the feature's honesty boundary.

Consumes: `Course`, `CourseCheckpoint`, `assembleCourse`,
`assembleCourseFromRoleSelection`, `enumerateRoleSelections`, `stepCourse`,
`deriveRaceSeed`, `buildWorld`, `applyStep`, `KINEMATIC_FIXED_STEP_SECONDS`,
`SelectionMode`, `SCALE`, `exitPlaneDistance` only for non-Finish Module metrics.
Produces: `RaceRequest`, `MarbleTransform`, `RaceContactEvent`, `RaceSnapshot`,
`RaceOutcome`; `StartAssignment`; `assignStartPositions(seed: number,
rosterSize: number): readonly StartAssignment[]`; `RaceProgressState`;
`createRaceProgress(request: RaceRequest, course: Course): RaceProgressState`;
`recordCheckpoint(state: RaceProgressState, marbleIndex: number, checkpointIndex:
number, elapsedSeconds: number): RaceProgressState`; `recordFinish(state:
RaceProgressState, marbleIndex: number, elapsedSeconds: number):
RaceProgressState`; `advanceWatchdog(state: RaceProgressState, elapsedSeconds:
number): RaceProgressState`; `FixedStepBacklog`, `FixedStepAdvance`,
`advanceFixedStepBacklog(state: FixedStepBacklog, wallDeltaSeconds: number,
maxSteps: number): FixedStepAdvance`; `BuiltCourseWorld`, `buildCourseWorld(course:
Course, assignments: readonly StartAssignment[]): BuiltCourseWorld`;
`CourseValidationReport`, `validateCourseVariants():
Promise<CourseValidationReport>`; `LiveRaceProps`, `<LiveRace>`.

Fresh review: required — the live/headless dual construction paths and honest watchdog outcome are the spec's core correctness boundary

- [x] Add the exact live contracts from PLAN.md → "Live race exports state, not app behavior" to `src/race/liveTypes.ts`, including a completed/watchdog discriminated union and no imports from `src/storage/` or result UI.
- [x] Add `src/race/startAssignment.ts`: `assignStartPositions` validates Roster size 1–15 and uses only the tagged Start substream to shuffle indices across the fixed 5×3 corral; Course-substream draws cannot change the assignment.
- [x] Add `src/race/progress.ts`: immutable checkpoint/split-time/finish state, route projection restricted by the highest passed Slot checkpoint, first-forward-crossing deduplication, `first` leader and `last` trailing-unfinished decisive selection, partial-progress `finalRanking` for `first`, complete crossing ranking for `last`, and exactly one terminal outcome.
- [x] Add `src/race/fixedStepBacklog.ts`: accumulate wall delta into fixed 1/60 work, return a bounded number of steps per rendered frame, retain rather than drop backlog, and expose simulation time independently of wall time.
- [x] Add `src/validator/buildCourseWorld.ts` so a Course builds from its materialized Specs, namespaced kinematic bodies, 5×3 marble assignments, and finite Finish sensor while leaving Module validation in `buildWorld.ts`; sensor/collision events use the same ids consumed by live progress.
- [x] (amended 2026-08-22) Transform authored `START_POSITIONS` through the Start Spec's yaw-only local axes rather than its sloped entry Anchor frame; each fixed position already includes local floor height, so the sloped frame would apply the grade twice.
- [ ] Add `src/validator/validateCourse.ts`: enumerate the 16 non-vortex Role selections, run five tagged Start seeds × 15 marbles through fixed-step `stepCourse`, stop each run when all marbles finish or 120 simulation seconds elapses, and return finite duration/Dwell/exit-speed/Shuffle metrics plus stalls/watchdogs.
- [ ] (amended 2026-08-22) Replace fixed-reach row-end hairpins with three contained runs sized from the actual Board-row drop—a long descending approach, vertical fall, and long descending exit ramp—and include that reach in fixed Board edge clearance; the original short controls turn the multi-meter row drop into near-vertical entry/exit corners that eject packed marbles.
- [ ] (amended 2026-08-22) Add an explicit segment up-frame to shared channel geometry and use it for Course connectors so diagonal bend segments keep channel width in Board depth; shortest-arc `+Z` rotation rolls width into Board `x/y` and cannot retain marbles through the row turn.
- [ ] (amended 2026-08-22) Add a speed-height outer containment wall at each row-end bend apex, spanning Board depth and the row drop; depth-side rails cannot redirect outward Board-`x` inertia as the hairpin floor curves downward.
- [ ] (amended 2026-08-22) Probe the vortex bowl's schema bounds for packed Course drainage, retain its original defaults when the maximum-tilt/maximum-drain/maximum-pitch probe ejects the full pack, and leave the separately deferred orbit-count/reference-video debt open.
- [ ] (amended 2026-08-22) Use low-restitution, moderate-friction material only on row-end hairpins so their required catch wall dissipates the multi-row drop before the next Module; keep short same-row connectors on shared defaults and do not add duration padding.
- [ ] (amended 2026-08-23) Tune the row-end governor angular velocity in `src/course/connectors.ts` and `src/course/connectors.test.ts`; it must dissipate packed-marble energy through a visible mechanism without changing routes, floors, or watchdog semantics.
- [ ] (amended 2026-08-23) Overlap only the first pair of same-row connector rails with their preceding Module in `src/course/connectors.ts` and `src/course/connectors.test.ts`; preserve the exact Anchor and floor seam while closing the packed lateral escape at a rotated Module-to-connector join.
- [ ] (amended 2026-08-23) Restore the shared Whoops rail height in `src/modules/whoops/index.ts` and tune its default descent within the existing schema; packed contacts must remain contained without a roof or oversized wall.
- [ ] (amended 2026-08-23) Reduce the Steep Zigzag default leg count in `src/modules/steepZigzag/index.ts`; repeated acceleration before Whoops and row-end hairpins must not eject or stall the packed Course while each retained leg keeps its validated grade.
- [ ] (amended 2026-08-23) Add high, flat outer catch caps to `src/modules/steepZigzag/index.ts` and `src/modules/steepZigzag/steepZigzag.test.ts`; they must intercept a packed outward launch above the speed-derived guard wall while leaving the central channel open.
- [ ] (amended 2026-08-22) Replace same-row anchor chords with sampled cubic links whose endpoint derivatives match both Anchor tangents; a positive tangent dot alone lets the chord miss the vortex bowl's deliberately inward-angled narrow entry ramp.
- [ ] (amended 2026-08-22) Make `src/validator/buildWorld.ts` attach every Spec's static colliders to one shared fixed body, matching `ModuleColliders`; one body per collider makes overlapping vortex plates resolve as independent contacts and invalidates live/headless parity.
- [ ] (amended 2026-08-22, user direction) Exclude the 16 vortex-bowl selections from the successful packed-physics gate; structural assembly still covers all 32 and live vortex races retain the honest watchdog outcome.
- [ ] Add `src/validator/courseValidation.test.ts`: every one of the 80 non-vortex packed races finishes all 15 marbles before the watchdog with zero stalls and finite metrics; record measured duration percentiles in the assertion comment without imposing a target range.
- [ ] Add `src/race/LiveRace.tsx` and `src/race/CoursePhysics.tsx`: mount the same Course Specs and finite Finish sensor under R3F/Rapier, drive `stepCourse` before every solver substep from the retained fixed-step backlog, emit immutable snapshots/contact events, freeze exactly at the terminal outcome, and leave persistence/audio/results to Spec 4.
- [x] Add `src/race/startAssignment.test.ts`, `src/race/progress.test.ts`, and `src/race/fixedStepBacklog.test.ts` covering tagged-stream isolation, duplicate/backward sensor crossings, immutable split times, both Selection Modes, watchdog failure at 120 simulation seconds, no dropped backlog, and render-frame partition independence.
- [ ] Add `src/race/divergence.test.ts` with a synthetic Course containing a transformed windmill and Start gate; at identical fixed steps the live helper and headless body transforms, checkpoint times, finish order, and terminal outcome must agree.

**Phase gate (hard):**
- [x] User-accepted waiver on 2026-08-23; the packed-physics failure remains recorded in STATUS.

**Review checklist (user, at PR review):**
- [ ] Run one fixed-seed focused race twice through the retained headless fixture and confirm identical start assignment, splits, finish order, selected marble, and elapsed simulation time.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 4 — Board camera, minimap, and harness

Branch: `marble-race-course/phase-4-course-harness` (stacked: `gh stack add`)

The final layer makes the real live Course reviewable without taking ownership
of Spec 4's production app shell.

Consumes: `BoardSpec`, `Course`, `RaceRequest`, `RaceSnapshot`, `RaceOutcome`,
`assembleCourse`, `<LiveRace>`, `<ModuleColliders>`, `MarbleStyle`, `SCALE`.
Produces: `<Board>`, `<CourseScene>`, `<DecisiveCamera>`,
`CameraTargetState`, `cameraTargetForSnapshot(previous: CameraTargetState,
snapshot: RaceSnapshot, viewportWorldWidth: number): CameraTargetState`,
`<CourseMinimap>`, `LiveRaceProps`, `<LiveRace>`, `<CoursePreview>`;
`course.html` development entry.

Fresh review: not required

- [x] Use `threejs-geometry`, `threejs-materials`, and `react-frontend-developer` before implementing this phase; add `src/course/render/Board.tsx` with a dark charcoal backstop and instanced visible-hole grid derived from `BoardSpec`, disposing replaced geometries through R3F-owned JSX children rather than imperative `geometry` props.
- [x] Add `src/course/render/CourseScene.tsx`: render every placed Module, connector, Start, Finish, marble, and kinematic transform from the materialized Course/`LiveRace`; do not rebuild Specs or feed changing transforms back through declarative `RigidBody` props on re-render.
- [x] Add `src/race/cameraTarget.ts` and `src/race/DecisiveCamera.tsx`: fixed face-on perspective rotation/FOV/distance sized to one largest bay, Board `x/y` pan only, damped hysteretic follow within one viewport, immediate cut beyond it, and no dynamic zoom.
- [x] Add `src/race/CourseMinimap.tsx`: accessible React SVG from Board bounds, Course route/checkpoints, and snapshot marble positions; show every marble and identify the decisive one by shape plus label, never color alone.
- [x] (amended 2026-08-23, user direction) Add `src/race/CourseRaceRuntime.ts`, `src/race/LiveRace.tsx`, and `src/race/CoursePhysics.tsx`, plus contact-force event support in `src/validator/buildCourseWorld.ts`, on this Phase 4 branch because `<CourseScene>` and `course.html` must use the real live runner, not a visual stub. Reuse Phase 3's fixed-step, Course, finite-finish, snapshot, and watchdog contracts; do not resume the parked physics-tuning work.
- [x] Add `course.html`, `src/dev/coursePreview.tsx`, and `src/styles/course.css`: editable seed and Selection Mode, fixed 15-name Roster, start/restart control, watchdog details, and the real `<CourseScene>`/`<LiveRace>`; leave `index.html` and `src/main.tsx` on the Showcase and do not add production routing.
- [x] Add `src/race/cameraTarget.test.ts` for hysteresis/cut thresholds and no zoom output; add `src/race/CourseMinimap.test.tsx` and `src/dev/coursePreview.test.tsx` in happy-dom for full-marble rendering, decisive non-color labeling, controls, completed/watchdog states, and Showcase-entry isolation.

**Phase gate (hard):**
- [ ] `pnpm typecheck` (project-wide `tsc -b`)
- [ ] `pnpm vitest related --run <changed files>`

**Review checklist (user, at PR review):**
- [ ] Open `/course.html` with 15 marbles: the three rows form one continuous Course with no floating/intersecting/dead connector, and the fixed Board/hole grid does not resize across seeds.
- [ ] Run both Selection Modes: the 5×3 gate releases together, `first` freezes on the first finite-sensor crossing, and `last` follows the final unfinished marble into the catch tray.
- [ ] Watch several decisive handovers: nearby changes follow smoothly without hunting, distant changes cut immediately, zoom stays fixed, and the SVG minimap keeps every marble plus the decisive label legible.
- [ ] Try several seeds: each keeps the same Arc/Board, changes Modules only by Role, and the observed duration feels complete without padded connectors or hidden time control.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Spec gate (hard — once, before the final phase's PR)

- [x] User-accepted waiver on 2026-08-23; no unchecked test failure is presented as passing evidence.
