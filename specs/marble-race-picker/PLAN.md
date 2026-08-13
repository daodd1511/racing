# Marble Race Picker — Plan

A hosted static web page that picks a person at random from a pasted list and
reveals the result as a 30-second 3D marble race down an obstacle raceway.

Replaces an existing duck-racing tool used to choose the next weekly-meeting
presenter. The duck tool works; it just isn't appealing. Spectacle is the
justification for this project, so spectacle is a requirement, not polish.

Scope note: this is a **generic random picker**, not a presenter-rotation
system. It has no concept of "presenter" in the MVP.

## Product decisions

### Selection

Physics decides the winner. No pre-drawn result, no rigged race, no weighted
draw.

- A user-facing selection-mode setting chooses `first` or `last`, defaults to
  `first`, and persists in `localStorage`.
- In `first` mode, the first marble to cross the finish line is selected and
  the recording ends at that crossing.
- In `last` mode, the final marble to cross the finish line is selected and
  the recording ends at that crossing.
- The result label is a config string, so the same mechanic reads as "Winner"
  or "Unlucky" depending on how the team frames presenting.
- Person → start-slot mapping is shuffled every race. Lane bias is a real
  property of any track geometry and is invisible; shuffling stops it from
  attaching to the same human week after week. This makes the *long run*
  fair, not any single race.

Honest limitation, accepted deliberately: rigid-body physics is chaotic, not
provably uniform. The tool looks fair and is unbiased in expectation, but a
specific result cannot be explained or audited. The team accepts this because
a human visibly curates the input list.

### State and modes

No backend. No database. No accounts.

- Names are entered as a pasted newline-separated block.
- The list persists in `localStorage` on the meeting host's machine.
- A "copy list" button lets the host hand the roster to someone else via Slack.
- Nothing is ever transmitted; names do not leave the browser.

Two modes, only the first in the MVP:

1. **Memoryless (MVP).** Each race is independent. Fairness across weeks is a
   human job — someone removes names before pasting.
2. **Memory (later).** Records past winners and excludes anyone who won in the
   last N races. Fits in `localStorage` alongside the roster, so it needs no
   architectural change.

### Race format

The race uses a **real downhill raceway**, viewed from an elevated chase camera.
Marbles roll along a broad, railed course rather than falling through a tower.
The fixed MVP course follows a long horizontal route with a gradual vertical
drop, so forward progress is visually obvious and overtakes read as a race.

The raceway is assembled from **parametric modules**. MVP module set:

| Module | Purpose |
| --- | --- |
| Start grid and release chute | Gives 1–15 marbles room to launch without a pile-up. |
| Banked S-curves | Establishes speed and creates inside/outside passing lines. |
| Staggered bumper slalom | Deflects marbles between lines and creates lead changes. |
| Dual-route splitter and merge | Forces route choice, rebunching, and overtakes. |
| Chicane and narrowing gate | Compresses the field before the final straight. |
| Finish straight and line | Makes first and final crossings unambiguous. |

Rationale for modules over a monolithic track:

- Drama: every obstacle module creates a credible opportunity to change position.
- Tuning: total duration is roughly the sum of per-module durations, so hitting
  30s is arithmetic rather than guesswork.
- Future random maps: randomising the module list *is* the procedural-track
  feature. Each module is individually validated, so any stack of them is
  traversable by construction. Same code, no rewrite.
- Incremental build: ship two module types, add more later in isolation.

Explicit non-goal for MVP: procedural/random track generation. One fixed
parameter set only.

### Duration

Fixed at 30 seconds. No user-facing setting.

Duration is emergent from physics and cannot be commanded directly. The
approach is two-layer:

1. Hand-tune course slope, friction, length, and obstacle spacing so a natural
   run lands near 30s.
2. Simulate headlessly before rendering, then play back at a time scale that
   lands exactly on 30s. With layer 1 done, the scale factor sits near 1.0 and
   is imperceptible. Cap it at roughly 0.5–2.0x regardless.

Simulate-first also yields, for free:

- The selected person is known before a single frame renders, so the reveal
  can be staged.
- Slow-motion on the final approach — the highest-impact bit of drama in the
  genre.

### Identity and readability

Target: a person finds their marble on a screen-shared 1080p window.

- Marbles are clean coloured spheres. **No floating name labels** — labels
  overlap during merges and obscure the obstacles at the moments that matter.
- A fixed sidebar lists name → colour swatch, reordered live by race position.
  It doubles as the leaderboard.
- A 3-second pre-race lineup shows each marble with its name, so "I'm green"
  is learned before the start.
- ~10 solid colourblind-safe hues; patterned variants (stripes, dots) beyond
  that. Typical roster is 5; ceiling is 15.

### Trust

Once a race resolves, the result commits to history and the primary button
becomes "New race", which requires re-confirming the roster.

A client-side app cannot technically prevent a reroll — anyone can clear
storage or open a new tab — so a hard lock would be theatre. What this design
buys is making a reroll *visible* to the room, which is the only enforcement
that works among colleagues.

