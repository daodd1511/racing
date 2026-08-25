# Module calibration report

Matrix: `full`. Threshold table version: proposed `v1` (unfrozen pending explicit approval).
Rapier version: `0.19.2`.
Compute seconds: 14.683.

## Calibration decision

This report proposes the complete `v1` threshold table below. It does not approve or freeze
it. Chute, Whoops, and Staircase fail their claimed Role under the corrected evidence; Pin
field passes wide-entry Scatter. Those failures are findings, not reasons to lower a gate.
Phase 2 must remediate them under the plan's correction limits after the user explicitly
approves this report and table.

All behavioral gates are conjunctive. Improvement in one statistic never offsets failure in
another. Safety is also conjunctive: any stall or 15-second timeout fails the configuration,
even when enough completions remain to calculate diagnostic behavior statistics.

## Proposed Role threshold table — `v1`

| Contract | Proposed gate | Calibration basis |
|---|---|---|
| Accel | Exit-speed lift ratio against the matched control `>= 1.05`; absolute lateral-span change `<= 0.05 m`; temporal-gap widening `<= 0.05 s`; absolute entry/exit `tau-b >= 0.80` | A 5% lift exceeds the tight seed-level exit-speed confidence intervals without rewarding noise. The redistribution limits reject lateral spreading, widened gaps, or order disruption as substitute acceleration. Chute measures `0.930` Burst and `0.891` Continuous, so it fails. |
| Wide-entry Scatter | Absolute lateral `tau-b <= 0.25`; matched-control minus Module absolute `tau-b >= 0.50`; exit occupancy `>= 0.67` and `>= 0.90 ×` control occupancy | Synthetic preserved order reads `1`; the random/decorrelated fixture reads near `0`. Pin field reads `0.058` Burst and `0.006` Continuous against controls near `1`, with full occupancy. |
| Constrained-entry Scatter | Mean exit-span ratio against the constraining control `>= 1.50`; exit-lane entropy lift `>= 0.25 bits`; mean exit span `>= 0.064 m` | Synthetic constrained inputs have zero entry span, so entry collapse earns no credit. The gate requires both a material span increase and seed-dependent lane diversity. `0.064 m` is two marble diameters. |
| Shuffle | Mean absolute entry/exit Kendall `tau-b <= 0.30` and average pairwise outcome entropy `>= 0.80 bits` | Deterministic preservation and reversal both produce `1.0 / 0 bits`; the varied-order synthetic fixture exceeds `0.80 bits`. Whoops reads `0.652 / 0.393` Burst and `1 / 0` Continuous, so it fails. |
| Sort | Mean temporal-separation ratio against the matched control `>= 1.25` | A 25% lift is materially above the near-identity control result and cannot be met by release cadence alone. Staircase reads `0.381` Burst and `1.002` Continuous, so it fails. Single is not an applicable Sort cohort. |
| Dwell safety | Module `p95` Dwell divided by matched-control `p95 <= 4.00`; report maximum Dwell diagnostically | Pin field is the limiting current default at `3.864`; other current defaults are `<= 1.107`. The round 4× ceiling retains small margin without preserving the invalid legacy `p99` label. |
| Stall and timeout safety | Exactly zero stalls and zero 15-second timeouts | All current defaults satisfy this in the full matrix. No behavioral result can waive a failure. |
| Cohort validity | Behavior available with at least `240 / 300` completed Burst runs, `240 / 300` completed Continuous runs, or `48 / 60` completed Single runs | The 80% diagnostic floor prevents a small survivor set from presenting behavior as representative. Safety still fails on the first stall or timeout. |
| Break table field-size identity | Lone-marble exit span `< 0.25 ×` Burst 15 exit span across the 60-seed Single matrix | Freezes the plan's provisional 25% ratio. Synthetic lone-versus-packed fixtures distinguish field-driven spread from a geometry that scatters isolated marbles. |

Applicable feed profiles are Role-specific: Accel uses Burst and Continuous plus Single
identity evidence; both Scatter modes use Burst and Continuous, with Single reserved for
field-size identity; Shuffle uses Burst and Continuous; Sort uses Burst and Continuous.

## Method, distributions, and exclusions

- The corrected matrix uses `20 × 15 = 300` Burst runs, `10 × 30 = 300` Continuous runs,
  and 60 Single seeds for each default parameter configuration. Phase 2 separately owns
  exhaustive legal-configuration validation and schema narrowing.
- Module and negative-control runs share seeds, nominal placements, anchors, energy change,
  grade, and entry constraint. The control replaces the Role mechanism with a plain channel.
- Table distributions are run-level p05/median/p95. Confidence intervals are deterministic
  2,000-resample bootstrap 95% intervals over seed-level means, so marbles from one physics
  cohort are not treated as independent seeds.
- There were zero excluded runs, zero stalls, and zero timeouts in every corrected default
  matrix. The exclusion column remains explicit so a later incomplete cohort cannot vanish
  from the report.
- Legacy comparisons use the old frame-relative, spawn-inside-Module harness and its invalid
  small-sample `p99` label. They document the before state only and have no acceptance
  authority.
