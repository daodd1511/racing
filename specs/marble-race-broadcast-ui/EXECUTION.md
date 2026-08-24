# Broadcast UI — Execution Plan

Spec: [PLAN.md](PLAN.md). Rulebook: `specs/RULEBOOK.md`.
Integration branch: `main`. Branch model: stacked via `gh stack` (default).

## STATUS

- Current phase: 4 — in-progress
- Phase 1 — React shell and setup: done
- Phase 2 — Live broadcast race: done
- Phase 3 — Terminal outcomes and audio: done
- Phase 4 — Production routing and release: in-progress
- Verification debt: none

## Phase 1 — React shell and setup

Branch: `marble-race-broadcast-ui/phase-1-react-shell` (stacked bootstrap: `gh stack init --base main marble-race-broadcast-ui/phase-1-react-shell`; later phases: `gh stack add`)

Establish the typed application/session boundary that every live and terminal screen consumes.

Consumes: `createRaceStore(storage: Storage): RaceStore`; `createRaceAudio(): RaceAudio`; `assembleCourse(seed: number): Course`; `PickerStateV1`; `RaceRequest`; `CommittedRaceRecord`.
Produces: `AppSession`; `AppAction`; `createInitialSession(state: PickerStateV1): AppSession`; `reduceSession(session: AppSession, action: AppAction): AppSession`; `RaceSeedSource`; `createRaceSeed(): number`; `App`; `SetupScreen`; `AudioToggle`.

Fresh review: not required

- [x] Add `@testing-library/react`, `@testing-library/user-event`, and bundled DM Mono packages in `package.json`/`pnpm-lock.yaml`; keep browser runtime free of font-CDN requests.
- [x] Add `src/app/createRaceSeed.ts` and `src/app/createRaceSeed.test.ts` with exported `type RaceSeedSource = () => number` and `createRaceSeed(): number`, using `crypto.getRandomValues` to return an unsigned 32-bit seed and allowing deterministic injection in consumers.
- [x] Add `src/app/session.ts` and `src/app/session.test.ts` with the PLAN.md `AppSession` union, explicit setup/racing/result/failed actions, immutable transitions, stale terminal-outcome rejection, and new-seed retry behavior.
- [x] Add `src/ui/SetupScreen.tsx`, `src/ui/SetupScreen.test.tsx`, `src/ui/AudioToggle.tsx`, and `src/ui/AudioToggle.test.tsx` for 1-15 normalized entries, duplicate-name preservation, saved First/Last selection, Clipboard copy, form confirmation, and the shell-owned mute control.
- [x] Add `src/app/App.tsx` and `src/app/App.test.tsx`: load `PickerStateV1`, own store/audio/seed dependencies with Strict Mode-safe cleanup, persist normalized Roster and Selection Mode, compose the setup state, and enter a memoized seeded `RaceRequest`/`Course` session on confirmation.
- [x] Replace the warm setup rules in `src/styles/app.css` with the initial dark broadcast shell and bundled DM Mono typography used by the React setup screen.
- [x] Format phase-owned files and resolve workspace lint findings attributable to this phase. `pnpm lint` reports only the pre-existing `src/course/assembleCourse.test.ts:47` redundant-spread error (commit `9d6a25c`); Phase 1 files have no findings.

**Phase gate (hard):**
- [x] `pnpm typecheck`
- [x] `pnpm exec vitest related --run src/app/App.tsx src/app/App.test.tsx src/app/createRaceSeed.ts src/app/createRaceSeed.test.ts src/app/session.ts src/app/session.test.ts src/styles/app.css src/ui/AudioToggle.tsx src/ui/AudioToggle.test.tsx src/ui/SetupScreen.tsx src/ui/SetupScreen.test.tsx` (5 files, 16 tests passed)

**Review checklist (user, at PR review):**
- [ ] Open the setup screen at wide and narrow widths; paste 1, 5, and 15-name Rosters including duplicates, verify validation/count/copy, switch First/Last, toggle audio, and confirm a race request.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 2 — Live broadcast race

Branch: `marble-race-broadcast-ui/phase-2-live-broadcast` (stacked: `gh stack add`)

Compose the stable live Course once, then project its immutable snapshots into the broadcast UI.

Consumes: `App`; `AppSession`; `RaceRequest`; `Course`; `LiveRace`; `RaceSnapshot`; `RaceOutcome`; `CourseScene`; `DecisiveCamera`; `CourseMinimap`; `createMarbleStyles(count: number): readonly MarbleStyle[]`.
Produces: `BroadcastRace`; `Standings`; `formatRaceTime(seconds: number): string`; live snapshot/outcome callbacks consumed by Phase 3.

