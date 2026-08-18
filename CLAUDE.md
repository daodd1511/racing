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
