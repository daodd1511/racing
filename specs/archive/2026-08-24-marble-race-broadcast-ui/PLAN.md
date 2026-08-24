# Broadcast UI

## Goal

Ship the Marble Race Picker as a production React application over the live
Board/Course runtime. A host pastes a Roster, chooses a Selection Mode, watches
the decisive marble through broadcast-style standings and a minimap, and gets a
durably committed result only when the physics runtime reports a completed
outcome.

This is Spec 4 from `specs/marble-race-rebuild/PLAN.md`. It replaces the
Showcase at the production entry point; it does not change Module geometry,
Course assembly, race progress semantics, or physics tuning.

## Scope decision

Keep this as one spec with four reviewable phases. The React shell, live Course,
broadcast chrome, terminal outcomes, and routing share one race-session
lifecycle and do not form useful independent releases. The Showcase and Course
review harness remain independently accessible development routes.

1. React shell and setup flow.
2. Live Course composition and broadcast standings.
3. Audio, persistence, watchdog handling, and finish reveal.
4. Production routing, responsive polish, legacy cleanup, and Pages
   verification.

## Confirmed product decisions

- `index.html` mounts the production React application.
- `showcase.html` retains the React Showcase; `course.html` retains the React
  Course review harness.
- The primary flow is `setup -> racing -> result -> setup`. A watchdog outcome
  branches from racing into a recoverable failure panel.
- The completed Course freezes behind the result reveal. **New race** returns to
  setup and requires Roster confirmation.
- Setup, racing, failure, and result use one dark broadcast design: dark
  charcoal surfaces, bundled DM Mono numerals, acid `#d8ff42` accents, and the
  toy-real Course. The old warm-arcade styling does not survive.
- The standings panel shows every marble, up to the 15-marble maximum. Each row
  shows position, marble/name, decisive flag, current checkpoint, and latest
  split time. It does not render a full split matrix during the race.
- On completion, the runtime freezes immediately, the audio layer plays one
  finish sting, the unobstructed finish frame holds for about 800 ms, and the
  result panel then enters. Persistence happens at the terminal outcome, not
  after the visual delay.
- A watchdog outcome never commits or invents a result. It shows the race seed
  and unfinished names, then offers **Retry race** with a new seed or **Back to
  setup**.
- One visible audio toggle remains available across every application state.
  Audio starts muted on every page load, is never persisted, and keeps its
  current choice only for that page session.
- The imperative setup and result views become typed React components. The
  storage and audio modules remain framework-independent services.
- The broadcast composition targets a shared 16:9 desktop tab. Narrow screens
  stack the standings below the Course and keep all controls usable; there is
  no separate mobile presentation or landscape requirement.
- Completed races continue to append to local history, but this spec adds no
  history browser. The current result shows its seed and final order.
- Production generates a new race seed on every confirmed race. Seed editing
  remains a development-harness feature. Watchdog retry generates a new seed.
- An interrupted race is not persisted or resumed. Reloading returns to setup
  with the saved Roster and Selection Mode.
- One displayed seed is the complete replay identity: together with Roster
  size and Selection Mode it reproduces Course selection, randomized packed
  Start assignments, and physics. Roster names never influence random derivation.

## Existing contracts to preserve

### Picker behavior

- A Roster contains 1-15 trimmed non-empty entries. Duplicate names remain
  separate marbles.
- Selection Mode remains `first` or `last`; the saved setting defaults to
  `first`.
- The Result Label remains `DEFAULT_RACE_CONFIG.resultLabel` rather than UI
  copy embedded in a component.
- **Copy list** writes the normalized Roster through the Clipboard API.
- Names and race records remain browser-local. No application feature sends
  them over the network.
- Existing `PickerStateV1` and the `marble-race-picker` storage key remain
  compatible. This spec does not migrate or clear durable data.

### Live race behavior

- `assembleCourse(seed)` materializes the Course once for a race.
- `LiveRace` owns only live progress and emits immutable snapshots, contact
  events, and exactly one terminal outcome.
