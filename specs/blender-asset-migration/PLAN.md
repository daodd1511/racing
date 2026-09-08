# Blender asset migration

## Status

[Runtime performance and Module foundations](../runtime-module-foundations/PLAN.md)
completed and merged on 2026-09-08. Its resulting Module contract is recorded in
“Runtime foundations integration” below. This migration is next; no phase has started.

Planning complete for the requested migration. See [EXECUTION.md](EXECUTION.md) for
the five pending phases. Implementation requires an explicit phase-start instruction.

## Goal

Move asset authoring into Blender while preserving the currently working race.
Complete this migration before adding new Obstacle Modules.

## Confirmed decisions

- Blender will own visible models and dedicated collision geometry.
- The migration will first preserve existing collision shapes and physics settings.
  It will not intentionally redesign physical behavior.
- New Obstacle Modules are outside this migration and follow after it is complete.
- Acceptance requires equivalent race behavior, not identical seeded results. Finish
  orders may change; completion, pacing, passing and stall characteristics must remain
  equivalent in practical review. No numerical equivalence thresholds or seed matrix
  are required.
- Author individual Modules in Blender. The game retains Course assembly rather than
  loading a complete manually assembled Course as one asset.
- Use a hybrid authoring workflow: Blender owns authored models, while selected geometry
  parameters can be adjusted in code and the Showcase. Supported transformations must
  update visuals, collision geometry, connection markers, route and Footprint together.
  Arbitrary shape edits still follow Blender edit → export → reload. This supersedes
  the earlier decision to remove live geometry controls entirely.
- The game continues generating Course connectors, including downhill hairpins, to
  match placed Module entry and exit points. Connectors are an explicit exception to
  Blender geometry ownership in this migration.
- Preserve the current visual style. A realism redesign is outside this migration;
  minor surface polish must not change the established visual direction or intentionally
  alter collision geometry.
- Keep editable `.blend` sources and exported game assets in the repository. Normal
  game development, builds and deployment consume checked-in exports without requiring
  Blender. Blender is required for asset editing and export; source and exporter hashes
  detect stale exports.
- Saved `.blend` models are authoritative for authored geometry. Scripts may create
  initial assets or make targeted edits, but export reads the saved model without
  regenerating it or overwriting manual changes.
- Migrate the four existing Modules, start and finish structures, gate model and pivot,
  and marble visual assets to Blender authoring.
- The game retains gate movement, finish detection, marble identity and spherical
  physics, Course assembly and procedural connectors. The Board backing and hole grid
  remain procedural because their dimensions follow the assembled Course.
- Physics values and motion behavior remain in game configuration, including friction,
  restitution, gravity and gate timing. Blender collision surfaces reference physical
  materials whose values the game defines; visual materials remain separate. The live
  race and Validator consume the same physical settings.
- Neither Showcase presets nor live Course presets are the source of truth for authored
  Module geometry. The saved Blender model expresses the intended design; the Showcase
  and live Course are consumers used to inspect appearance and behavior. The author can
  refine the model in Blender or tune supported parameters based on those observations.
  Preserving the current race is the migration baseline, not a permanent
  prohibition on later intentional design changes.
- Include Course tuning in the development view. The author can select a placed Module,
  adjust supported parameters, restart the same seed and Roster, and save a configuration
  after assessing its behavior in context. Geometry changes apply on restart, not while
  marbles are touching the existing colliders. The Showcase remains useful for isolated
  inspection but is not sufficient evidence of behavior in a complete Course.
- Course tuning changes the shared configuration for that Module, affecting every
  placement of it when the race restarts. Do not introduce placement-specific overrides.
  Validate changes across different incoming conditions because the same configuration
  may behave differently at different positions in the Course.
- Supported geometry tuning is a capability across all migrated Modules, not a
  Whoops-specific feature. Each Module exposes controls appropriate to its geometry;
  the minimum control set is listed below.
- On restart, geometry changes trigger Course reassembly: update placement and rebuild
  connectors from the resulting Footprints and connection points. Preserve the requested
  seed and Roster. Reject configurations that cannot be assembled within validated
  placement limits, with an actionable explanation rather than broken connections or
  overlaps.
- Bootstrap Blender assets by extracting the existing live Course Module geometry and
  its effective tuned configuration. Do not recreate Modules from scratch, approximate
  them by eye, or substitute Showcase defaults. Preserve existing visual geometry,
  collider representations, local transforms, connection data and physical settings as
  the initial reference. After this one-time extraction, saved Blender models become
  authoritative under the agreed authoring workflow.
