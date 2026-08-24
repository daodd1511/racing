import { DEFAULT_RACE_CONFIG } from "../race/config";
import type { RaceRequest, RaceSnapshot } from "../race/liveTypes";
import { createMarbleStyles, type MarbleStyle } from "../render/marbleStyles";
import { formatRaceTime } from "./Standings";

export interface ResultPanelProps {
  readonly request: RaceRequest;
  readonly snapshot: RaceSnapshot;
  readonly selectedMarbleIndex: number;
  readonly finishOrder: readonly number[];
  readonly finalRanking: readonly number[];
  readonly onNewRace: () => void;
}

function marbleName(roster: readonly string[], marbleIndex: number): string {
  return roster[marbleIndex] ?? `Marble ${marbleIndex + 1}`;
}

function selectionModeLabel(selectionMode: RaceRequest["selectionMode"]): string {
  return selectionMode === "first" ? "First finisher" : "Last finisher";
}

function RaceOrder({
  heading,
  order,
  roster,
  marbleStyles,
}: {
  readonly heading: string;
  readonly order: readonly number[];
  readonly roster: readonly string[];
  readonly marbleStyles: readonly MarbleStyle[];
}) {
  return (
    <section className="result-panel__order" aria-label={heading}>
      <h2>{heading}</h2>
      <ol>
        {order.map((marbleIndex, index) => (
          <li key={`${heading}-${marbleIndex}`}>
            <span className="result-panel__rank">{String(index + 1).padStart(2, "0")}</span>
            <span
              aria-hidden="true"
              className="result-panel__swatch"
              style={{ background: marbleStyles[marbleIndex]?.color ?? "#ffffff" }}
            />
            {marbleName(roster, marbleIndex)}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ResultPanel({
  request,
  snapshot,
  selectedMarbleIndex,
  finishOrder,
  finalRanking,
  onNewRace,
}: ResultPanelProps) {
  const selectedName = marbleName(request.roster, selectedMarbleIndex);
  const marbleStyles = createMarbleStyles(request.roster.length);
  const selectedStyle = marbleStyles[selectedMarbleIndex];

  return (
    <section aria-labelledby="result-panel-title" className="result-panel">
      <p className="result-panel__label">{DEFAULT_RACE_CONFIG.resultLabel}</p>
      <div className="result-panel__selection">
        <span
          aria-label={`Selected marble: ${selectedName}, ${selectedStyle?.pattern ?? "solid"} pattern`}
          className="result-panel__marble"
          style={{
            background: selectedStyle?.color ?? "#ffffff",
            borderColor: selectedStyle?.accentColor ?? "#12171c",
          }}
        />
        <h1 id="result-panel-title">{selectedName}</h1>
      </div>
      <dl className="result-panel__details">
        <div>
          <dt>Seed</dt>
          <dd>{request.seed}</dd>
        </div>
        <div>
          <dt>Selection Mode</dt>
          <dd>{selectionModeLabel(request.selectionMode)}</dd>
        </div>
        <div>
          <dt>Simulation time</dt>
          <dd>{formatRaceTime(snapshot.elapsedSeconds)}</dd>
        </div>
      </dl>
      <div className="result-panel__orders">
        <RaceOrder
          heading="Finish order"
          marbleStyles={marbleStyles}
          order={finishOrder}
          roster={request.roster}
        />
        <RaceOrder
          heading="Final ranking"
          marbleStyles={marbleStyles}
          order={finalRanking}
          roster={request.roster}
        />
      </div>
      <button className="result-panel__new-race" onClick={onNewRace} type="button">
        New race
      </button>
    </section>
  );
}
