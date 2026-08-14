# Marble Race Picker — Execution Plan

Spec: [PLAN.md](PLAN.md). Rulebook: `specs/RULEBOOK.md`.
Integration branch: `main`. Branch model: manual stack — GitHub reports stacked
PRs are disabled, so, at the user's request on 2026-08-12, each phase branches
from and opens its PR against its immediate predecessor without waiting for merge.

## STATUS

- Current phase: 6 — done (spec complete)
- Phase 1 — Simulation foundation: done
- Phase 2 — Race replay and tuning: done
- Phase 3 — Picker application and persistence: done
- Phase 4 — Race audio: done
- Phase 5 — Obstacle raceway refactor: done-with-debt
- Phase 6 — GitHub Pages deployment: done
- Verification debt: Phase 5's `0.05` sphere-to-surface gap enforcement
  (`src/simulation/trackStress.test.ts`, currently `0.6`) is deferred to
  `specs/raceway-obstacles/PLAN.md` Phase A — see that phase's open item.
  Further obstacle modules (splitter, chicane, narrowing gate) are out of this
  spec's scope entirely; tracked in `specs/raceway-obstacles/`, not here.

## Phase 1 — Simulation foundation

Branch: `marble-race-picker/phase-1-simulation-foundation` (manual-stack bottom: off `main`)

Establish the typed recording contract, parametric track, and headless physics layer that every visible feature consumes.

Produces: `SelectionMode`, `RaceRecording`, `CommittedRaceRecord`, `PickerSettingsV1`, `PickerStateV1`, `TrackDefinition`, `createTrackDefinition(config: TrackConfig): TrackDefinition`, `initializeRapier(): Promise<void>`, `simulateRace(roster: readonly string[], seed: number, mode: SelectionMode): RaceRecording | null`, and `simulateWithRetry(roster: readonly string[], mode: SelectionMode): RaceRecording`.

Fresh review: not required

- [x] Set `RACING_VITE_STAGING_DIR="$(mktemp -d)"`; run `pnpm create vite "$RACING_VITE_STAGING_DIR" --template vanilla-ts --no-interactive`; promote its `package.json`, `index.html`, `src/`, `public/`, and TypeScript configs to the repository root without overwriting `specs/`.
- [x] Run `pnpm install`, then adjust the Vite-generated `package.json` and TypeScript configs for Three.js, `@dimforge/rapier3d-compat`, Vitest, Oxlint, and Oxfmt; set `typecheck` to `tsc -b`, `test` to `vitest run`, `lint` to `oxlint src`, `format` to `oxfmt --write .`, and `format:check` to `oxfmt --check .`; commit the generated `pnpm-lock.yaml` and defer `vite.config.ts` to Phase 5.
- [x] Add `.prettierignore` so `oxfmt --check .` and `oxfmt --write .` exclude `specs/` while formatting production source and configuration files.
- [x] (amended 2026-08-12) Enable strict TypeScript checking in `tsconfig.json` before adding simulation contracts.
- [x] Implement the strict recording, settings, and persisted-record contracts in `src/race/types.ts` and defaults in `src/race/config.ts`.
- [x] Implement seeded randomness and unbiased person-to-slot shuffling in `src/race/random.ts` via `createSeededRandom()` and `shuffleStartSlots()`.
- [x] Implement helix, peg-field, funnel-pinch, and finish-basin descriptors in `src/track/definition.ts` and Rapier colliders in `src/track/colliders.ts`.
- [x] (amended 2026-08-12) Add `src/simulation/initializeRapier.ts` to initialize Rapier WASM once before the synchronous simulation APIs are called.
- [x] Implement fixed-step position, rotation, finish-crossing, and collision-event recording in `src/simulation/simulateRace.ts`; stop on the first crossing in `first` mode, the final crossing in `last` mode, and return `null` when the mode-specific target is unmet at 60 simulated seconds.
- [x] Implement invisible seed retries in `src/simulation/simulateWithRetry.ts` while preserving each accepted recording's seed.
- [x] Add deterministic contract coverage in `src/race/random.test.ts`, `src/track/definition.test.ts`, `src/simulation/simulateRace.test.ts`, and `src/simulation/simulateWithRetry.test.ts` for shuffled slots, both selection modes, recorded transforms/contact events, and mode-specific timeout retries.

