# Broadcast UI — Execution Plan

Spec: [PLAN.md](PLAN.md). Rulebook: `specs/RULEBOOK.md`.
Integration branch: `main`. Branch model: stacked via `gh stack` (default).

## STATUS

- Current phase: 3 — in-progress
- Phase 1 — React shell and setup: done
- Phase 2 — Live broadcast race: done
- Phase 3 — Terminal outcomes and audio: in-progress
- Phase 4 — Production routing and release: pending
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

Fresh review: required — terminal-outcome idempotence protects durable local race-history writes

- [x] Update `src/audio/createRaceAudio.ts` and `src/audio/createRaceAudio.test.ts` to accept exported `RaceAudioContact { readonly impulse: number }`, forward live contacts, retain gesture-gated default mute/contact throttling, play one completed finish sting, and dispose deterministically.
- [x] Remove `RecordedContactEvent` from `src/race/types.ts` and update every surviving consumer/test to the live audio contract.
- [x] Add `src/ui/ResultPanel.tsx` and `src/ui/ResultPanel.test.tsx` with configured Result Label, selected name/style, seed, Selection Mode, elapsed simulation time, observed final order, and **New race**.
- [x] Add `src/ui/WatchdogPanel.tsx` and `src/ui/WatchdogPanel.test.tsx` with seed, elapsed time, unfinished names, **Retry race** using a new seed, and **Back to setup**, with no result language or history append.
- [ ] Extend `src/app/App.tsx`, `src/app/session.ts`, and their tests to retain the frozen terminal Course/snapshot, append exactly one completed record before the reveal timer, play exactly one finish sting, reveal after 800 ms, cancel timers on navigation/unmount, reject duplicate/stale outcomes, and never persist an active or watchdog session.
- [ ] Extend `src/styles/app.css` with frozen-finish, result, and watchdog overlays plus a `prefers-reduced-motion` fallback that preserves all content/actions.
- [ ] Format phase-owned files and resolve workspace lint findings attributable to this phase.

**Phase gate (hard):**
- [ ] `pnpm typecheck`
- [ ] `pnpm exec vitest related --run <changed files from this phase diff>`

**Review checklist (user, at PR review):**
- [ ] Complete First and Last races and verify immediate freeze, one finish sting, delayed reveal, one history record, result details, and **New race**; inject a watchdog and verify no record plus both recovery actions.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 4 — Production routing and release

Branch: `marble-race-broadcast-ui/phase-4-production-release` (stacked: `gh stack add`)

Promote the completed React picker to production while preserving both development harnesses and the Pages build.

Consumes: `App`; `SetupScreen`; `BroadcastRace`; `ResultPanel`; `WatchdogPanel`; `Showcase`; `CoursePreview`.
Produces: production `index.html`/`src/main.tsx`; development `showcase.html`/`src/dev/showcase.tsx`; three-entry relative-base Vite build.

Fresh review: not required

- [ ] Update `src/main.tsx` and `index.html` so the production entry mounts `App` in React Strict Mode with no Showcase import or inline legacy presentation.
- [ ] Add `showcase.html` and `src/dev/showcase.tsx` for the existing React `Showcase`; keep `course.html`/`src/dev/coursePreview.tsx` as the Course review harness.
- [ ] Update `vite.config.ts` and routing/build coverage so `index.html`, `showcase.html`, and `course.html` are named inputs and optimized entries under the existing relative asset base.
- [ ] Finish `src/styles/app.css` responsive behavior: wide 16:9 Course-first composition, narrow Course/standings/minimap stack, usable 1-15 Roster screens, and no horizontal overflow.
- [ ] Delete superseded `src/ui/createSetupView.ts`, `src/ui/createSetupView.test.ts`, `src/ui/createResultDialog.ts`, and `src/ui/createResultDialog.test.ts`; remove unreferenced warm-arcade rules/assets and any root `ui-variant-*.html` files while retaining historical files under `specs/`.
- [ ] Update `README.md` with the production React flow, development entry URLs, current live Course behavior, persistence/audio/watchdog semantics, and GitHub Pages verification steps.
- [ ] Format phase-owned files and resolve workspace lint findings attributable to this phase.

**Phase gate (hard):**
- [ ] `pnpm typecheck`
- [ ] `pnpm exec vitest related --run <changed files from this phase diff>`

**Review checklist (user, at PR review):**
- [ ] Open built production, Showcase, and Course pages; complete First/Last races at wide and narrow widths, refresh each URL, then confirm the deployed GitHub Pages production URL loads directly and after refresh.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Spec gate (hard — once, before the final phase's PR)

- [ ] `pnpm test`
- [ ] `pnpm build`