### Audio

Contact-event collision sounds, pitch- and volume-modulated by impact impulse,
plus a finish sting. Default **muted**, with a prominent toggle.

Muted by default because screen-share audio requires the host to tick "share
tab audio" in Meet/Zoom, and audio that is loud for the host and silent for the
room is worse than silence for everyone. Browser autoplay policy requires a
user gesture regardless.

Built last, after the race works.

## Technical decisions

### Stack

TypeScript + Vite + Three.js + Rapier (`rapier3d-compat`). No UI framework.

The DOM surface is a textarea, a button, and a list. A framework buys nothing
here, and React Three Fiber's reconciler would sit between the code and a
deterministic simulation loop that must stay decoupled from rendering.

No game engine (Godot/Unity). Their advantage is visual track authoring, which
the parametric generator removes the need for; their cost is a multi-megabyte
WASM export and awkward surrounding UI.

Track geometry and colliders are generated from parameters in code. No Blender,
no glTF import.

### Architecture

Three separated stages. Keep them separated.

1. **Simulate.** Headless Rapier run, no rendering. Produces a winner, a full
   finishing order, and a recorded per-frame transform track for every marble.
2. **Record.** The per-frame transforms are the artefact handed to rendering.
3. **Replay.** Three.js plays the recording back at a computed time scale.
   Nothing re-simulates at display time.

Consequence worth protecting: because playback replays recorded transforms
rather than re-running physics, **bit-exact cross-machine determinism is not a
requirement.** That is normally a nasty constraint with WASM physics, and this
design sidesteps it entirely.

Do not let a "just simulate live" shortcut creep in. It would take exact
duration control, the known-winner reveal, and the stuck-race guard with it.

### Progress, camera, and stuck-race handling

Race position is measured by projecting each marble onto the raceway centreline
and using cumulative path distance, not world-space height or a single axis.
That progress value drives the live leaderboard, final positional ranking, and
camera target.

The elevated chase camera looks down and forward along the local track tangent.
In `first` mode it smoothly follows the marble with greatest current progress;
in `last` mode it follows the marble with least current progress. The camera
uses look-ahead and damped motion so target changes remain legible instead of
snapping between marbles.

The headless simulation has a 60s sim-time ceiling. In `first` mode, discard
the seed and retry if no marble finishes by then. In `last` mode, discard the
seed and retry unless every marble finishes by then. The audience never sees
a failed race.

Caveat recorded for honesty: rejecting stuck outcomes is technically a small
bias, since wedging correlates with start position. At a roster of 5 this is
noise, but it is not literally zero.

The recorded finish order ends with the selected marble: one finisher in
`first` mode and the complete order in `last` mode. Trailing marbles in
`first` mode remain ranked by their position at the selection frame.

### Persistence shape

Stored in `localStorage`:

- Current roster.
- Picker settings, including selection mode; the result label remains an app
  config string rather than user data.
- Committed race records: seed, timestamp, roster, selection mode, selected
  person, observed finish order, and final positional ranking.

The seed is shown on the results screen. Seed + recorded result is also the
substrate that memory mode needs later.

### Deployment

GitHub Pages, auto-deployed from `main` by GitHub Actions.

No single-file offline build. Inlining a multi-megabyte WASM blob as base64 is
real friction for an offline case that probably never occurs. Add it only if
someone asks.

## Where the risk actually sits

Not in rendering, collisions, or the physics engine — those are solved,
boring problems. ~20 marbles at 60fps is comfortable.

The risk is **tuning the raceway obstacles and merge geometry** so 5 and 15
marbles produce genuine lead changes without wedging, escaping the rails, or
turning the start into an unreadable pile-up. The second risk is chase-camera
target churn when the lead changes rapidly; damping must preserve the overtake
without losing the mode-selected position.

## Assumptions

- Desktop-only, screen-shared. No mobile layout, no touch input.
- English-only.
- No accessibility requirement beyond colourblind-safe hues.

## Out of scope for MVP

- Random/procedural track generation (deferred; the parametric generator is
  the seam it will land on).
- Memory mode with winner exclusion.
- Any backend, shared state, or multi-viewer sync.
- Race history UI beyond what trust-commit requires.
- Adjustable race duration.
- Single-file offline build.

## Implementation map

The prototype at `specs/prototypes/first-look.html` is rejected as a visual and
track reference; it remains only as historical physics exploration.
`ui-variant-2-arcade.html` is the selected visual reference for the
production interface: use its warm arcade palette, tactile controls, cabinet
framing, scoreboard, and ticket-like result reveal. Its CSS race animation and
pinball-style course are presentation placeholders, not implementation
references. Production uses the Three.js/Rapier downhill obstacle raceway and
mode-aware chase camera described above. Production code is a modular Vite
application under `src/`.

### Foundation and simulation