**Phase gate (hard):**
- [x] `pnpm typecheck`
- [x] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] Inspect the fixed-seed fixtures and confirm `first` selects the earliest crossing while `last` selects the final crossing without assigning unfinished marbles a fabricated finish time.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 2 — Race replay and tuning

Branch: `marble-race-picker/phase-2-race-replay` (manual stack: on Phase 1)

Turn immutable recordings into the fixed-duration visual race, with a retained harness for the track's high-risk tuning work.

Consumes: `RaceRecording`, `TrackDefinition`, `DEFAULT_TRACK_CONFIG`, and `createTrackDefinition(config: TrackConfig): TrackDefinition`.
Produces: `MarbleStyle`, `RaceScene`, `ReplayCallbacks`, `ReplayController`, `RaceView`, `createRaceScene(canvas: HTMLCanvasElement, track: TrackDefinition, styles: readonly MarbleStyle[]): RaceScene`, `createReplayController(scene: RaceScene, recording: RaceRecording, callbacks: ReplayCallbacks): ReplayController`, and `createRaceView(root: HTMLElement, recording: RaceRecording): RaceView`.

Fresh review: not required

- [x] (amended 2026-08-12) Add `vite.config.ts` with development dependency-scan entries limited to `index.html` and `preview.html`, so the disposable `specs/` prototype does not participate; Phase 5 will add its Pages production settings to this file.
- [x] Implement colourblind-safe solid and patterned marble styles in `src/render/marbleStyles.ts` and track, marble, lighting, and camera rendering in `src/render/createRaceScene.ts`.
- [x] Implement immutable transform replay, a 30-second time-warp curve, final-approach slow motion, collision callbacks, cancellation, and disposal in `src/replay/createReplayController.ts`.
- [x] Implement the three-second named lineup, fixed name-to-style mapping, live positional leaderboard, canvas, and result handoff in `src/ui/createRaceView.ts` and `src/styles/race.css`, applying the warm arcade presentation selected in `ui-variant-2-arcade.html` without copying its placeholder course or CSS race motion.
- [x] Add `preview.html` and `src/dev/racePreview.ts` as a seed/mode/roster tuning harness that calls the production simulation and replay interfaces.
- [x] Tune `DEFAULT_TRACK_CONFIG` in `src/track/definition.ts` for short helix order-locking, peg-field lead changes, funnel rebunching, and successful 5- and 15-marble runs through both selection modes.
- [x] Add fake-clock replay coverage in `src/replay/createReplayController.test.ts`, style coverage in `src/render/marbleStyles.test.ts`, and representative fixed-seed completion coverage in `src/simulation/trackStress.test.ts`.

**Phase gate (hard):**
- [x] `pnpm typecheck`
- [x] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] Open `/preview.html` at 1080p with five names and confirm a three-second lineup, readable identity tracking, visible peg-field lead changes, funnel rebunching, final-approach slow motion, and result reveal at 30 seconds.
- [ ] Repeat with 15 names and confirm solid colours transition to readable patterns without floating labels or an unframeable camera view.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 3 — Picker application and persistence

Branch: `marble-race-picker/phase-3-picker-application` (manual stack: on Phase 2)

Compose the production roster, settings, race, committed-result, and visible rerun flow over the simulation and replay contracts.

Consumes: `SelectionMode`, `RaceRecording`, `CommittedRaceRecord`, `PickerSettingsV1`, `PickerStateV1`, `simulateWithRetry(roster: readonly string[], mode: SelectionMode): RaceRecording`, and `createRaceView(root: HTMLElement, recording: RaceRecording): RaceView`.
Produces: `RaceStore`, `SetupView`, `ResultDialog`, `AppController`, `createRaceStore(storage: Storage): RaceStore`, and `createApp(root: HTMLElement): AppController`.

Fresh review: not required

