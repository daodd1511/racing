import type { Course } from "../course/types";
import { createMarbleStyles, type MarbleStyle } from "../render/marbleStyles";
import type { RaceSnapshot } from "../race/liveTypes";
import type { SelectionMode } from "../race/types";

export interface StandingsProps {
  readonly course: Course;
  readonly roster: readonly string[];
  readonly snapshot: RaceSnapshot | null;
  readonly finalRanking?: readonly number[];
  readonly marbleStyles?: readonly MarbleStyle[];
  readonly selectionMode?: SelectionMode;
}

export interface StandingRow {
  readonly marbleIndex: number;
  readonly position: number;
  readonly name: string;
  readonly color: string;
  readonly decisive: boolean;
  readonly checkpoint: number | null;
  readonly latestSplitSeconds: number | null;
}

function stableRosterOrder(roster: readonly string[]): readonly number[] {
  return Object.freeze(roster.map((_, marbleIndex) => marbleIndex));
}

function latestSplit(splitTimes: readonly (number | null)[]): number | null {
  for (let index = splitTimes.length - 1; index >= 0; index -= 1) {
    const split = splitTimes[index];
    if (split !== null) return split;
  }
  return null;
}

export function formatRaceTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
}

export function courseProgress(checkpoint: number | null, checkpointCount: number): number {
  if (checkpoint === null || checkpointCount <= 0) return 0;
  return Math.min(1, Math.max(0, checkpoint / checkpointCount));
}

export function createStandingsRows({
  roster,
  snapshot,
  finalRanking,
  marbleStyles = createMarbleStyles(roster.length),
}: Omit<StandingsProps, "course">): readonly StandingRow[] {
  const ranking = finalRanking ?? snapshot?.ranking ?? stableRosterOrder(roster);
  return Object.freeze(
    ranking.map((marbleIndex, index) => {
      const passedCheckpoint = snapshot?.passedCheckpoints[marbleIndex] ?? null;
      const splits = snapshot?.splitTimes[marbleIndex] ?? [];
      return Object.freeze({
        marbleIndex,
        position: index + 1,
        name: roster[marbleIndex] ?? `Marble ${marbleIndex + 1}`,
        color: marbleStyles[marbleIndex]?.color ?? "#ffffff",
        decisive: snapshot?.decisiveMarbleIndex === marbleIndex,
        checkpoint: passedCheckpoint === null ? null : passedCheckpoint + 1,
        latestSplitSeconds: latestSplit(splits),
      });
    }),
  );
}

export function Standings({
  course,
  roster,
  snapshot,
  finalRanking,
  marbleStyles,
  selectionMode = "first",
}: StandingsProps) {
  const rows = createStandingsRows({ roster, snapshot, finalRanking, marbleStyles });
  const checkpointCount = course.checkpoints.length;
  const decisiveLabel = selectionMode === "first" ? "Leader pick" : "Last pick";

  return (
    <section aria-labelledby="standings-title" className="standings">
      <header className="standings__header">
        <p>Live order</p>
        <h2 id="standings-title">Standings</h2>
      </header>
      <div className="standings__scroll">
        <ol className="standings__list">
          {rows.map((row) => {
            const checkpoint =
              row.checkpoint === null ? "Pending" : `CP ${row.checkpoint} / ${checkpointCount}`;
            const split =
              row.latestSplitSeconds === null ? "—" : formatRaceTime(row.latestSplitSeconds);
            const progress = courseProgress(row.checkpoint, checkpointCount);
            return (
              <li
                className={`standings__row${row.decisive ? " standings__row--decisive" : ""}`}
                key={row.marbleIndex}
                style={{ "--marble-color": row.color } as React.CSSProperties}
              >
                <span aria-label={`Position ${row.position}`} className="standings__position">
                  {String(row.position).padStart(2, "0")}
                </span>
                <span
                  aria-hidden="true"
                  className="standings__marble"
                  style={{ background: row.color }}
                />
                <span className="standings__name">{row.name}</span>
                {row.decisive ? <span className="standings__decisive">{decisiveLabel}</span> : null}
                <span aria-label={`Latest split ${split}`} className="standings__split">
                  {split}
                </span>
                <span aria-hidden="true" className="standings__track">
                  <span
                    className="standings__track-fill"
                    style={{ width: `${(progress * 100).toFixed(1)}%` }}
                  />
                </span>
                <span className="standings__checkpoint">{checkpoint}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
