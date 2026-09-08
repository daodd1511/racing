# Phase 1 performance evidence

## Setup

Measured 2026-09-08 on the local macOS arm64 host, Node/Vite SSR and Rapier 0.19.2.
Exact CPU model was unavailable because the sandbox denied sysctl. Browser checks
used the Codex in-app browser, Vite development server and course.html, seed 7,
15-member fixed roster, last selection, default harness camera. No production
build or browser profiler was run; these results are not production FPS claims.

The headless sample creates a fresh runtime per run, advances 1,800 steps at 1/60,
with contact collection disabled, and times world.step separately from runtime.step.
The Course has 22 Modules, 708 authored colliders and 1,702 route points.
The first run warms execution; the second is reported. Scripts remain temporary
under /private/tmp; reproduce with Vite SSR loading assembleCourse and
CourseRaceRuntime, initialize Rapier, and wrap World.prototype.step for timing.

## Initial comparison

Without reading returned snapshots, the before/after second-run averages were:

| Work               |   Before |    After |
| ------------------ | -------: | -------: |
| Total step         | 3.893 ms | 2.305 ms |
| Physics            | 1.922 ms | 2.096 ms |
| Other runtime work | 1.971 ms | 0.210 ms |
| Total step p95     | 6.872 ms | 5.491 ms |

Zero recoveries occurred in both samples. This comparison includes deferred
snapshot savings and therefore overstates the benefit for frames that display
all steps. A separate snapshot-consuming comparison follows below.

## Browser evidence and limits

Before changes, the harness loaded seed 7 / last / 15 marbles and advanced from
Ready to race to Racing with decisive-marble updates. After reload with changes,
it again started and updated the timer and decisive-marble display.

Browser frame-time distribution, React commit counts, renderer draw calls and
triangle counts were unavailable through the inspected browser controls. No FPS
improvement, eliminated visual stutter, or complete-race equivalence is claimed.
The user review checklist retains race-feel and completion review. Rendering and
camera smoothing are unchanged and remain phase 2 concerns.

## Close up review amendment

The user identified Close up as the primary camera on 2026-09-08. The Course
harness now defaults to Close up and offers Broadcast in the same control row.
Browser inspection confirmed Close up framing and switching to Broadcast at
6.90 simulated seconds, then back to Close up at 21.25 seconds without a restart.
Review close following, target handoffs and stutter in this view before judging
phase 1; these observations do not establish a frame-rate improvement.

## Verification notes

The initial unbounded related-test run was interrupted without results. A
2-worker run reported 32 passed and two 15-second simulation timeouts; a serial
rerun retains the same test scope and timeouts. Measurements concurrent with
those tests were discarded due to CPU contention.

The final serial related-test run completed: 30 passed, four failures, all existing
15-second timeouts in src/validator/validateCourse.test.ts. Typecheck passed after
the camera-control change. No functional assertion failure was reported. The gate
has not passed, and baseline timeout reproducibility has not been established.
Phase 1 remains in progress; commits were rejected by automatic approval review.

## Snapshot-consuming comparison

After tests finished and the review browser stopped rendering, the identical
harness read every returned snapshot inside the timed step. Baseline sources
came from main via a temporary Vite transform; current sources ran next.
Second-run results (1,800 steps each, zero recoveries):

| Work               |   Before |    After |
| ------------------ | -------: | -------: |
| Total step average | 4.210 ms | 2.619 ms |
| Physics average    | 2.183 ms | 2.365 ms |
| Other runtime work | 2.027 ms | 0.254 ms |
| Total step p95     | 8.508 ms | 6.251 ms |

This sample reduced total step CPU time by about 38%, and surrounding runtime
work by about 87%. Physics timing varied, although physics code/settings were
unchanged. These are sequential local measurements, not a controlled benchmark
suite or a claim about browser FPS. Both comparisons remain documented so the
unread-snapshot case is not confused with typical displayed frames.

A subsequent unchanged serial gate run passed all 34 tests in eight files (74.74 s total), plus typecheck. The prior timeouts did not reproduce; no test or timeout was weakened. Phase 1 verification debt is cleared.

## Phase 2 — direct rendering updates

The live scene, gate and camera consume RaceFrameRef directly. Physics publishes
at frame priority -2 before ordinary visual callbacks; camera damping constants
and the physics timestep are unchanged. The harness now throttles telemetry to
roughly 10 Hz, matching the production telemetry pattern.

Measured regression evidence: publishing a snapshot caused zero additional
LiveRace child renders in the new test; publishing an outcome did cause a render.
Other focused checks cover Close up movement without a rerender, resetting the
camera to staging, reading updated gate motion, old-channel cleanup and retained
external callbacks. The phase gate passed 29 tests across seven related files
plus project typecheck. An initial failure was an outdated BroadcastRace test
mock using snapshot props; its consumers now use the frame-ref contract.

The same development browser harness (seed 7, 15 marbles, Last) displayed staged
marbles and the gate in Close up, advanced to 25.38 simulated seconds, switched
to Broadcast at 44.12 seconds, and restarted in Close up at 0.38 seconds. The
minimap and decisive-marble text continued updating. Production labels still use
the same mesh-following group; their visual review remains on the user checklist.

No browser FPS, React profiler capture or renderer counters became available;
there is no measured percentage speedup for phase 2. Phase 1 headless results are
unchanged evidence, not a measurement of this rendering change. Full-race feel,
labels and close-following delay remain explicit user review items. No smoothing
fix or elimination of perceived lag is claimed.

## Phase 3 — Module foundations

Catalog migration preserves complete serialized Course output for seeds 7 and 17.
Before/after SHA-256 hashes of JSON.stringify(assembleCourse(seed)):

- Seed 7: `3dbeaf342e9677c8ebb71cb19d22396cf2d6dea4dd0d1b94e393e2f1a0219ae9`
- Seed 17: `cdc6c1baf0a655a12ddcc5826fc2bbae6c4ea14d7075866f295d942bd0749c3f`

This checks exact preservation for two examples, not general physics equivalence.
No current Module defines custom recovery boxes. The runtime checks boxes only
when the active Module supplies them; geometry, Course composition, camera
damping and physics settings remain unchanged.

Phase 3 dependency-aware verification passed 90 tests across 22 files (94.77 s), plus project typecheck. Full-suite/build results follow after the final spec gate.

Final spec gate passed 197 tests across 52 files (96.28 s), plus project typecheck
and the production build. Vite reported its shared chunk size warning; bundle
splitting was not changed in this spec.

Final snapshot-consuming headless sample, same seed/roster/step configuration:
2.249 ms mean total step, 1.999 ms physics, 0.250 ms surrounding work, 5.603 ms
p95 and zero recoveries over 1,800 steps. The runtime overhead remains near the
phase 1 optimized sample; variation in physics timing prevents attributing the
whole difference between runs to code changes. These remain CPU results, not FPS.

The production-built Course harness at localhost:5180/course.html loaded the
staged marbles and gate in Close up with seed 7 / 15 marbles / Last. Browser
frame-time counters remain unavailable; no claim that all perceived lag is gone.

The production browser race advanced to 19.10 simulated seconds, showing marbles
rounding a connector in Close up and matching minimap progress. This is a visual
smoke check, not full-race or frame-time verification.