- [x] (amended 2026-08-12) Add `happy-dom` as a development dependency so the required setup, result, and controller DOM coverage runs in a browser-like Vitest environment.
- [x] Implement versioned `marble-race-picker` state loading, safe malformed-state fallback, roster/settings saves, and immutable committed-record appends in `src/storage/raceStore.ts`.
- [x] (amended 2026-08-12) Restrict `RaceView` in `src/ui/createRaceView.ts` to its completion handoff so `createResultDialog()` is the only production result reveal.
- [x] Implement `src/ui/createSetupView.ts` with newline parsing that trims empty lines, accepts 1–15 entries, preserves duplicate names as distinct marbles, persists the `first`/`last` setting, copies the normalized roster through `navigator.clipboard.writeText()`, and carries over the selected arcade-style roster controls and mode switches.
- [x] Implement `src/ui/createResultDialog.ts` with the `DEFAULT_RACE_CONFIG` label, selected name/style, seed, observed finish order, the selected ticket-like arcade reveal, and a `New race` action that returns to roster confirmation instead of rerunning immediately.
- [x] Compose simulate-first execution, race replay, commit-on-result, settings persistence, and lifecycle cleanup in `src/app/createApp.ts`, `src/main.ts`, `index.html`, and `src/styles/app.css`.
- [x] Add storage coverage in `src/storage/raceStore.test.ts`, setup/result DOM coverage in `src/ui/createSetupView.test.ts` and `src/ui/createResultDialog.test.ts`, and first/last end-to-end controller coverage in `src/app/createApp.test.ts`.

**Phase gate (hard):**
- [x] `pnpm typecheck`
- [x] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] In `first` mode, paste a roster, run the race, and confirm the first finisher ends playback and appears in the committed result with its seed.
- [ ] In `last` mode, confirm playback continues until the final finisher and that person appears in the committed result.
- [ ] Reload and confirm roster plus First/Last choice persist; use `Copy list`, then choose `New race` and confirm the roster must be reconfirmed before another run.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 4 — Race audio

Branch: `marble-race-picker/phase-4-race-audio` (manual stack: on Phase 3)

Add the deliberately last, user-gesture-gated audio layer without coupling sound generation to physics or rendering.

Consumes: `RecordedContactEvent`, `ReplayCallbacks`, and `createApp(root: HTMLElement): AppController`.
Produces: `RaceAudio` and `createRaceAudio(): RaceAudio`.

Fresh review: not required

- [x] (amended 2026-08-13) Add optional `RaceViewCallbacks` to `src/ui/createRaceView.ts` so its replay contact and completion events can be forwarded to audio without coupling `simulateRace()` to sound.
- [x] Implement `src/audio/createRaceAudio.ts` with lazy `AudioContext` creation, default-muted state, impact-impulse pitch/volume modulation, event throttling, finish sting, and deterministic disposal.
- [x] Add a prominent mute toggle to `src/ui/createSetupView.ts` and connect recorded contact events and selection completion to `RaceAudio` through `src/app/createApp.ts` replay callbacks.
- [x] Add mocked Web Audio coverage in `src/audio/createRaceAudio.test.ts` and app wiring coverage in `src/app/createApp.test.ts` for default silence, gesture activation, collision modulation, finish sting, and disposal.

**Phase gate (hard):**
- [x] `pnpm typecheck`
- [x] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] Confirm a fresh page load is silent, enabling audio from the visible toggle produces varied collision sounds plus one finish sting, muting takes effect immediately, and browser autoplay is never invoked before the gesture.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 5 — Obstacle raceway refactor

Branch: `marble-race-picker/phase-5-obstacle-raceway` (manual stack: on Phase 4)

Replace the rejected vertical tower with a progress-measured downhill raceway and mode-aware elevated chase camera.

Consumes: `SelectionMode`, `RaceRecording`, `MarbleTransform`, `TrackDefinition`, `simulateRace(roster: readonly string[], seed: number, mode: SelectionMode): RaceRecording | null`, `RaceScene`, `ReplayController`, and `RaceView`.
Produces: `TrackPathSample`, `measureTrackProgress(track: TrackDefinition, position: Vector3): number`, updated `TrackDefinition`, and `createRaceScene(canvas: HTMLCanvasElement, track: TrackDefinition, roster: readonly string[], styles: readonly MarbleStyle[], mode: SelectionMode): RaceScene`.

Fresh review: required — core simulation geometry, ranking, and camera behavior replace a rejected implementation.