- The 14.683-second compute cost covers all corrected Module/control matrices and invalid
  legacy comparisons on the calibration machine. Rapier is fixed at `0.19.2`.

## Existing Module conclusions

- **Chute — Accel fails.** It is safe, but its exit-speed ratio is below `1` for every feed
  profile; it is slower than the energy-matched plain-channel control.
- **Pin field — wide-entry Scatter passes at the default configuration.** It strongly
  decorrelates lateral order, retains full exit occupancy, and remains below the 4× Dwell
  ratio. Phase 2 must still enumerate every legal configuration.
- **Staircase — Sort fails.** Burst temporal separation is only `0.381 ×` control and
  Continuous is effectively identical to control (`1.002 ×`).
- **Whoops — Shuffle fails.** Burst evidence misses both gates, and Continuous deterministically
  preserves order (`tau-b 1`, entropy `0`).

## chute

Parameters: `{"length":0.6,"grade":0.25,"width":0.5}`.
Compute seconds: 3.364.

Legacy pre-correction comparison (invalid as acceptance authority): 300 / 300 completed; 0 stalls; Dwell p50 0.816667; Dwell p99 label 1.250000.

| Profile | Seeds | Completed / total | Excluded | Stalls | Timeouts | Dwell p05 / p50 / p95 | Control Dwell p95 | Dwell p95 ratio | Exit speed p05 / p50 / p95 | Dwell seed-mean 95% CI | Exit-speed seed-mean 95% CI | Maximum Dwell | Role evidence |
|---|---:|---:|---:|---:|---:|---|---:|---:|---|---|---|---:|---|
| burst15 | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19 | 300 / 300 | 0 | 0 | 0 | 0.544426 / 0.596085 / 0.670542 | 0.729396 | 0.919312 | 1.481160 / 1.535325 / 1.589586 | 0.603730–0.604665 | 1.536554–1.537908 | 0.683684 | `{"role":"accel","meanExitSpeed":1.5371867304240132,"controlMeanExitSpeed":1.6536818875283714,"exitSpeedLiftRatio":0.9295540708385732,"lateralSpanChange":-0.011380603056695637,"temporalGapChange":-0.009688251742161084,"absoluteEntryExitTauB":0.7016722408026755}` |
| continuous | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 | 300 / 300 | 0 | 0 | 0 | 0.506788 / 0.512657 / 0.521688 | 0.671053 | 0.777418 | 1.643295 / 1.643358 / 1.670260 | 0.512427–0.513344 | 1.644615–1.646231 | 0.531157 | `{"role":"accel","meanExitSpeed":1.6454215785528736,"controlMeanExitSpeed":1.8462152161617447,"exitSpeedLiftRatio":0.8912403950248454,"lateralSpanChange":0,"temporalGapChange":-0.0002173984832004594,"absoluteEntryExitTauB":0.9724787359290717}` |
| single | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59 | 60 / 60 | 0 | 0 | 0 | 0.507304 / 0.513196 / 0.521037 | 0.676459 | 0.770242 | 1.643295 / 1.643358 / 1.670261 | 0.512449–0.514725 | 1.643356–1.646490 | 0.528610 | `{"role":"accel","meanExitSpeed":1.6447011760075938,"controlMeanExitSpeed":1.8446574488881844,"exitSpeedLiftRatio":0.8916024907491044,"lateralSpanChange":0,"temporalGapChange":0,"absoluteEntryExitTauB":0.20367745939695822}` |

## pin-field

Parameters: `{"rowCount":10,"postSpacing":0.10463746025267581,"postHeight":0.0511872,"postWidth":0.027264,"rowPitch":0.12033307929057717}`.
Compute seconds: 4.198.

Legacy pre-correction comparison (invalid as acceptance authority): 300 / 300 completed; 0 stalls; Dwell p50 3.016667; Dwell p99 label 5.066667.

| Profile | Seeds | Completed / total | Excluded | Stalls | Timeouts | Dwell p05 / p50 / p95 | Control Dwell p95 | Dwell p95 ratio | Exit speed p05 / p50 / p95 | Dwell seed-mean 95% CI | Exit-speed seed-mean 95% CI | Maximum Dwell | Role evidence |
|---|---:|---:|---:|---:|---:|---|---:|---:|---|---|---|---:|---|
| burst15 | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19 | 300 / 300 | 0 | 0 | 0 | 2.277394 / 2.865582 / 3.735372 | 1.290347 | 2.894859 | 1.289270 / 1.430139 / 1.868666 | 2.885564–2.983851 | 1.480061–1.515977 | 5.465845 | `{"role":"scatter","mode":"wide-entry","absoluteLateralTauB":0.05810479375696767,"controlAbsoluteLateralTauB":0.9952731326644371,"exitOccupancy":1,"controlExitOccupancy":1}` |
| continuous | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 | 300 / 300 | 0 | 0 | 0 | 2.145446 / 2.893090 / 3.994045 | 1.094899 | 3.647867 | 1.292097 / 1.397788 / 1.911854 | 2.892337–3.016789 | 1.456085–1.517616 | 5.316333 | `{"role":"scatter","mode":"wide-entry","absoluteLateralTauB":0.005707915273132664,"controlAbsoluteLateralTauB":1,"exitOccupancy":1,"controlExitOccupancy":1}` |
| single | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59 | 60 / 60 | 0 | 0 | 0 | 2.100855 / 2.762855 / 4.282853 | 1.108447 | 3.863831 | 1.293291 / 1.395099 / 1.863770 | 2.722545–3.021243 | 1.410605–1.491321 | 5.131559 | `{"role":"scatter","mode":"wide-entry","absoluteLateralTauB":0.14350282485875707,"controlAbsoluteLateralTauB":1,"exitOccupancy":1,"controlExitOccupancy":1}` |