- `RaceSnapshot.ranking`, `decisiveMarbleIndex`, `passedCheckpoints`, and
  `splitTimes` are the only standings inputs. The UI does not independently
  derive physics progress.
- In `first` mode the leader is decisive and the first finite Finish crossing
  completes the race. In `last` mode the trailing unfinished marble is decisive
  and the final finite Finish crossing completes the race.
- The decisive camera and minimap continue to consume the same snapshot. The
  camera uses an elevated third-person chase view above the track and behind
  the decisive marble, derives a stable heading from the local Course route
  tangent instead of noisy frame-to-frame velocity or a fixed Board axis, and
  keeps the marble low in frame with the upcoming channel visible. It combines
  a route-relative trailing offset with gravity-up Y elevation and a smaller
  outward Z offset, avoiding both a side view and a straight overhead view.
  Frame-rate-independent damping independently smooths decisive-target changes,
  Course heading, camera position, and look-at position. Setup offers a
  Broadcast camera and a Close up camera. Close up follows the same decisive
  marble from its exact planar position five cell pitches above the Course, with a
  wider field of view and longer forward sightline for a track-level racing perspective.
- The live and frozen Course renderer omits connector roof and governor-ceiling
  visuals that block the elevated camera. Their colliders remain in the Course,
  so this presentation rule does not change race physics or validation.
- Race connectors render as continuous swept floors with low continuous rails
  instead of exposing the physical collider tiling. Default obstacle Modules
  use denser fields and stronger interactions, with validation guardrails for
  zero stalls and measurable scatter, shuffle, or sort behavior.
- Production Course generation applies one gentle race grade independently of
  Showcase tuning. Seeded obstacle sections mount onto that continuous Course. The production
  layout uses eight standard-width columns, adding enough smooth separation for
  more obstacles without stretching their geometry or increasing track grade.
- Row-turn connectors lengthen to an approximately 10% average grade and
  distribute their vertical drop by horizontal curve distance, preventing a
  steep section at the turn apex. Straight connectors use one continuous
  swept open-channel collider instead of overlapping floor and rail cuboids.
  Its floor and walls preserve the exact entry and exit vertices, align with
  adjacent Module surfaces, and use tangent-matched overlap beyond each anchor
  so no collision lip or hidden rail end face crosses the racing surface.
  Row turns use the same roofless open-channel contact mesh at 96 samples, so
  marbles cannot ricochet between a floor and hidden ceiling or receive abrupt
  normal changes from coarse outer-wall facets. Chute keeps its rendered
  cuboid thickness but collides only on the floor top and each rail's inward
  face, removing the closed boxes' end faces at connector-fed Chute anchors
  without changing the collider contract used by other Modules.
  Live and headless Rapier construction use zero contact skin for every static
  shape, preventing an effective height step between cuboids and trimeshes.
- The production Course contains ten obstacle sections: four Diamond fields,
  three Whoops sections, and three Staircases. These three obstacle types are
  the complete active obstacle catalog; Chute remains as structural Course.
  A dedicated seed substream shuffles that inventory into the ten obstacle
  Slots for each race, making the layout varied but reproducible from its seed.
  The shuffle never places the same obstacle type in consecutive obstacle Slots.
  Every obstacle pair has a plain Chute section between it, and every row begins
  with a Chute so no obstacle blocks the chase camera immediately after a turn.
  The Diamond field uses ten tightly staggered rows and larger interior posts.
  Alternating half-circular bumpers join the left and right barriers on each
  row's open side, closing both straight rail bypasses while retaining more
  than one marble diameter between each bumper and its nearest diamond. Its
  physics uses round colliders for both diamonds and rail bumpers, eliminating
  stable multi-marble flat-face locks while retaining the Diamond visual.
  Course Whoops use six longer waves across a 2.4 m section, with 0.016 m
  amplitude and 0.40 m wavelength. The Course Staircase uses ten 0.20 m
  treads with 0.048 m rises. Showcase defaults remain independent.
