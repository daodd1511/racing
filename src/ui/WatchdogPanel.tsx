import type { RaceOutcome, RaceRequest } from "../race/liveTypes";
import { formatRaceTime } from "./Standings";

export interface WatchdogPanelProps {
  readonly request: RaceRequest;
  readonly outcome: Extract<RaceOutcome, { readonly kind: "watchdog" }>;
  readonly onRetryRace: () => void;
  readonly onBackToSetup: () => void;
}

function marbleName(roster: readonly string[], marbleIndex: number): string {
  return roster[marbleIndex] ?? `Marble ${marbleIndex + 1}`;
}

export function WatchdogPanel({
  request,
  outcome,
  onRetryRace,
  onBackToSetup,
}: WatchdogPanelProps) {
  const unfinishedNames = outcome.unfinishedMarbleIndices.map((marbleIndex) =>
    marbleName(request.roster, marbleIndex),
  );

  return (
    <section aria-labelledby="watchdog-panel-title" className="watchdog-panel">
      <p className="watchdog-panel__eyebrow">Watchdog limit reached</p>
      <h1 id="watchdog-panel-title">Race needs attention</h1>
      <p className="watchdog-panel__intro">
        This Course did not finish within the simulation limit. No race history was saved.
      </p>
      <dl className="watchdog-panel__details">
        <div>
          <dt>Seed</dt>
          <dd>{outcome.seed}</dd>
        </div>
        <div>
          <dt>Simulation time</dt>
          <dd>{formatRaceTime(outcome.elapsedSeconds)}</dd>
        </div>
      </dl>
      <section aria-labelledby="unfinished-marbles-title" className="watchdog-panel__unfinished">
        <h2 id="unfinished-marbles-title">Unfinished marbles</h2>
        <ul>
          {unfinishedNames.map((name, index) => (
            <li key={`${name}-${index}`}>{name}</li>
          ))}
        </ul>
      </section>
      <div className="watchdog-panel__actions">
        <button className="watchdog-panel__retry" onClick={onRetryRace} type="button">
          Retry race
        </button>
        <button className="watchdog-panel__back" onClick={onBackToSetup} type="button">
          Back to setup
        </button>
      </div>
    </section>
  );
}
