# Marble Race Picker — Plan

A hosted static web page that picks a person at random from a pasted list and
reveals the result as a 30-second 3D marble race down a funnel track.

Replaces an existing duck-racing tool used to choose the next weekly-meeting
presenter. The duck tool works; it just isn't appealing. Spectacle is the
justification for this project, so spectacle is a requirement, not polish.

Scope note: this is a **generic random picker**, not a presenter-rotation
system. It has no concept of "presenter" in the MVP.

## Product decisions

### Selection

Physics decides the winner. No pre-drawn result, no rigged race, no weighted
draw.

- First marble to reach the finish basin is the selected person.
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

A **vertical funnel**, chosen over a horizontal race track for two specific
reasons that sink amateur marble racers:

- **Camera.** 15 marbles spread along a long horizontal course cannot be
  framed. Follow the leader and viewers lose their own marble; go wide and
  everything is 4 pixels. A descent keeps the field bunched and the camera
  motion trivial.
- **Duration.** Horizontal courses long enough for interesting overtaking run
  60–90 seconds. A funnel's runtime is bounded by drop height.

The track is a vertical stack of **parametric modules**. MVP module set:

| Module | Purpose |
| --- | --- |
| Helix segment | Descent and visual interest. Order tends to lock here. |
| Peg field | Where the race is actually decided. Primary source of lead changes. |
| Funnel pinch | Bunches the field back together for a tense finish. |
| Finish basin | Arrival and reveal. |

Rationale for modules over a monolithic track:

- Drama: every module boundary reshuffles the field.
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

1. Hand-tune module parameters so a natural run lands near 30s.
2. Simulate headlessly before rendering, then play back at a time scale that
   lands exactly on 30s. With layer 1 done, the scale factor sits near 1.0 and
   is imperceptible. Cap it at roughly 0.5–2.0x regardless.

Simulate-first also yields, for free:

- The winner is known before a single frame renders, so the reveal can be
  staged.
- Slow-motion on the final approach — the highest-impact bit of drama in the
  genre.

### Identity and readability

Target: a person finds their marble on a screen-shared 1080p window.

- Marbles are clean coloured spheres. **No floating name labels** — in a funnel
  the field bunches, and labels overlap into an unreadable pile at exactly the
  moment the race matters most.
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

### Stuck-race handling

If the headless simulation produces no winner within a 60s sim-time ceiling,
discard the seed and roll a new one. The audience never sees a failed race.

Caveat recorded for honesty: rejecting stuck outcomes is technically a small
bias, since wedging correlates with start position. At a roster of 5 this is
noise, but it is not literally zero.

Simulation continues past first place so the leaderboard shows a complete
finishing order. This also makes "remove the winner and race again" free.

### Persistence shape

Stored in `localStorage`:

- Current roster.
- Committed race records: seed, timestamp, roster, finishing order.

The seed is shown on the results screen. Seed + recorded result is also the
substrate that memory mode needs later.

### Deployment

Static hosting (GitHub Pages or Netlify), auto-deploy on push.

No single-file offline build. Inlining a multi-megabyte WASM blob as base64 is
real friction for an offline case that probably never occurs. Add it only if
someone asks.

## Where the risk actually sits

Not in rendering, collisions, or the physics engine — those are solved,
boring problems. ~20 marbles at 60fps is comfortable.

The risk is **tuning the peg field and funnel pinch** so that 5 marbles produce
genuine lead changes rather than a locked procession, and so nothing wedges.
This is iterative parameter work with no shortcut, and it will be most of the
effort. Plan for it explicitly rather than discovering it.

Secondary risk: helix segments are inherently undramatic — marbles in constant
contact with a smooth spiral hold their order. Keep helix segments short and
let the peg field carry the race.

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
