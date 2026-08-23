import type { BoardSpec, Course } from "../course/types";
import { createMarbleStyles, type MarbleStyle } from "../render/marbleStyles";
import type { Vector3 } from "./types";
import type { RaceSnapshot } from "./liveTypes";

const VIEWBOX_SIZE = 100;
const MAP_PADDING = 2;

export interface CourseMinimapProps {
  readonly board: BoardSpec;
  readonly course: Course;
  readonly snapshot: RaceSnapshot | null;
  readonly roster: readonly string[];
  readonly marbleStyles?: readonly MarbleStyle[];
}

export interface MinimapPoint {
  readonly x: number;
  readonly y: number;
}

function clamp(value: number): number {
  return Math.min(VIEWBOX_SIZE - MAP_PADDING, Math.max(MAP_PADDING, value));
}

export function projectBoardPoint(board: BoardSpec, position: Vector3): MinimapPoint {
  const width = board.bounds.max[0] - board.bounds.min[0];
  const height = board.bounds.max[1] - board.bounds.min[1];
  return Object.freeze({
    x: clamp(((position[0] - board.bounds.min[0]) / width) * VIEWBOX_SIZE),
    y: clamp(VIEWBOX_SIZE - ((position[1] - board.bounds.min[1]) / height) * VIEWBOX_SIZE),
  });
}

function routePoints(board: BoardSpec, route: readonly Vector3[]): string {
  return route
    .map((position) => {
      const point = projectBoardPoint(board, position);
      return `${point.x},${point.y}`;
    })
    .join(" ");
}

function decisiveLabel(roster: readonly string[], marbleIndex: number): string {
  return roster[marbleIndex] ?? `Marble ${marbleIndex + 1}`;
}

/** Accessible Board-space overview. It keeps a distinct diamond and text
 * label on the decisive marble, so selection remains legible without color. */
export function CourseMinimap({
  board,
  course,
  snapshot,
  roster,
  marbleStyles = createMarbleStyles(roster.length),
}: CourseMinimapProps) {
  const route = routePoints(board, course.route);
  const decisiveIndex = snapshot?.decisiveMarbleIndex ?? null;

  return (
    <svg
      aria-label="Course minimap"
      className="course-minimap"
      role="img"
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
    >
      <title>Course minimap</title>
      <rect
        className="course-minimap__board"
        height={VIEWBOX_SIZE}
        width={VIEWBOX_SIZE}
        x="0"
        y="0"
      />
      <polyline className="course-minimap__route" fill="none" points={route} />
      {course.checkpoints.map(({ slotIndex, anchor }) => {
        const point = projectBoardPoint(board, anchor.position);
        return (
          <circle
            key={slotIndex}
            aria-label={`Checkpoint ${slotIndex + 1}`}
            className="course-minimap__checkpoint"
            cx={point.x}
            cy={point.y}
            r="0.75"
          />
        );
      })}
      {snapshot?.marbleTransforms.map((marble) => {
        const point = projectBoardPoint(board, marble.position);
        const isDecisive = marble.marbleIndex === decisiveIndex;
        const label = decisiveLabel(roster, marble.marbleIndex);
        const color = marbleStyles[marble.marbleIndex]?.color ?? "#ffffff";
        return isDecisive ? (
          <g key={marble.marbleIndex} aria-label={`Decisive marble: ${label}`}>
            <path
              className="course-minimap__marble course-minimap__marble--decisive"
              d={`M ${point.x} ${point.y - 2.4} L ${point.x + 2.4} ${point.y} L ${point.x} ${point.y + 2.4} L ${point.x - 2.4} ${point.y} Z`}
              fill={color}
            />
            <text className="course-minimap__decisive-label" x={point.x + 3} y={point.y - 2.5}>
              Decisive: {label}
            </text>
          </g>
        ) : (
          <circle
            key={marble.marbleIndex}
            aria-label={`Marble: ${label}`}
            className="course-minimap__marble"
            cx={point.x}
            cy={point.y}
            fill={color}
            r="1.25"
          />
        );
      })}
    </svg>
  );
}
