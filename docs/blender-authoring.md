# Blender asset authoring

Phase 1 preserves the live Course geometry in seven editable sources under
`assets/blender/`. The game still uses its existing generators until the runtime
migration phases. Do your visual and behavioral comparison before retiring them.

## Export a saved edit

1. Open the relevant `.blend` and preserve its named structure.
2. Save your changes in Blender.
3. Run `pnpm assets:export` from the repository root.
4. Run `pnpm assets:check` and review the source and catalog changes in Git.

The wrapper uses `BLENDER_BIN` when you set it; otherwise it uses
`/Applications/Blender.app/Contents/MacOS/Blender`. Blender 5.2.1 LTS was used for the
initial migration. Normal builds will consume checked-in exports; Phase 5 adds the
freshness check to the build.

Export reads saved models. It never runs capture or bootstrap, saves the source,
changes physics values, or prunes previous revisions. All seven packages must
validate before one atomic catalog replacement. An error preserves the previous
catalog and every referenced package. A concurrent export fails on the export lock;
if a process crashes, verify that it has stopped before removing its `.export.lock`.
Unpublished staging directories remain available for diagnosis and are ignored by Git.

## Preserve the authored structure

- `visuals`: meshes with stable part IDs and matching GLB node names. Each mesh uses
  one Principled material. Apply modifiers before export. Keep the supported control
  structure when editing vertices.
- `colliders`: explicit collision meshes named `collision__<part-id>`. The `part`
  metadata retains the primitive tag, physical profile and motion/sensor flags.
  Move or rotate these objects to edit their frames. Primitive vertex edits and
  non-unit object scale are rejected because export cannot safely infer the intended
  primitive. Triangle-mesh colliders export their saved vertices. Do not infer
  collision geometry from decorative meshes.
- `markers`: `entry`, `exit`, ordered `route-0000` points, `bounds-min` and
  `bounds-max`. Start adds `gate-pivot`; finish adds `finish-sensor`, which must stay
  aligned with the sensor collider. Optional `recovery-0000` markers retain explicit
  position, rotation and half-extents. Baseline Specs do not acquire recovery boxes.
- `controls`: named binding objects carry the target part, supported region and
  repeat index where applicable. Preserve those bindings when editing the model.
  Later runtime adapters consume the exported rest mesh and these bindings.

JSON uses meters in the existing game frame: X lateral, Y up, Z longitudinal;
quaternions use XYZW. Blender stores the equivalent frame as `(x, -z, y)` with
Z up. Bootstrap applies that rotation to vertices and conjugates object rotations;
export reverses it for JSON and uses glTF's Y-up conversion for GLB. Shear and
non-unit scale fail explicitly.

Physics profiles in `src/assets/physicsProfiles.ts` retain the captured effective
friction and restitution. The game owns gate timing, finish detection, marble
identity and spherical collision radius. The marble source preserves live sphere
UVs and captured stripe data; identity-specific skins remain available through the
existing game style functions during migration.

## Reproduce the original capture

The checked-in `assets/baseline/README.md` records capture provenance. Capture uses
`courseParamValues`, registered generators, start/finish Specs, `raceVisibleSpec`,
and live marble geometry and stripe data. It never edits those generators.

For a fresh destination with no captured files or settings, run
`pnpm assets:capture`. Then bootstrap each asset using:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 \
  --python scripts/blender/bootstrap.py -- \
  assets/baseline/chute.json assets/blender/chute.blend
```

Repeat for `pin-field`, `staircase`, `whoops`, `start`, `finish` and `marble`.
Both capture and bootstrap refuse existing output files. Never remove a manually
edited source to rerun bootstrap; export that saved source instead.
