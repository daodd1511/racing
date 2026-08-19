# Marble Race Picker

## Domain Model & Decisions
<!-- domain-rulebook v1 -->

`CONTEXT.md` (repo root) is the project's glossary. Use its canonical terms — and avoid the
synonyms it marks `_Avoid_` — in code, docs, specs, and UI copy. It is a glossary only:
never add schema, file references, or implementation detail to it.

Recording a new term, or a decision worth keeping? Read `docs/DOMAIN-RULEBOOK.md` first — it
routes between `CONTEXT.md`, `docs/adr/`, and a spec's `PLAN.md`, and defines what does and
doesn't qualify as an ADR.

## Spec-Driven Execution Workflow
<!-- spec-workflow v1 -->

Specs live under `specs/`. A feature's plan is `specs/<feature-slug>/PLAN.md` and its phased
checklist is `specs/<feature-slug>/EXECUTION.md`.

The rules governing them — state model, branch model, gate lanes, checkpoints — are in
`specs/RULEBOOK.md`. Read it before doing any work on a spec, and before acting on a branch
named `<feature-slug>/phase-<n>-<desc>`: that branch shape means a spec is mid-execution and
git is its state store, so do not commit, squash, rebase, push, or open a PR on one by hand.

## Three.js and R3F Work
<!-- threejs-skills v1 -->

Before writing or reviewing three.js code, check the available `threejs-*` skills and load
the one matching the work. They are this project's reference for three.js, not a fallback
for when you get stuck — check first, not after a guess. The ones this codebase keeps
returning to: `threejs-geometry` for the Module geometry emitters in `src/modules/geometry/`,
`threejs-materials` for every `VisualSpec` material, `threejs-lighting` and
`threejs-postprocessing` for the Showcase canvas, and `threejs-fundamentals` for transforms,
quaternions, and coordinate frames. Use `react-frontend-developer` for the React side.

Those skills describe imperative three.js; this project drives it through React Three Fiber,
so translate before applying. R3F changes the lifecycle rules, and both of these have already
shipped bugs here: a geometry passed via the `geometry` prop is **not** disposed on replace
the way a JSX child is, and a value fed to an imperative prop such as `<RigidBody position>`
is re-applied on every render it changes.