- A 3-2-1-GO start gate delays the live solver, and live rendering advances at
  a modest fraction of wall time while preserving the exact fixed simulation
  step, deterministic outcome, and 120-second simulation watchdog.
- The countdown shows the staged marbles in centered rows of at most five,
  randomly assigns marble identities only across the occupied positions from
  the tagged Start seed stream, and frames the Start grid and gate before
  transitioning into the decisive-marble chase camera.
- The production shell uses a playful arcade-broadcast visual system with a
  mode-aware tracking HUD. The dark monitoring-dashboard treatment is not part
  of the retained capability baseline.
- The 120-second watchdog remains a failure ceiling, not a selection fallback.

## Application architecture

### React session state

Use a discriminated union in `src/app/session.ts` and a reducer rather than
independent booleans:

```ts
type AppSession =
  | { readonly kind: "setup" }
  | {
      readonly kind: "racing";
      readonly request: RaceRequest;
      readonly course: Course;
    }
  | {
      readonly kind: "result";
      readonly request: RaceRequest;
      readonly course: Course;
      readonly snapshot: RaceSnapshot;
      readonly record: CommittedRaceRecord;
      readonly revealVisible: boolean;
    }
  | {
      readonly kind: "failed";
      readonly request: RaceRequest;
      readonly course: Course;
      readonly snapshot: RaceSnapshot;
      readonly outcome: Extract<RaceOutcome, { readonly kind: "watchdog" }>;
    };
```

`src/app/App.tsx` owns composition and service lifecycle;
`src/app/createRaceSeed.ts` owns the injectable seed source. The state
transitions stay explicit:

- `CONFIRM_RACE`: normalize and save Roster/settings, generate a seed, assemble
  the Course, and enter `racing`.
- completed `RaceOutcome`: create and append one `CommittedRaceRecord`, retain
  the last snapshot and Course, enter `result` with the reveal hidden, then
  expose the reveal after the hold.
- watchdog `RaceOutcome`: enter `failed` without appending history.
- `RETRY_RACE`: reuse Roster and Selection Mode, generate a new seed and Course,
  and enter `racing`.
- `NEW_RACE` or `BACK_TO_SETUP`: cancel pending reveal work and enter `setup`.

React Strict Mode must not duplicate a commit, audio instance, finish sting, or
reveal timer. Terminal-outcome handling therefore needs an idempotence guard
keyed by the active race seed/session, and every timer/subscription requires
cleanup.

### Seed generation

Add a small injectable seed source that returns an unsigned 32-bit safe integer.
Production uses `crypto.getRandomValues`; tests inject deterministic values.
Continue using the tagged `course` and `start` streams below that root seed.
Do not use the current time or Roster content as random input.

### Framework boundaries

- React owns view composition and session transitions.
- R3F owns the Canvas subtree. Keep Course objects and request identities stable
  for the active session so React renders cannot reset physics.
- `raceStore` owns versioned durable data and remains unaware of React.
- `createRaceAudio` owns Web Audio and remains unaware of React/R3F. Adapt
  `RaceContactEvent` to its contact input at the application boundary, then
  remove the obsolete recording-era `RecordedContactEvent` type.
- Components consume immutable race contracts; they do not mutate or clone
  physics state for convenience.

## Screen composition

### Setup

`src/ui/SetupScreen.tsx` contains:

- product title and concise First/Last explanation;
- Roster textarea, normalized count, validation, and **Copy list**;
- First/Last segmented control;
- persistent shell audio toggle;
- primary **Start race** action.

Load the saved Roster and Selection Mode on application initialization. Save
normalized Roster edits and Selection Mode through the existing store contract;
starting still requires an explicit valid form submission.

### Broadcast race

`src/ui/BroadcastRace.tsx` owns the Canvas/broadcast composition and
`src/ui/Standings.tsx` owns the standings presentation.