Fresh review: not required

- [x] Add `src/ui/Standings.tsx` and `src/ui/Standings.test.tsx`: render all 1-15 rows from snapshot ranking, stable marble identity/name, non-color decisive marker, checkpoint progress, latest non-null split, pending values before the first snapshot, and terminal `finalRanking` without fabricated times.
- [x] Add `src/ui/BroadcastRace.tsx` and `src/ui/BroadcastRace.test.tsx`: compose one R3F Canvas containing `LiveRace`, `CourseScene`, and `DecisiveCamera`, plus the same-snapshot `CourseMinimap` and `Standings`; keep active `Course`/`RaceRequest` identity stable across DOM updates and mock the solver boundary in DOM tests.
- [x] (amended 2026-08-23) Extend `src/app/session.ts` and `src/app/session.test.ts` to retain the immutable active-race `RaceSnapshot` from a seed-bound snapshot action and reject stale snapshot events.
- [x] Extend `src/app/App.tsx` and `src/app/App.test.tsx` to render the racing session, retain its latest immutable snapshot, forward contact/outcome callbacks without deriving physics progress, and keep the shell audio toggle visible.
- [x] Extend `src/styles/app.css` with the dominant Course viewport, header telemetry, minimap, compact 15-row standings, decisive marker, and simulation-time/split formatting presentation.
- [x] Format phase-owned files and resolve workspace lint findings attributable to this phase. `pnpm lint` reports only the pre-existing `src/course/assembleCourse.test.ts:47` redundant-spread error (commit `9d6a25c`) and warnings in unmodified solver/render files; Phase 2 files have no findings.

**Phase gate (hard):**
- [x] `pnpm typecheck`
- [x] `pnpm exec vitest related --run specs/marble-race-broadcast-ui/EXECUTION.md src/app/App.test.tsx src/app/App.tsx src/app/session.test.ts src/app/session.ts src/styles/app.css src/ui/BroadcastRace.test.tsx src/ui/BroadcastRace.tsx src/ui/Standings.test.tsx src/ui/Standings.tsx` (4 files, 19 tests passed)

**Review checklist (user, at PR review):**
- [ ] Run 5- and 15-marble races in First and Last modes; compare the decisive camera, minimap marker, standings order, checkpoint progress, and latest split throughout each race.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 3 — Terminal outcomes and audio

Branch: `marble-race-broadcast-ui/phase-3-terminal-outcomes` (stacked: `gh stack add`)

Own the irreversible completed-record append and all recoverable terminal behavior at one idempotent boundary.

Consumes: `App`; `AppSession`; `RaceOutcome`; `RaceSnapshot`; `RaceStore.appendCommittedRace(record: CommittedRaceRecord): PickerStateV1`; `RaceAudio`; `DEFAULT_RACE_CONFIG.resultLabel`; live callbacks from `BroadcastRace`.
Produces: `RaceAudioContact`; updated `RaceAudio.playContact(event: RaceAudioContact): void`; `ResultPanel`; `WatchdogPanel`; completed-result and watchdog recovery flows.

Fresh review: required — terminal-outcome idempotence protects durable local race-history writes; completed 2026-08-23 with no P0-P2 findings.

- [x] Update `src/audio/createRaceAudio.ts` and `src/audio/createRaceAudio.test.ts` to accept exported `RaceAudioContact { readonly impulse: number }`, forward live contacts, retain gesture-gated default mute/contact throttling, play one completed finish sting, and dispose deterministically.
- [x] Remove `RecordedContactEvent` from `src/race/types.ts` and update every surviving consumer/test to the live audio contract.
- [x] Add `src/ui/ResultPanel.tsx` and `src/ui/ResultPanel.test.tsx` with configured Result Label, selected name/style, seed, Selection Mode, elapsed simulation time, observed final order, and **New race**.
- [x] Add `src/ui/WatchdogPanel.tsx` and `src/ui/WatchdogPanel.test.tsx` with seed, elapsed time, unfinished names, **Retry race** using a new seed, and **Back to setup**, with no result language or history append.
- [x] (amended 2026-08-23) Update `src/race/CoursePhysics.tsx` and add `src/race/CoursePhysics.test.tsx` so the terminal snapshot reaches consumers before its terminal outcome.
- [x] (amended 2026-08-23) Extend `src/ui/BroadcastRace.tsx` and `src/ui/BroadcastRace.test.tsx` with a frozen terminal Course view that renders the retained snapshot without mounting `LiveRace`.
- [x] (amended 2026-08-23) Update the `CoursePhysics` effect dependencies in `src/race/CoursePhysics.tsx` so its lifecycle reflects the stable `RaceRequest` identity without a lint warning.
- [x] Extend `src/app/App.tsx`, `src/app/session.ts`, and their tests to retain the frozen terminal Course/snapshot, append exactly one completed record before the reveal timer, play exactly one finish sting, reveal after 800 ms, cancel timers on navigation/unmount, reject duplicate/stale outcomes, and never persist an active or watchdog session.
- [x] Extend `src/styles/app.css` with frozen-finish, result, and watchdog overlays plus a `prefers-reduced-motion` fallback that preserves all content/actions.
- [x] Format phase-owned files and resolve workspace lint findings attributable to this phase. `pnpm lint` reports only the pre-existing `src/course/assembleCourse.test.ts:47` redundant-spread error (commit `9d6a25c`) and warnings in unmodified render files; Phase 3 files have no findings.

