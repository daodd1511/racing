// Live readout of what the Feeder has observed on the current stage --
// deliberately plain: the broadcast chrome (Spec 4) restyles this later.
// What matters this phase is that every number here is real, computed from
// the same primitives (`measureDwell`, `shuffleCoefficient`, ...) the
// headless Validator uses, not a separate approximation for display.

export interface LiveMetricsState {
  /** Marbles that have exited or stalled -- i.e. finished one way or the
   * other. Excludes marbles still in flight, which haven't earned a place
   * in either count yet. */
  readonly resolved: number;
  readonly exited: number;
  readonly stalled: number;
  readonly dwellSecondsP50: number | null;
  readonly dwellSecondsP99: number | null;
  readonly meanExitSpeed: number | null;
  readonly shuffleCoefficient: number | null;
}

export const EMPTY_LIVE_METRICS: LiveMetricsState = Object.freeze({
  resolved: 0,
  exited: 0,
  stalled: 0,
  dwellSecondsP50: null,
  dwellSecondsP99: null,
  meanExitSpeed: null,
  shuffleCoefficient: null,
});

function formatSeconds(value: number | null): string {
  return value === null ? "--" : `${value.toFixed(2)}s`;
}

function formatSpeed(value: number | null): string {
  return value === null ? "--" : `${value.toFixed(2)} m/s`;
}

function formatCoefficient(value: number | null): string {
  return value === null ? "--" : value.toFixed(2);
}

export interface MetricsReadoutProps {
  readonly metrics: LiveMetricsState;
}

export function MetricsReadout({ metrics }: MetricsReadoutProps) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "0.25rem 0.75rem",
        margin: 0,
      }}
    >
      <dt>Dwell p50 / p99</dt>
      <dd style={{ margin: 0 }}>
        {formatSeconds(metrics.dwellSecondsP50)} / {formatSeconds(metrics.dwellSecondsP99)}
      </dd>
      <dt>Mean exit speed</dt>
      <dd style={{ margin: 0 }}>{formatSpeed(metrics.meanExitSpeed)}</dd>
      <dt>Shuffle</dt>
      <dd style={{ margin: 0 }}>{formatCoefficient(metrics.shuffleCoefficient)}</dd>
      <dt>Stalls</dt>
      <dd style={{ margin: 0 }}>
        {metrics.stalled} / {metrics.resolved}
      </dd>
    </dl>
  );
}
