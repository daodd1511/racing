# Curved surfaces a marble rides collide as cuboids, not as trimeshes

Curved trimesh colliders expose internal edges that can deflect fast marbles.
Any curved surface a marble rides is therefore emitted as overlapping cuboid
colliders; `Spec.visuals` may still carry a smooth mesh over the same path.

## Consequences

Colliders and visuals now legitimately describe the same surface differently
within one `Spec`, which the contract already permits — they are separate arrays
over a shared `Shape` union. ADR 0002 is unaffected: the live renderer and the
Validator still consume the _same colliders_, so the divergence is visual only
and can never make the Validator lie about physics.

The cuboid emitter must pick its segment count against `SCALE.marbleRadius` so
no marble can catch a seam between plates. This increases collider count but
keeps the live renderer and Validator on identical collision geometry.
