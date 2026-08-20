# Curved surfaces a marble rides collide as cuboids, not as trimeshes

The vortex bowl's revolved concave trimesh ejected any marble that entered the
rim with real speed: one hard deflection, then an unbroken ballistic arc, never
past roughly 0.4 orbits. That held across every variable swept — rim wall height
6–20 marble radii, bank angle 0.30–1.40 rad, wall/floor transition width from a
narrow band to 65% of the floor's radial run, entry speed 0.8–3.0 m/s, friction,
board tilt, CCD on and off, timestep 1/60 down to 1/960, marble rotation locked
and free, and Rapier's `FIX_INTERNAL_EDGES` flag. A *flat* trimesh holds a marble
correctly and the chute's cuboids have always worked, so the defect is the
curved concave mesh's internal edges rather than anything about the intended
shape. Any surface a marble rides is therefore emitted as a chain or ring of
cuboid colliders; `Spec.visuals` may still carry the smooth revolved mesh.

## Consequences

Colliders and visuals now legitimately describe the same surface differently
within one `Spec`, which the contract already permits — they are separate arrays
over a shared `Shape` union. ADR 0002 is unaffected: the live renderer and the
Validator still consume the *same colliders*, so the divergence is visual only
and can never make the Validator lie about physics.

The cost is roughly forty colliders per bowl instead of one, and a new sizing
obligation: the cuboid emitter must pick its segment count against
`SCALE.marbleRadius` so no marble can catch a seam between plates, the same rule
`revolveProfile` already applies to facet chords. `revolveProfile` itself stays,
re-aimed at visual meshes.
