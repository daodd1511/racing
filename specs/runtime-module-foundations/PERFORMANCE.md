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

| Work | Before | After |
| --- | ---: | ---: |
| Total step average | 4.210 ms | 2.619 ms |
| Physics average | 2.183 ms | 2.365 ms |
| Other runtime work | 2.027 ms | 0.254 ms |
| Total step p95 | 8.508 ms | 6.251 ms |

This sample reduced total step CPU time by about 38%, and surrounding runtime
work by about 87%. Physics timing varied, although physics code/settings were
unchanged. These are sequential local measurements, not a controlled benchmark
suite or a claim about browser FPS. Both comparisons remain documented so the
unread-snapshot case is not confused with typical displayed frames.

A subsequent unchanged serial gate run passed all 34 tests in eight files (74.74 s total), plus typecheck. The prior timeouts did not reproduce; no test or timeout was weakened. Phase 1 verification debt is cleared.