- Preserve existing geometry controls as the minimum tuning scope: Chute length, grade
  and width; Pin field row count, post spacing, post height, post width and row pitch;
  Staircase step count, tread length and step height; Whoops amplitude, wavelength,
  length, grade and width. Additional controls are deferred. Showcase, Course and
  Validator use the same supported transformation logic, subject to Course validity.
- Keep the existing implementation available as a temporary comparison baseline until
  every migrated Module passes the user's visual and behavioral review. First verify
  an unchanged geometry export/import round trip, then enable parameterized editing.
  Retiring the old Module geometry path is gated on that review; procedural connectors
  and the Board remain as agreed exceptions.
- Provide an explicit Save action in the local development tuning view. A development-
  server endpoint validates supported Module settings and writes only the designated
  repository configuration file. Saved settings become reviewable Git changes and feed
  subsequent runs and builds. The endpoint is absent from the deployed static game;
  previewing parameter changes does not persist them automatically.
- Block builds when checked-in exports are stale relative to their Blender sources or
  exporter version. Use export provenance that can be checked without launching Blender.
  Invalid or failed exports must preserve the last valid asset files and report the
  failure; do not silently substitute different geometry. A stale build remains blocked
  even when older valid exports exist.
- Blender assets retain an explicit structure supporting their geometry controls,
  such as named repeatable parts and designated deformable surfaces. Manual edits must
  preserve that contract; export validation rejects incompatible edits with an actionable
  explanation. The initial structured assets must still derive from the current tuned
  geometry, not replace it with newly approximated shapes.
- Keep verification proportional to this game and migration. Do not create a statistical
  acceptance project, large seed matrix, or numerical equivalence thresholds. Prioritize
  preserving the working geometry, inspecting the migrated Course and correcting visible
  physics problems. Retain existing tests and run applicable project checks; add targeted
  checks only for meaningful new risks such as export corruption or configuration writes.
  The user's visual and behavioral review remains the migration acceptance decision.

## Current implementation evidence

- The Module registry contains Chute, Pin field, Staircase and Whoops; all four are
  eligible for a live Course (`src/modules/registry.ts`,
  `src/course/courseModules.ts`).
- The live race and headless Validator share collision descriptions. ADR 0002 records
  the reason for this consistency requirement.
- Collider representations vary: Whoops uses sampled cuboid plates, while Course
  connectors use separate triangle meshes for floor and rails
  (`src/modules/whoops/index.ts`, `src/course/connectors.ts`).
- ADR 0003's blanket cuboid policy conflicts with the current connector implementation.
  Reconcile the document with the confirmed migration design; do not change working
  colliders merely to satisfy the older statement.
- Showcase defaults and live Course geometry currently differ. For example, the Course
  overrides Whoops length and wavelength and Staircase step count and tread length
  (`src/course/courseModules.ts`). The migration must explicitly select which geometry
  becomes the authored baseline. The user selected the effective live Course geometry
  and tuned configuration as that baseline.

These observations come from code inspection, not new simulation or test results.

## Implementation decisions

These resolve the remaining planning items using the recommendations presented before
execution planning. They preserve the agreed product scope.

### Export and authoring contract

- Store editable sources under `assets/blender/` and versioned export packages under
  `src/assets/authored/`. Each package contains `visuals.glb` and `asset.json`.
  `src/assets/authored/catalog.json` maps asset IDs to immutable package revisions;
  its source/exporter/content hashes allow freshness checks without Blender.
- Use the existing Module IDs: `chute`, `pin-field`, `staircase`, `whoops`; infrastructure
  IDs are `start`, `finish`, `marble`. Schema version starts at 1. Physical materials
  reference named profiles in `src/assets/physicsProfiles.ts`, populated from current
  effective settings. Do not replace distinct current materials with one generic profile.
- Export JSON in the existing game coordinate frame and meters. Explicitly convert
  Blender coordinates; preserve stable part IDs, transforms, entry/exit frames, route,
  bounds, optional `Spec.recoveryBoxes`, collider shape tags, physical-material references and gate pivot. Normalize
  scale only when it preserves the represented shape; reject unsupported shear or scale
  rather than approximate it. Preserve floor/rail separation and existing primitive types.