The desktop composition uses three visual layers:

1. A header with Selection Mode, elapsed simulation time, seed, and audio
   control.
2. A full racing viewport with a third-person decisive chase camera. It follows the
   local Course tangent, keeps the decisive marble low in frame, and shows the
   upcoming Course rather than using a fixed Board direction.
3. An overlaid side rail containing the standings panel and existing whole-Board
   minimap. The side rail scrolls its 1–15-row standings internally; it never
   reduces the Course to a secondary preview.

The Course Canvas composes `CourseScene`, `LiveRace`, and `DecisiveCamera` over
the same memoized `Course` and `RaceRequest`. The page owns the latest snapshot
for DOM overlays; it does not feed derived standings state back into physics.

### Standings

Rows follow `RaceSnapshot.ranking`. For each marble, render:

- one-based current position;
- the existing stable marble style and Roster name;
- a text/icon decisive marker, not color alone;
- checkpoint progress as `passed + 1` out of `course.checkpoints.length`;
- the latest non-null split formatted from simulation seconds.

Before the first snapshot, preserve Roster order and show pending values. At a
completed outcome, render `finalRanking`; finished marbles without every split
must not receive fabricated times. Limit DOM updates to the snapshot cadence
already emitted by `LiveRace`; do not introduce a separate animation-frame
subscription for the chrome.

### Result and failure

`src/ui/ResultPanel.tsx` owns completed-result content and
`src/ui/WatchdogPanel.tsx` owns the non-result failure content.

The result panel overlays the frozen last snapshot and includes:

- Result Label and selected name/style;
- seed, Selection Mode, and elapsed simulation time;
- observed finish order/final ranking;
- **New race**.

The watchdog panel replaces the result content without calling it a result. It
includes the seed, elapsed time, unfinished names, **Retry race**, and **Back to
setup**. The frozen Course may remain visible behind it, but watchdog data never
enters history.

## Audio lifecycle

Create one `RaceAudio` instance for the mounted application and dispose it on
unmount. The visible toggle is the only operation allowed to call
`setMuted(false)`, preserving the browser gesture requirement.

`src/ui/AudioToggle.tsx` renders that control; `src/app/App.tsx` owns its state
and service calls.

- Forward live contact events only while the active session is racing.
- Play one finish sting for a completed outcome.
- Play no finish sting for watchdog outcomes.
- Muting takes effect immediately in every application state.
- Do not persist mute state or initialize Web Audio before a user gesture.

## Visual system

- Replace the warm arcade CSS with a coherent dark broadcast shell.
- Bundle DM Mono through the application build rather than a runtime font CDN;
  use a system monospace fallback.
- Use `#d8ff42` as an accent, never as the sole decisive/result signal.
- Preserve the existing colorblind-safe marble identities and pair color with
  labels/markers.
- Render every marble with its stable two-color striped skin in the Course,
  minimap, standings, result, and setup decoration instead of a solid-color
  surface.
- Keep the Course visually dominant. Chrome may overlay unused edges but must
  not shrink the 3D viewport into a secondary preview.
- Keep the wide setup screen within one viewport below the fixed application
  header by compacting vertical spacing, using a bounded Roster input, and
  placing Selection and Camera option groups in one settings row. Narrow
  layouts may stack and scroll rather than clip controls.
- UI transitions may animate opacity/transform; the frozen Course and result
  content remain usable when `prefers-reduced-motion` disables those effects.

At a wide 16:9 viewport, the Course fills the racing viewport and the standings
sit in an overlaid side rail, with the minimap as secondary rail content. Below
the layout breakpoint, place the Course first and stack standings/minimap
beneath it. Avoid horizontal scrolling at the supported 1-15 Roster range.

## Entry points and cleanup

- `src/main.tsx` mounts the production `App`.
- Add `showcase.html` and `src/dev/showcase.tsx` as the dedicated Showcase entry
  instead of using `index.html` as the Showcase route.
