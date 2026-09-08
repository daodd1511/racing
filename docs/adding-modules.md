# Add an Obstacle Module

Build and tune an Obstacle Module in the live Course before judging its behavior.
The Showcase previews a Module in isolation; entry speed, surrounding Modules and
marble traffic change how it behaves on the Course.

## Define and register the Module

1. Add a directory under `src/modules/` with a pure `ModuleDefinition<P>`:
   `id`, `role`, `meta.params`, `buildSpec(params)` and `step(spec, seconds)`.
   Reuse the existing channel/sweep helpers where they fit the required shape.
2. Return collision geometry, visuals and a Footprint from `buildSpec`. Supply
   entry/exit anchors, an ordered progress route, bounds and occupied Cells.
   Visual details need not add collision complexity. Static `step` returns `[]`;
   moving parts use stable IDs and the existing kinematic motion contract.
3. Add one catalog entry in `src/modules/registry.ts`. Passing Course parameter
   overrides to `toRegisteredModule` opts the Module into Course assembly and
   merges overrides with its parameter-schema defaults. Omit overrides for a
   Showcase-only Module. Course eligibility and tuned defaults need no second
   whitelist or Module-ID switch in `src/course/courseModules.ts`.
4. If the Course should use the Module, deliberately update its composition in
   `src/course/arc.ts`. The obstacle inventory remains a design choice, not a list
   of every eligible Module. Review fit against the existing Board bays and
   connector constraints before changing Board dimensions.
5. Run the Course with the intended roster and inspect Close up first, then
   Broadcast. Adjust shape and physical parameters based on the race. Preserve
   useful focused checks for behavior that would otherwise be easy to break.

## Describe wider recovery areas when needed

Omit `Spec.recoveryBoxes` (or use an empty array) to retain the legacy corridor
checks. For a wider pocket or banked surface, return a union of local-space boxes:

```ts
recoveryBoxes: [
  {
    position: [0, 0.1, 0.6],
    rotation: [0, 0, 0, 1],
    halfExtents: [0.4, 0.2, 0.6],
  },
];
```

The values above illustrate the data shape; tune them to the actual surface.
Each box describes valid marble-center positions, including appropriate vertical
clearance for expected motion. Half-extents must be positive; transforms must be
finite and rotation quaternions nonzero. Boundaries are included. Multiple boxes
can cover curved areas while leaving gaps outside the valid volume.

`transformSpec` places these boxes with the Module. Course assembly preserves
that placed data. The runtime checks only the Module ending at the next expected
checkpoint, whose span overlaps the active route interval. Boxes on later rows
cannot exempt a marble from recovery. Connectors and Modules without boxes keep
legacy recovery. Checkpoint boundaries hand responsibility to the next section.

Boxes are recovery metadata. They do not create colliders, affect ranking or
change the route. Inside the union, corridor/below-route escape checks do not
reset the marble; outside it, existing checks resume. Last-safe recording and
respawn remain unchanged, so widening the area does not automatically make every
allowed airborne position a safe respawn point. Avoid boxes that include space
beneath a track or an unrelated Course row.

## Blender migration

The pending migration must preserve catalog Course defaults and optional recovery
boxes when extracting current Specs. Export boxes as explicit metadata, separate
from decorative meshes and colliders. Placement and supported tuning must update
boxes with their authored Module geometry. Existing Modules have no custom boxes;
do not invent them during baseline migration.