- Use named Blender collections `visuals`, `colliders`, `markers` and `controls`.
  Each visual has a stable GLB node reference. Markers include `entry`, `exit`, ordered
  route points and, for start/finish, `gate-pivot` and `finish-sensor`. The game retains
  sensor semantics and gate timing. Collision geometry is explicit, never inferred from
  decorative meshes. Marble visuals retain the existing stripe designs and identities;
  the spherical collider and physical radius remain game-owned.
- Extract the current live Course data once with `scripts/assets/captureBaseline.ts`,
  including effective parameters and render-time visual adjustments. Save its plain-data
  reference under `assets/baseline/`; preserve the original implementation for comparison.
  `scripts/blender/bootstrap.py` constructs structured editable assets from that reference
  and refuses to overwrite an existing `.blend`. It is not part of normal export/build.
- `scripts/blender/export.py` reads saved models. Export to a temporary package, validate
  shape data, IDs, markers, material references and control bindings, then publish a new
  immutable revision and atomically replace the catalog pointer. Failure leaves the
  previous catalog and referenced packages intact. Do not prune old revisions implicitly.
- Normal builds check freshness and package integrity using `scripts/assets/checkAssets.ts`.
  Fingerprint source bytes and exporter implementation, not just a manually maintained
  version string. Store output hashes too. A stale or missing package blocks the build;
  at runtime a load failure displays a retryable error and prevents starting the race.
  No hidden fallback to legacy geometry.

### Shared tuning contract

- `src/assets/types.ts` defines `AssetId`, `ModuleId`, `AuthoredAsset`,
  `AuthoredCatalog`, `ModuleTuning`, `ModuleSettings`, `SettingsSnapshot` and
  `SaveSettingsRequest`. `ModuleSettings` maps each Module ID to its own strict parameter
  type; do not use a loose dictionary that permits another Module's controls.
- Baseline parameter values are the effective live Course values. Preserve existing
  parameter ranges and extend them only enough to include those baseline values. Reject
  non-finite numbers, non-integral counts, unknown keys and invalid assembly combinations.
  Additional controls and arbitrary runtime mesh editing are outside scope.
- `src/assets/buildAuthoredSpec.ts` exports
  `buildAuthoredSpec(asset: AuthoredAsset, tuning: ModuleTuning): Spec` as a pure operation.
  JSON geometry/control data is enough for headless construction; GLB loading is a render
  concern. Extend `VisualSpec` with authored mesh references and serializable deformation
  bindings in `src/modules/types.ts`; preserve procedural visual support for connectors
  and Board. No Three.js scene objects or loading promises enter `Spec`.
- Preserve rest geometry and per-part control bindings. At baseline values, transforms
  are identity and geometry remains unchanged. For supported edits, deform saved geometry
  relative to its authored rest state rather than regenerate an idealized replacement.
  The same placement/deformation math updates colliders, visual bindings, route, markers
  recovery boxes and bounds. Recompute occupied Cells from the resulting Footprint.
- Chute binds floor and rails to longitudinal, width and slope controls. Pin field binds
  authored posts and rail bumpers to rows and placement controls, preserving alternating
  spacing and required gaps. Staircase binds authored tread/riser groups to step placement
  and repetition. Whoops binds authored surface samples and cuboid plates to the wave
  reference profile; amplitude, wavelength, grade and length changes preserve authored
  offsets, update plate frames and extend/trim only the explicitly repeatable wave region.
  End sections remain identifiable. No arbitrary triangle mesh is assumed deformable.
- Keep per-Module transformations in `src/assets/tuning/{chute,pinField,staircase,whoops}.ts`.
  These are small explicit adapters for the agreed controls, not a generic modeling engine.
  Export rejects assets whose edits invalidate the required structured bindings.
- Change `assembleCourse` to accept optional settings/catalog inputs while preserving
  existing callers and seeded Module ordering. In `src/course/board.ts`, derive Board
  dimensions and placement from the actual configured Specs, using the existing topology
  and occupancy checks. Rebuild procedural connectors, checkpoints and route data. A
  rejected configuration leaves the previous runnable Course and saved settings intact.

### Settings and local save API

- `src/config/module-settings.json` is the single saved shared configuration, initialized
  from the current Course. `src/assets/settings.ts` exports
  `parseModuleSettings(value: unknown): ModuleSettings` and
  `loadSavedModuleSettings(): ModuleSettings` for consumers.
- Add `GET /__dev/module-settings` returning `SettingsSnapshot` with `settings` and a
  content-hash `revision`; add `PUT /__dev/module-settings` accepting `SaveSettingsRequest`
  with `settings` and `expectedRevision`. A successful write returns the new snapshot.