- Vite's `vanilla-ts` scaffold is created in a `mktemp -d` staging directory
  with `pnpm create vite "$RACING_VITE_STAGING_DIR" --template vanilla-ts --no-interactive`
  and promoted to the repository root without touching `specs/`. Its
  `package.json`, `index.html`, `src/`, and TypeScript configs are then adjusted
  for pnpm, Three.js, `@dimforge/rapier3d-compat`, Vitest, Oxlint, Oxfmt, and
  `dev`, `typecheck`, `test`, `lint`, `format`, `format:check`, and `build`
  scripts: `typecheck` is `tsc -b`, `test` is `vitest run`, `lint` is
  `oxlint src`, `format` is `oxfmt --write .`, and `format:check` is
  `oxfmt --check .`. `pnpm install` creates `pnpm-lock.yaml`;
  `.prettierignore` excludes `specs/` from Oxfmt. `vite.config.ts` is
  introduced only for Pages in the deployment phase.
- `src/race/types.ts` exports `SelectionMode`, `MarbleTransform`,
  `TransformFrame`, `RecordedContactEvent`, `RaceRecording`,
  `CommittedRaceRecord`, `PickerSettingsV1`, and `PickerStateV1`.
- `src/race/config.ts` exports `DEFAULT_RACE_CONFIG` with the result label,
  `DEFAULT_PICKER_SETTINGS` with `first` selection mode, and `RaceConfig`.
- `src/race/random.ts` exports `createSeededRandom(seed: number): () => number`
  and `shuffleStartSlots(count: number, random: () => number): number[]`.
- `src/track/definition.ts` exports `TrackDefinition`, `TrackConfig`,
  `TrackPathSample`, `DEFAULT_TRACK_CONFIG`, and
  `createTrackDefinition(config: TrackConfig): TrackDefinition` for the start
  chute, S-curves, bumper slalom, splitter/merge, chicane, and finish straight.
- `src/track/progress.ts` exports
  `measureTrackProgress(track: TrackDefinition, position: Vector3): number` by
  projecting a position onto the sampled centreline.
- `src/track/colliders.ts` exports
  `attachTrackColliders(world: RAPIER.World, track: TrackDefinition): void`.
- `src/simulation/simulateRace.ts` exports
  `simulateRace(roster: readonly string[], seed: number, mode: SelectionMode): RaceRecording | null`.
- `src/simulation/simulateWithRetry.ts` exports
  `simulateWithRetry(roster: readonly string[], mode: SelectionMode): RaceRecording`.

### Replay and presentation

- `src/render/createRaceScene.ts` exports
  `createRaceScene(canvas: HTMLCanvasElement, track: TrackDefinition, styles: readonly MarbleStyle[], mode: SelectionMode): RaceScene`.
  It renders the obstacle raceway and uses centreline progress to drive an
  elevated, damped chase camera following the leader in `first` mode or trailer
  in `last` mode.
- `src/render/marbleStyles.ts` exports `MarbleStyle` and
  `createMarbleStyles(count: number): MarbleStyle[]` for colourblind-safe solid
  colours followed by patterned variants.
- `src/replay/createReplayController.ts` exports `ReplayCallbacks`,
  `ReplayController`, and
  `createReplayController(scene: RaceScene, recording: RaceRecording, callbacks: ReplayCallbacks): ReplayController`.
- `src/ui/createRaceView.ts` exports
  `createRaceView(root: HTMLElement, recording: RaceRecording): RaceView` and
  owns the lineup, centreline-progress leaderboard, canvas, replay, and result
  handoff.
- `preview.html` and `src/dev/racePreview.ts` provide a retained tuning harness
  for seeded tracks without coupling simulation to rendering.

### Application, persistence, and audio

- `index.html`, `src/main.ts`, and `src/app/createApp.ts` compose the roster
  confirmation, persisted settings, simulate-first flow, replay, committed
  result, copy-list action, and visible new-race flow.
- `src/storage/raceStore.ts` exports `RaceStore` and
  `createRaceStore(storage: Storage): RaceStore`, using the versioned
  `marble-race-picker` localStorage entry and safe defaults for absent or
  malformed data.
- `src/ui/createSetupView.ts` exports
  `createSetupView(root: HTMLElement, initial: PickerStateV1): SetupView`.
- `src/ui/createResultDialog.ts` exports
  `createResultDialog(root: HTMLElement, record: CommittedRaceRecord, label: string): ResultDialog`.
- `src/audio/createRaceAudio.ts` exports `RaceAudio` and
  `createRaceAudio(): RaceAudio`; it starts only from the mute-toggle user
  gesture and plays recorded collision events plus the finish sting.

### Deployment

- `.github/workflows/deploy-pages.yml` installs the pinned pnpm dependencies
  with `pnpm install --frozen-lockfile`, builds `dist/`, and deploys it to
  GitHub Pages on pushes to `main`.
- `vite.config.ts` uses relative asset paths so the build works at the
  repository's Pages subpath.
