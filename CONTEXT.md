# Marble Race Picker

Picks a person at random from a pasted roster and reveals the result as a 3D
marble race whose physics decides the outcome. This glossary is the project's
ubiquitous language; use these terms in code, specs, docs, and UI copy.

## Language

### The picker

**Roster**:
The ordered list of people entered for a race.
_Avoid_: participants, entrants, names list

**Selection Mode**:
Whether the result is read off the first marble to finish or the last.
_Avoid_: win condition, race mode

**Result Label**:
The word the app uses for the selected person — "Winner", "Unlucky".
_Avoid_: winner text, outcome label

### The board

**Board**:
The vertical pegboard the whole course is mounted on, viewed face-on. It owns
the hole grid every module snaps to.
_Avoid_: track (a Board carries a Course), wall, plane

**Cell**:
One position on the Board's hole grid. The unit every Footprint is measured in.
_Avoid_: hole, peg, tile, slot (a Slot is a role, not a place)

**Course**:
The complete chain of Modules mounted on a Board for one race, from start grid
to finish line.
_Avoid_: track, layout, level

### Modules

**Module**:
One self-contained, independently authored piece of the Course — a pin field,
a staircase, a chute. The unit of composition and of the Showcase.
_Avoid_: obstacle (too narrow — a chute is a Module but obstructs nothing),
component, piece, section

**Spec**:
The pure geometry a Module's build function returns: its colliders, its
Footprint, and its visual description. Both the live renderer and the headless
Validator consume the same Spec, which is what keeps them honest.
_Avoid_: descriptor, definition, blueprint

**Footprint**:
The Cells a Module occupies plus its entry and exit anchors — everything the
Assembler needs to place it and connect it.
_Avoid_: bounds, extents, shape

**Role**:
What a Module does to the field of marbles: `accel`, `scatter`, `shuffle`,
or `sort`. The Arc is written in Roles, not in Modules.
_Avoid_: type, kind, category, tier

**Arc**:
The fixed ordered sequence of Slots that gives every Course the same dramatic
shape while its content varies.
_Avoid_: template, skeleton, recipe

**Slot**:
One position in the Arc, tagged with the Role a Module must have to fill it.
_Avoid_: step, stage, spot

### Behaviour

**Shuffle**:
Reordering the field — marbles leave a Module in a different order than they
entered. The property that makes a race feel unrigged.
_Avoid_: mixing, randomising

**Dwell Time**:
How long a marble spends inside one Module. Its worst case is what decides
whether a Module is safe to put in a Course.
_Avoid_: latency, hold time, transit time

### Tooling

**Showcase**:
The route that mounts one Module alone with live parameter controls, a marble
feeder, and behaviour metrics. Where Modules are authored and tuned.
_Avoid_: gallery, preview, playground, sandbox

**Assembler**:
Fills the Arc's Slots from the Module registry to produce a Course.
_Avoid_: generator, builder, composer

**Validator**:
The headless harness that steps raw physics over a Course or Module across many
seeds and reports Dwell Time, stalls, and Shuffle. It never mounts React.
_Avoid_: simulator, test harness, checker

**Feeder**:
Releases marbles into a Module in the Showcase — continuously, in a burst, or
one at a time.
_Avoid_: spawner, emitter, dropper