- [x] Replace the vertical helix/funnel descriptors in `src/track/definition.ts` and their construction in `src/track/colliders.ts` with a wide start grid, banked S-curves, staggered bumper slalom, dual-route splitter/merge, chicane, narrowing gate, railed finish straight, sampled centreline, and unambiguous finish plane.
- [x] Add `src/track/progress.ts` with segment-projection cumulative progress, then update `src/simulation/simulateRace.ts` and `src/ui/createRaceView.ts` so finish detection, live ordering, and final ranking use centreline progress instead of world-space height.
- [x] Rebuild `src/render/createRaceScene.ts` with visible raceway bed, rails, exact collider-matched obstacles, finish markings, and an elevated damped chase camera that follows greatest progress in `first` mode or least progress in `last` mode with tangent look-ahead.
- [x] Update `src/ui/createRaceView.ts`, `src/styles/race.css`, and `src/dev/racePreview.ts` for a full-width course view, compact overlaid leaderboard, and retained seed/mode tuning controls without changing lineup or result-dialog behavior.
- [x] Tune `DEFAULT_TRACK_CONFIG` so 5- and 15-marble fixed-seed and retry runs complete inside 60 simulated seconds, remain contained, reach the lower obstacle modules, and demonstrate position changes across the bumper, splitter/merge, or chicane sections.
- [x] Replace vertical-course assertions in `src/track/definition.test.ts`, `src/simulation/simulateRace.test.ts`, and `src/simulation/trackStress.test.ts`; add `src/track/progress.test.ts` and camera-target coverage for projection, first-mode leader following, last-mode trailer following, smooth target changes, finish order, containment, and representative overtakes.
- [x] (amended 2026-08-13; superseded 2026-08-14) Replace launch-prone spherical bumpers in `src/track/definition.ts`, `src/track/colliders.ts`, and `src/render/createRaceScene.ts` with track-normal posts; retune marble, surface, rail, and obstacle materials plus start contact in `src/simulation/simulateRace.ts`; interpolate centreline sampling in `src/track/progress.ts`; and add coverage proving marbles stay grounded while obstacles still create overtakes. Posts shipped, then replaced by gates in the item below; further obstacle work moved to `specs/raceway-obstacles/PLAN.md`.
- [ ] (amended 2026-08-13, fresh-review correction; scope moved 2026-08-14) Enforce a maximum `0.05` sphere-to-surface gap in `src/simulation/trackStress.test.ts` (currently `0.6`; measured clearance against `main` is ~0.24–0.29 m, traced to contact with the `gate` boxes). Deferred to `specs/raceway-obstacles/PLAN.md` Phase A, which deletes those gates — tuning their contact physics before deletion is wasted work. Left open here as debt; closes when Phase A tightens the assertion and confirms the replacement obstacles don't reproduce the launch behavior.
- [x] (amended 2026-08-13; superseded 2026-08-14) Extend the raceway with further grounded obstacle modules; raise the launch speed while retaining containment and stable rolling; change replay presentation to one minute; replace all single-colour marble styles with distinctive patterned designs; and add camera-facing roster name tags that follow each marble in `src/track/definition.ts`, `src/simulation/simulateRace.ts`, `src/replay/createReplayController.ts`, `src/render/marbleStyles.ts`, `src/render/createRaceScene.ts`, `src/ui/createRaceView.ts`, and their coverage. Patterned marble styles and name tags shipped; launch speed and fixed one-minute replay timing were both reversed by the item below; further obstacle modules moved to `specs/raceway-obstacles/PLAN.md`.
- [x] (amended 2026-08-13) Remove artificial launch velocity, movement recovery, containment correction, and fixed one-minute replay timing from `src/simulation/simulateRace.ts` and `src/replay/createReplayController.ts`; use a longer, steeper, grounded track and low-profile deflectors in `src/track/definition.ts` so gravity and collisions alone produce the race duration and speed; raise the physical safety ceiling in `src/race/config.ts`; and update physics and replay coverage accordingly.
- [x] (amended 2026-08-13; superseded 2026-08-14) Replace the launch-prone track-normal slalom posts with tall angled deflector gates and a tall splitter divider in `src/track/definition.ts`, `src/track/colliders.ts`, and `src/render/createRaceScene.ts`; update raceway and overtake coverage from post slalom to gate-run boundaries. Gates shipped; splitter divider never built — moved to `specs/raceway-obstacles/PLAN.md`.
- [x] (amended 2026-08-13; superseded 2026-08-14) Restore a full physical obstacle sequence—staggered gate lanes, continuous splitter, chicane, and narrowing gate—using only track-aligned box colliders in `src/track/definition.ts` and `src/render/createRaceScene.ts`; put every marble on one common start line and add corresponding `src/track/definition.test.ts` coverage. Staggered gate lanes and common start line shipped; splitter, chicane, and narrowing gate never built — `TrackBoxKind` still declares the unused `"splitter"`/`"chicane"` literals — all moved to `specs/raceway-obstacles/PLAN.md`, whose Phase A also removes the dead literals.

