# Physics runs live; validation is headless and happens at authoring time

Races step Rapier live inside the React Three Fiber render loop, and the live
result decides the winner. The predecessor recorded a headless simulation to
frames and replayed it, which guaranteed no race ever stalled in front of an
audience but forced Modules to be central data descriptors rather than
independently authored components. Correctness moves instead to the Validator: a
headless harness that drives raw `@dimforge/rapier3d-compat` — never React —
over a Module or Course across many seeds and reports Dwell Time, stalls, and
Shuffle.

## Consequences

A Module's geometry must therefore be a **pure function** (`buildSpec`) that both
the React component and the Validator consume, and dynamic behaviour must be a
pure function of elapsed time (`step`), or the two diverge and the Validator
lies. `@react-three/rapier` bundles its own copy of `@dimforge/rapier3d-compat`;
that version must be pinned equal to the Validator's direct dependency, enforced
by a test, for the same reason.

Seed-retry-before-showing is given up: a Course can no longer be rejected at
runtime for being unraceable. Course designs are cleared by the Validator ahead
of time instead, backed by a runtime watchdog for the escape case.