- Implement only in Vite's development middleware, `scripts/dev/moduleSettingsPlugin.ts`.
  Accept same-origin JSON requests on loopback development hosting, cap bodies at 64 KiB,
  and write only the fixed configuration path. Reject unknown parameters and unusable Course
  geometry with 422, malformed requests with 400, stale revisions with 409, and I/O errors
  with 500. Preserve the prior file using temporary-file plus atomic-rename writes and
  serialize concurrent saves so revision checks cannot race. No client-supplied paths,
  CORS wildcard, production endpoint or automatic persistence.
- A stale-save response preserves the draft and asks the author to reload current saved
  values before explicitly saving again; do not silently overwrite or merge. Exact error
  wording is an implementation detail and does not change this behavior.
- `src/dev/moduleSettingsClient.ts` exposes
  `readModuleSettings(): Promise<SettingsSnapshot>` and
  `saveModuleSettings(request: SaveSettingsRequest): Promise<SettingsSnapshot>`.
  HTTP failures are surfaced as visible errors, including conflicts.

### Development UI

- Add `src/dev/ModuleTuningPanel.tsx` to `src/dev/coursePreview.tsx`. Select a Module
  from the placed-Module list, edit its shared parameters, restart to apply, and explicitly
  Save. Show pending/applied/saved state and errors. Clicking a marble or creating a new
  editor application is not required.
- Preserve seed, Roster and Selection Mode when applying tuning. Restart recreates the
  Course/physics world; no geometry mutation occurs during a race. Save validates the
  draft but does not mutate the currently running world or unexpectedly restart it via HMR.
- Reuse the same panel/settings model in `src/showcase/Showcase.tsx`, with the existing
  Feeder and metrics. A shared draft may be inspected in either view; saved configuration
  is the common durable state, not a separate Showcase preset.
- Keep authoring UI and save client behind `import.meta.env.DEV`; built review pages may
  remain viewers as today. Production picker behavior and local race history are unchanged.
- Cache GLB loads, reuse immutable geometry/material data, and clone only data affected by
  tuning. Dispose replaced owned resources. Preserve practical responsiveness on the same
  device and camera view; do not introduce a benchmark suite or arbitrary performance SLA.

### Comparison, migration and retirement

1. Capture current effective geometry and settings before modifying any geometry emitter.
2. Load unchanged exports alongside the baseline via an explicit development comparison
   mode. Keep old/new Course views on the same seed and configuration; side-by-side visual
   inspection is supported and physics runs may be compared in turn to avoid doubled load.
3. Enable supported tuning only after the unchanged round trip is checked. Compare static
   geometry, start release, travel through each Module, connector continuity and finish.
   The user judges whether pacing and passing remain satisfactory; finish order need not match.
4. After the user's approval of all migrated Modules, promote authored assets to the normal
   path and retire replaced Module emitters and comparison wiring. Keep baseline data and
   Git history as reference. Never remove tests to conceal failures; adapt tests to the
   replacement contract while preserving applicable behavioral coverage.

Existing typecheck and related tests run per phase; the full existing suite and production
build run once at the end. New tests target asset corruption, geometry/control alignment,
reassembly regressions and local save integrity only. No new statistical acceptance gates,
large seed matrix, CI-watching requirement or quantitative fairness project.

### Documentation

`docs/blender-authoring.md` documents the source/export/tune/save loop and named structure.
Record the agreed authoring boundary in `docs/adr/0004-blender-authored-module-assets.md`;
reconcile ADRs 0002 and 0003 with the pure shared asset-derived Spec and actual collider
representations. The migration does not change the Board topology decision in ADR 0001.

## Reference

[Video-inspired Module shortlist](../../docs/references/2026-09-08-marble-module-shortlist.html)
records possible future additions. It does not expand this migration's scope.

## Runtime foundations integration

Use `RegisteredModule.course.defaults` as the effective Course parameter source.
`courseParamValues` remains its public accessor; do not restore a second eligibility
whitelist during migration. Preserve optional `Spec.recoveryBoxes` as local-space
position/rotation/half-extents metadata in asset.json and in buildAuthoredSpec.
Box collections form a union, apply only to the active Module section, and remain
independent from colliders and ranking routes. Omitted/empty collections retain
legacy corridor recovery. Supported tuning must transform boxes consistently;
reject unsupported box deformation instead of silently widening valid space.
Existing Module baseline Specs omit boxes, and baseline export must preserve that.