- Keep `course.html` and its current development entry.
- Update Vite multi-page inputs and dependency optimization entries for app,
  Showcase, and Course pages. Preserve the relative production asset base.
- Delete the imperative `src/ui/createSetupView.ts` and
  `src/ui/createResultDialog.ts` plus their superseded tests after React parity
  exists.
- Remove legacy warm-arcade CSS that no surviving entry imports.
- Remove any remaining root `ui-variant-*.html` explorations. Historical specs
  and `../2026-08-24-marble-race-picker/prototypes/first-look.html` remain
  documentation, not production inputs.

## Test strategy

Add React Testing Library and `user-event` as development dependencies. Prefer
behavioral component/integration tests over snapshots.

### Pure/session coverage

- reducer transitions and rejection of stale/duplicate terminal outcomes;
- deterministic injected seed generation and retry seed replacement;
- completed outcome -> exactly one committed record;
- watchdog outcome -> zero committed records;
- refresh initialization -> saved Roster/Selection Mode and setup state;
- interrupted session -> no persisted in-progress state.

### React coverage

- setup normalization, validation, duplicate-name preservation, copy behavior,
  saved settings, and confirmation;
- all 15 standings rows, ranking order, decisive marker, checkpoint text, latest
  split formatting, and completed final order;
- shell-level audio toggle behavior across screen transitions;
- completed reveal delay with fake timers, single finish sting, and **New
  race**;
- watchdog seed/unfinished-name details and both recovery actions;
- Strict Mode does not double-commit, double-play, or leak timers/listeners.

Mock the R3F/live-race boundary in application tests. Existing Course and race
tests remain responsible for physics; DOM tests must not run the solver.

### Routing and build coverage

- production `index.html` resolves to the React picker;
- `showcase.html` and `course.html` remain build inputs;
- built assets use relative URLs suitable for the repository Pages subpath;
- no production entry imports removed imperative views or legacy CSS.

## Acceptance criteria

- A fresh production load opens the React setup screen, never the Showcase.
- A valid 1-15-name Roster starts one live seeded Course in either Selection
  Mode.
- The decisive camera, minimap, standings order, checkpoint progress, split
  time, and decisive marker update from the same immutable snapshot.
- `first` completes and commits the first finite Finish crossing; `last`
  continues until and commits the final crossing.
- Completion freezes immediately, commits once, plays at most one finish sting,
  then reveals the result after the hold.
- A watchdog commits nothing and offers new-seed retry or return to setup.
- Roster and Selection Mode survive reload; audio and active races do not.
- The same seed, Roster size, and Selection Mode reproduce Course/start/outcome
  behavior regardless of Roster names.
- Setup, broadcast, failure, and result remain usable at wide desktop and narrow
  viewports without horizontal overflow.
- `index.html`, `showcase.html`, and `course.html` build under the relative Vite
  base, and the deployed Pages URL works directly and after refresh.

## Review checklist

- Paste 1, 5, and 15-name Rosters, including duplicate names, and verify setup
  validation/copy behavior.
- Run both Selection Modes and compare the decisive camera, minimap marker,
  standings, split display, and terminal selection.
- Verify a fresh load is silent; enable/mute audio before and during a race and
  confirm collision/finish behavior.
- Complete a race, confirm the frozen finish hold and result details, reload,
  and verify only Roster/Selection Mode/history persisted.
- Trigger or inject a watchdog outcome and verify no result is committed.
- Exercise desktop and narrow layouts, then open all three built entry points.
- Open the deployed GitHub Pages URL directly and after refresh.

## Out of scope

- Module, Board, Course, minimap, or physics tuning beyond integration defects
  exposed by this spec.
- A history browser, replay UI, seed editor in production, or resume-after-
  refresh behavior.
- Multiple Boards, Course editing/sharing, duration controls, accounts,
  backend persistence, networked Roster sync, or multi-viewer state.
- A separate mobile design, spectator controls, commentary, wagering, or
  analytics.