**Phase gate (hard):**
- [x] `pnpm typecheck`
- [x] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] Run five and fifteen marbles in `first` mode and confirm the view reads as a downhill race track, obstacles visibly change positions, all marbles remain inside the rails, and the elevated camera follows the current leader through the finish.
- [ ] Run five and fifteen marbles in `last` mode and confirm the camera follows the current trailing marble without abrupt snapping while the race continues until that marble crosses the finish line.
- [ ] Confirm the start grid, S-curves, staggered gate lanes, and finish straight are visually distinct at 1080p and the overlaid leaderboard remains readable. (Splitter, chicane, and narrowing gate are not built; see `specs/raceway-obstacles/PLAN.md`.)

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

**Verification debt carried past this phase:** the 0.05 m sphere-to-surface gap item above stays unchecked; it is not phase-blocking here because closing it means tuning obstacles this phase already knows are being deleted. See STATUS.

## Phase 6 — GitHub Pages deployment

Branch: `marble-race-picker/phase-6-pages-deployment` (manual stack: on Phase 5)

Make the completed static application reproducibly deployable at a GitHub Pages repository subpath.

Consumes: pnpm scripts `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm lint`, `pnpm format:check`, and `pnpm build`, plus Vite output directory `dist/`.

Fresh review: required — GitHub Actions deployment changes CI infrastructure

- [x] Configure relative production asset paths and deterministic `dist/` output in `vite.config.ts` for GitHub Pages repository-subpath hosting.
- [x] Add `.github/workflows/deploy-pages.yml` with `pnpm/action-setup@v4`, `actions/setup-node@v4` pnpm caching, `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build`; upload `dist/` and deploy Pages on pushes to `main` with the minimum required Pages permissions.
- [x] Document local commands, Pages repository settings, First/Last semantics, local-only data, and screen-share audio behavior in `README.md`.
- [x] (amended 2026-08-14, fresh-review correction) Scope `.github/workflows/deploy-pages.yml` permissions per job instead of workflow-wide, so the `build` job (which runs `pnpm install`/`pnpm build`, i.e. third-party install/build scripts) holds only `contents: read` rather than the `pages: write`/`id-token: write` only the `deploy` job needs; add `persist-credentials: false` to the build job's checkout.
- [x] (amended 2026-08-14, re-review correction) Add `pages: read` to the `build` job's permissions — the prior correction's `contents: read`-only scope would likely fail the `actions/configure-pages@v5` step, which calls `repos.getPages()` unconditionally and errors without Pages read access. Not confirmed against a live Actions run; flagged in the phase's review checklist below for confirmation on first deploy.

**Phase gate (hard):**
- [x] `pnpm typecheck`
- [x] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] Confirm the `Deploy Pages` workflow run is green end to end on the first push to `main` — specifically that the `build` job's `configure-pages` step succeeds with only `contents: read` + `pages: read`. Neither fresh-review pass could execute the workflow live; this is unconfirmed static analysis, not proven.
- [ ] Open the deployed Pages URL directly and after refresh; confirm assets load from the repository subpath and a complete first-mode and last-mode race works without network transmission of roster data.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Spec gate (hard — once, before the final phase's PR)

- [x] `pnpm lint`
- [x] `pnpm format:check`
- [x] `pnpm test`
- [x] `pnpm build`