**Phase gate (hard):**
- [x] `pnpm typecheck`
- [x] `pnpm exec vitest related --run specs/marble-race-broadcast-ui/EXECUTION.md src/app/App.test.tsx src/app/App.tsx src/app/session.test.ts src/audio/createRaceAudio.test.ts src/audio/createRaceAudio.ts src/race/CoursePhysics.test.tsx src/race/CoursePhysics.tsx src/race/types.ts src/styles/app.css src/ui/BroadcastRace.test.tsx src/ui/BroadcastRace.tsx src/ui/ResultPanel.test.tsx src/ui/ResultPanel.tsx src/ui/WatchdogPanel.test.tsx src/ui/WatchdogPanel.tsx` (8 files, 30 tests passed)

**Review checklist (user, at PR review):**
- [ ] Complete First and Last races and verify immediate freeze, one finish sting, delayed reveal, one history record, result details, and **New race**; inject a watchdog and verify no record plus both recovery actions.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 4 — Production routing and release

Branch: `marble-race-broadcast-ui/phase-4-production-release` (stacked: `gh stack add`)

Promote the completed React picker to production while preserving both development harnesses and the Pages build.

Consumes: `App`; `SetupScreen`; `BroadcastRace`; `ResultPanel`; `WatchdogPanel`; `Showcase`; `CoursePreview`.
Produces: production `index.html`/`src/main.tsx`; development `showcase.html`/`src/dev/showcase.tsx`; three-entry relative-base Vite build.

Fresh review: required — the camera behavior required two correction attempts; initial review and re-review completed 2026-08-23, and the final P2 test gap was corrected after user direction once the review cap was reached