## staircase

Parameters: `{"stepCount":5,"tread":0.12,"riseHeight":0.03,"width":0.5}`.
Compute seconds: 3.416.

Legacy pre-correction comparison (invalid as acceptance authority): 300 / 300 completed; 0 stalls; Dwell p50 1.400000; Dwell p99 label 2.983333.

| Profile | Seeds | Completed / total | Excluded | Stalls | Timeouts | Dwell p05 / p50 / p95 | Control Dwell p95 | Dwell p95 ratio | Exit speed p05 / p50 / p95 | Dwell seed-mean 95% CI | Exit-speed seed-mean 95% CI | Maximum Dwell | Role evidence |
|---|---:|---:|---:|---:|---:|---|---:|---:|---|---|---|---:|---|
| burst15 | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19 | 300 / 300 | 0 | 0 | 0 | 0.997149 / 1.078316 / 1.178845 | 1.065189 | 1.106700 | 0.851370 / 0.882436 / 1.030605 | 1.086489–1.087738 | 0.918028–0.919141 | 1.179773 | `{"role":"sort","meanTemporalSeparation":0.010304166019403288,"controlMeanTemporalSeparation":0.0270299412962193,"temporalSeparationRatio":0.38121303729374134}` |
| continuous | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 | 300 / 300 | 0 | 0 | 0 | 0.943823 / 0.947804 / 0.956238 | 0.886996 | 1.078064 | 0.979166 / 0.979220 / 0.987692 | 0.947728–0.948395 | 0.981001–0.981858 | 0.963162 | `{"role":"sort","meanTemporalSeparation":0.3999689114184994,"controlMeanTemporalSeparation":0.39923381974269884,"temporalSeparationRatio":1.001841256024538}` |
| single | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59 | 60 / 60 | 0 | 0 | 0 | 0.943868 / 0.947878 / 0.955604 | 0.888489 | 1.075539 | 0.979155 / 0.979185 / 0.987407 | 0.946988–0.948701 | 0.980199–0.981610 | 0.961234 | `{"role":"sort","meanTemporalSeparation":0,"controlMeanTemporalSeparation":0,"temporalSeparationRatio":null}` |

## whoops

Parameters: `{"amplitude":0.006,"wavelength":0.3,"length":1.2,"grade":0.55,"width":0.5}`.
Compute seconds: 3.706.

Legacy pre-correction comparison (invalid as acceptance authority): 300 / 300 completed; 0 stalls; Dwell p50 0.883333; Dwell p99 label 1.116667.

| Profile | Seeds | Completed / total | Excluded | Stalls | Timeouts | Dwell p05 / p50 / p95 | Control Dwell p95 | Dwell p95 ratio | Exit speed p05 / p50 / p95 | Dwell seed-mean 95% CI | Exit-speed seed-mean 95% CI | Maximum Dwell | Role evidence |
|---|---:|---:|---:|---:|---:|---|---:|---:|---|---|---|---:|---|
| burst15 | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19 | 300 / 300 | 0 | 0 | 0 | 0.724317 / 0.785602 / 0.855761 | 1.120317 | 0.763856 | 2.649059 / 3.175435 / 3.575140 | 0.783838–0.788648 | 3.094909–3.154228 | 0.893612 | `{"role":"shuffle","meanAbsoluteTauB":0.6523809523809522,"averagePairwiseOutcomeEntropy":0.39268890710119714}` |
| continuous | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 | 300 / 300 | 0 | 0 | 0 | 0.699516 / 0.747165 / 0.758044 | 0.903745 | 0.838781 | 2.835436 / 3.022135 / 3.549613 | 0.733014–0.736684 | 3.043161–3.109921 | 0.804057 | `{"role":"shuffle","meanAbsoluteTauB":1,"averagePairwiseOutcomeEntropy":0}` |
| single | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59 | 60 / 60 | 0 | 0 | 0 | 0.698330 / 0.751166 / 0.762390 | 0.903283 | 0.844021 | 2.760118 / 2.889685 / 3.562313 | 0.723823–0.737278 | 2.888706–3.154690 | 0.778534 | `{"role":"shuffle","meanAbsoluteTauB":null,"averagePairwiseOutcomeEntropy":0}` |
