# Marble Race Picker — Execution Plan

Spec: [PLAN.md](PLAN.md). Rulebook: `specs/RULEBOOK.md`.
Integration branch: `main`. Branch model: manual stack — GitHub reports stacked
PRs are disabled, so, at the user's request on 2026-08-12, each phase branches
from and opens its PR against its immediate predecessor without waiting for merge.

## STATUS

- Current phase: 2 — in-progress
- Phase 1 — Simulation foundation: done
- Phase 2 — Race replay and tuning: in-progress
- Phase 3 — Picker application and persistence: pending
- Phase 4 — Race audio: pending
- Phase 5 — GitHub Pages deployment: pending
- Verification debt: none

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

- [ ] Implement colourblind-safe solid and patterned marble styles in `src/render/marbleStyles.ts` and track, marble, lighting, and camera rendering in `src/render/createRaceScene.ts`.
- [ ] Implement immutable transform replay, a 30-second time-warp curve, final-approach slow motion, collision callbacks, cancellation, and disposal in `src/replay/createReplayController.ts`.
- [ ] Implement the three-second named lineup, fixed name-to-style mapping, live positional leaderboard, canvas, and result handoff in `src/ui/createRaceView.ts` and `src/styles/race.css`, applying the warm arcade presentation selected in `ui-variant-2-arcade.html` without copying its placeholder course or CSS race motion.
- [ ] Add `preview.html` and `src/dev/racePreview.ts` as a seed/mode/roster tuning harness that calls the production simulation and replay interfaces.
- [ ] Tune `DEFAULT_TRACK_CONFIG` in `src/track/definition.ts` for short helix order-locking, peg-field lead changes, funnel rebunching, and successful 5- and 15-marble runs through both selection modes.
- [ ] Add fake-clock replay coverage in `src/replay/createReplayController.test.ts`, style coverage in `src/render/marbleStyles.test.ts`, and representative fixed-seed completion coverage in `src/simulation/trackStress.test.ts`.

**Phase gate (hard):**
- [ ] `pnpm typecheck`
- [ ] `pnpm exec vitest related --run --passWithNoTests <changed files>`

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

- [ ] Implement versioned `marble-race-picker` state loading, safe malformed-state fallback, roster/settings saves, and immutable committed-record appends in `src/storage/raceStore.ts`.
- [ ] Implement `src/ui/createSetupView.ts` with newline parsing that trims empty lines, accepts 1–15 entries, preserves duplicate names as distinct marbles, persists the `first`/`last` setting, copies the normalized roster through `navigator.clipboard.writeText()`, and carries over the selected arcade-style roster controls and mode switches.
- [ ] Implement `src/ui/createResultDialog.ts` with the `DEFAULT_RACE_CONFIG` label, selected name/style, seed, observed finish order, the selected ticket-like arcade reveal, and a `New race` action that returns to roster confirmation instead of rerunning immediately.
- [ ] Compose simulate-first execution, race replay, commit-on-result, settings persistence, and lifecycle cleanup in `src/app/createApp.ts`, `src/main.ts`, `index.html`, and `src/styles/app.css`.
- [ ] Add storage coverage in `src/storage/raceStore.test.ts`, setup/result DOM coverage in `src/ui/createSetupView.test.ts` and `src/ui/createResultDialog.test.ts`, and first/last end-to-end controller coverage in `src/app/createApp.test.ts`.

**Phase gate (hard):**
- [ ] `pnpm typecheck`
- [ ] `pnpm exec vitest related --run --passWithNoTests <changed files>`

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

- [ ] Implement `src/audio/createRaceAudio.ts` with lazy `AudioContext` creation, default-muted state, impact-impulse pitch/volume modulation, event throttling, finish sting, and deterministic disposal.
- [ ] Add a prominent mute toggle to `src/ui/createSetupView.ts` and connect recorded contact events and selection completion to `RaceAudio` through `src/app/createApp.ts` replay callbacks.
- [ ] Add mocked Web Audio coverage in `src/audio/createRaceAudio.test.ts` and app wiring coverage in `src/app/createApp.test.ts` for default silence, gesture activation, collision modulation, finish sting, and disposal.

**Phase gate (hard):**
- [ ] `pnpm typecheck`
- [ ] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] Confirm a fresh page load is silent, enabling audio from the visible toggle produces varied collision sounds plus one finish sting, muting takes effect immediately, and browser autoplay is never invoked before the gesture.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Phase 5 — GitHub Pages deployment

Branch: `marble-race-picker/phase-5-pages-deployment` (manual stack: on Phase 4)

Make the completed static application reproducibly deployable at a GitHub Pages repository subpath.

Consumes: pnpm scripts `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm lint`, `pnpm format:check`, and `pnpm build`, plus Vite output directory `dist/`.

Fresh review: required — GitHub Actions deployment changes CI infrastructure

- [ ] Configure relative production asset paths and deterministic `dist/` output in `vite.config.ts` for GitHub Pages repository-subpath hosting.
- [ ] Add `.github/workflows/deploy-pages.yml` with `pnpm/action-setup@v4`, `actions/setup-node@v4` pnpm caching, `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build`; upload `dist/` and deploy Pages on pushes to `main` with the minimum required Pages permissions.
- [ ] Document local commands, Pages repository settings, First/Last semantics, local-only data, and screen-share audio behavior in `README.md`.

**Phase gate (hard):**
- [ ] `pnpm typecheck`
- [ ] `pnpm exec vitest related --run --passWithNoTests <changed files>`

**Review checklist (user, at PR review):**
- [ ] Open the deployed Pages URL directly and after refresh; confirm assets load from the repository subpath and a complete first-mode and last-mode race works without network transmission of roster data.

**On completion:** run the phase gate; run `fresh-review` when the recorded or actual-diff decision requires it; update STATUS + checkboxes; stop and ask before push/PR. Review checklist goes into the PR description.

## Spec gate (hard — once, before the final phase's PR)

- [ ] `pnpm lint`
- [ ] `pnpm format:check`
- [ ] `pnpm test`
- [ ] `pnpm build`