- [x] Update `src/main.tsx` and `index.html` so the production entry mounts `App` in React Strict Mode with no Showcase import or inline legacy presentation.
- [x] Add `showcase.html` and `src/dev/showcase.tsx` for the existing React `Showcase`; keep `course.html`/`src/dev/coursePreview.tsx` as the Course review harness.
- [x] Update `vite.config.ts` and routing/build coverage so `index.html`, `showcase.html`, and `course.html` are named inputs and optimized entries under the existing relative asset base.
- [x] (amended 2026-08-23) Keep build-entry coverage in `src/` without importing the root Vite config, so the composite TypeScript project remains closed.
- [x] Finish `src/styles/app.css` responsive behavior: wide 16:9 Course-first composition, narrow Course/standings/minimap stack, usable 1-15 Roster screens, and no horizontal overflow.
- [x] (amended 2026-08-23) Update `src/styles/app.css` so the live and frozen Course fill the racing viewport, while an overlaid side rail keeps the minimap and internally scrolling 1–15-row standings visible without shrinking the Course.
- [x] (amended 2026-08-23) Update `src/race/DecisiveCamera.tsx`, `src/race/cameraTarget.ts`, and their tests so the camera smoothly follows the same decisive marble used by the standings/minimap rather than holding a side-of-track view.
- [x] (amended 2026-08-23) Correct `src/race/DecisiveCamera.tsx` and `src/race/DecisiveCamera.test.tsx` to keep a north-up camera directly above the decisive marble, smooth its planar follow, and verify the view axis points straight down instead of trailing beside the Course. Confirmed in the live production entry with a 15-marble race.
- [x] (amended 2026-08-23) Correct `src/race/DecisiveCamera.tsx` and `src/race/DecisiveCamera.test.tsx` to use an elevated third-person chase view above the track and behind the decisive marble, keep a stable downhill Course heading that cannot amplify physics jitter, and verify a meaningful trail plus a dominant downward and smaller nonzero depth component. A live 15-marble race confirmed stable framing through leader changes.
- [x] (amended 2026-08-23) Correct the elevated camera to use the Course's Z-up coordinate system, preventing the near-parallel camera-up/view basis from rolling or dropping the Course out of frame. A fresh 15-marble race kept the Course and decisive pack visible through later checkpoints.
- [x] (amended 2026-08-23) Add `src/course/render/raceVisuals.ts` and coverage, then update `CourseScene.tsx` to omit connector roof and governor-ceiling visuals from live/frozen race presentation while preserving all Course colliders and exposed track/axle visuals. Live browser verification confirmed an open sightline while retaining the channel and marbles.
- [x] Delete superseded `src/ui/createSetupView.ts`, `src/ui/createSetupView.test.ts`, `src/ui/createResultDialog.ts`, and `src/ui/createResultDialog.test.ts`; remove unreferenced warm-arcade rules/assets and any root `ui-variant-*.html` files while retaining historical files under `specs/`.
- [x] Update `README.md` with the production React flow, development entry URLs, current live Course behavior, persistence/audio/watchdog semantics, and GitHub Pages verification steps.
- [x] Format phase-owned files and resolve workspace lint findings attributable to this phase. `pnpm lint` reports only the pre-existing `src/course/assembleCourse.test.ts:47` redundant-spread error (commit `9d6a25c`) and warnings in unmodified `src/modules/render/ModuleColliders.tsx`; Phase 4 files have no findings.
- [x] (amended 2026-08-23) Format the follow-camera additions and confirm `pnpm lint` has no findings attributable to the amended work. `pnpm lint` still reports only the pre-existing `src/course/assembleCourse.test.ts:47` error and unmodified `src/modules/render/ModuleColliders.tsx` warnings.
- [x] (amended 2026-08-24) Reframe `src/race/DecisiveCamera.tsx` and its tests as a higher three-quarter chase camera above and behind the snapshot's mode-aware decisive marble, keeping the marble pack and Course surface legible without reverting to a straight overhead view.
- [x] (amended 2026-08-24) Update `src/ui/BroadcastRace.tsx`, `src/ui/Standings.tsx`, their tests, and `src/styles/app.css` with a delayed 3-2-1-GO start, mode-aware tracking HUD, and playful arcade-broadcast presentation that keeps the Course dominant and remains usable at wide and narrow widths.
- [x] (amended 2026-08-24) Slow only live wall-clock playback in `src/race/CoursePhysics.tsx` with explicit coverage, preserving fixed-step simulation time, deterministic outcomes, and the 120-second simulation watchdog.
- [x] (amended 2026-08-24) Make `src/race/CoursePhysics.tsx` share one Rapier initialization promise across React Strict Mode effect remounts, with regression coverage for the browser-observed invalid-handle WASM failure after the countdown gate.
- [x] (amended 2026-08-24) Bundle the display face used by the restored game visual system through `package.json`/`pnpm-lock.yaml`, then format and lint all amended files. Targeted `oxlint` and `oxfmt --check` passed; workspace lint retains only the recorded pre-existing findings.
- [x] (amended 2026-08-24) Update `src/course/stepCourse.ts` and `src/modules/divergence.test.ts` so the accumulated final-spec parity gate independently includes rotating connector transforms and collider bodies added earlier in Phase 4.
- [x] (amended 2026-08-24) Replace the fixed Board-axis framing in `src/race/DecisiveCamera.tsx` and `src/race/cameraTarget.ts` with a true third-person chase camera that sits behind the mode-aware decisive marble on the local Course tangent, stays elevated, and looks forward down the Course; extend the race-only visibility rule in `src/course/render/raceVisuals.ts` to omit occluding connector walls without changing physics, update all consumers, and verify First/Last behavior in the browser. Clean 15-marble First and Last runs showed the leader/trailer pack from above and behind with the upcoming Course visible; a later Last-mode turn retained the Course sightline.
- [ ] (amended 2026-08-24) Add independent frame-rate-independent damping for decisive-target changes, Course heading, camera position, and look-at position in `src/race/DecisiveCamera.tsx`; add a setup-controlled `CameraMode` with the existing elevated Broadcast view and a low, zero-trail, wider-FOV Close up view positioned at the decisive marble's exact planar coordinates, threading it through `src/ui/SetupScreen.tsx`, `src/app/App.tsx`, and live/frozen `src/ui/BroadcastRace.tsx`; replace exposed segmented connector visuals in `src/course/render/raceVisuals.ts` with a continuous swept race floor and low continuous rails; replace straight connector floor cuboids in `src/course/connectors.ts` with one top-face-aligned swept collider that preserves exact Module anchor vertices, overlaps beyond them along the anchor tangents, and uses enough straight-link samples to remove collision lips and coarse slope facets; use eight standard-width production columns in `src/course/board.ts` to provide smooth separation for additional obstacles without stretching obstacle geometry or increasing track grade; separate Course tuning from Showcase tuning in `src/course/courseModules.ts`, use one gentle Course grade, distribute hairpin descent by actual curve distance with an approximately 10% maximum average grade, enlarge the default Diamond pin field to ten tightly staggered rows with larger posts and alternating four-post rows shifted toward opposite rails so no straight empty lane crosses the field, retain more than one marble diameter at each rail to prevent pinch points, and use round physics posts matching the visible diamonds' outer radius to prevent stable flat-face locks, extend Course Whoops to 1.8 m with a one-marble-diameter crest-to-trough wave, extend the Course Staircase to eight 0.16 m treads with two-marble-radius rises, give the 1.8 m Course Funnel a long 1.15 m converging entry followed by a 0.35 m three-marble-wide straight passage and a short 0.25 m exit flare, use the original four Course Windmill blades rotating at 1.8 rad/s, place ten obstacle sections across `src/course/arc.ts`—three Diamond fields, two Whoops sections, one Staircase, two Funnel chokes, and two Windmills—with a plain Chute between every pair and at the start of every post-turn row, shuffle that fixed inventory through a dedicated deterministic race-seed substream, size `src/course/board.ts` for any resulting order, and keep Vortex bowl, Rumble strip, and Friction lanes out of production races while retaining them in Showcase. User will run browser and physics verification directly; do not run automated verification in this iteration.

**Phase gate (hard):**
- [x] `pnpm typecheck`
- [x] `pnpm exec vitest related --run README.md index.html showcase.html specs/marble-race-broadcast-ui/EXECUTION.md specs/marble-race-broadcast-ui/PLAN.md src/dev/buildEntries.test.ts src/dev/coursePreview.test.tsx src/dev/showcase.tsx src/main.tsx src/race/DecisiveCamera.test.tsx src/race/DecisiveCamera.tsx src/race/cameraTarget.test.ts src/race/cameraTarget.ts src/styles/app.css vite.config.ts` (6 files, 20 tests passed)
- [x] (amended 2026-08-23) Re-run the Phase 4 typecheck and dependency-aware tests after the overhead-camera correction (`pnpm typecheck`; 6 files and 20 tests passed).
- [x] (amended 2026-08-23) Re-run the Phase 4 typecheck and dependency-aware tests after stabilizing the third-person camera (`pnpm typecheck`; 6 files and 21 tests passed).
- [x] (amended 2026-08-23) Re-run the Phase 4 typecheck and dependency-aware tests after opening the elevated camera sightline (`pnpm typecheck`; 7 files and 23 tests passed).
- [ ] (amended 2026-08-24) Re-run `pnpm typecheck` and dependency-aware tests for the camera, broadcast UI, live pacing, styling, and dependency changes after browser verification. Typecheck and 31 focused amended tests pass; the package-level dependency run reaches the full suite and remains blocked by `src/validator/courseValidation.test.ts` reporting 5 stalled marbles and 4 watchdogs across 1,200 headless marbles.
- [x] (amended 2026-08-24) Re-run the camera-correction phase gate: `pnpm typecheck`; `pnpm exec vitest related --run src/race/cameraTarget.ts src/race/cameraTarget.test.ts src/race/DecisiveCamera.tsx src/race/DecisiveCamera.test.tsx src/course/render/raceVisuals.ts src/course/render/raceVisuals.test.ts src/ui/BroadcastRace.tsx src/dev/coursePreview.tsx` (6 files, 24 tests passed); targeted `oxlint` and `git diff --check` passed.

**Review checklist (user, at PR review):**
- [ ] Open built production, Showcase, and Course pages; complete First/Last races at wide and narrow widths, refresh each URL, then confirm the deployed GitHub Pages production URL loads directly and after refresh.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Spec gate (hard — once, before the final phase's PR)

- [ ] `pnpm test`
- [x] `pnpm build`
- [x] (amended 2026-08-23) Re-run `pnpm build` after the overhead-camera correction.
- [x] (amended 2026-08-23) Re-run `pnpm build` after stabilizing the third-person camera.
- [x] (amended 2026-08-23) Re-run `pnpm build` after opening the elevated camera sightline.
- [x] (amended 2026-08-24) Re-run `pnpm build` after the camera, game presentation, countdown, and pacing amendments.
- [ ] (amended 2026-08-24) Re-run `pnpm test` after the camera, game presentation, countdown, and pacing amendments. A serial substitute run with a 15-second timeout passes 253 of 254 tests; `src/validator/courseValidation.test.ts` retains the same headless Course invariant failure above.
