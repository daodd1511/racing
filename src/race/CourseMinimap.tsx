import { useId } from "react";

import type { BoardSpec, Course } from "../course/types";
import {
  createMarbleStyles,
  marbleStripeBackground,
  type MarbleStyle,
} from "../render/marbleStyles";
import type { Vector3 } from "./types";
import type { RaceSnapshot } from "./liveTypes";

const VIEW_WIDTH = 100;
const VIEW_PADDING = 7;
const MIN_VIEW_HEIGHT = 46;
const MAX_VIEW_HEIGHT = 132;

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

export interface MinimapProjection {
  readonly width: number;
  readonly height: number;
  readonly project: (position: Vector3) => MinimapPoint;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Frames the drawn Course route rather than the whole Board. The Board bounds
 * are far larger than any single Course, which shrank the route to an
 * unreadable smear in the middle of an empty panel. The scale stays uniform on
 * both axes, so the map never lies about the shape of the Course. */
export function createMinimapProjection(
  board: BoardSpec,
  route: readonly Vector3[],
): MinimapProjection {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const position of route) {
    minX = Math.min(minX, position[0]);
    maxX = Math.max(maxX, position[0]);
    minY = Math.min(minY, position[1]);
    maxY = Math.max(maxY, position[1]);
  }

  if (!Number.isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) {
    minX = board.bounds.min[0];
    maxX = board.bounds.max[0];
    minY = board.bounds.min[1];
    maxY = board.bounds.max[1];
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const height = clampNumber(
    (VIEW_WIDTH - VIEW_PADDING * 2) * (spanY / spanX) + VIEW_PADDING * 2,
    MIN_VIEW_HEIGHT,
    MAX_VIEW_HEIGHT,
  );
  const scale = Math.min(
    (VIEW_WIDTH - VIEW_PADDING * 2) / spanX,
    (height - VIEW_PADDING * 2) / spanY,
  );
  const offsetX = (VIEW_WIDTH - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  return Object.freeze({
    width: VIEW_WIDTH,
    height,
    project: (position: Vector3) =>
      Object.freeze({
        x: clampNumber(offsetX + (position[0] - minX) * scale, 0, VIEW_WIDTH),
        y: clampNumber(height - offsetY - (position[1] - minY) * scale, 0, height),
      }),
  });
}

function routePoints(projection: MinimapProjection, route: readonly Vector3[]): string {
  return route
    .map((position) => {
      const point = projection.project(position);
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    })
    .join(" ");
}

function marbleName(roster: readonly string[], marbleIndex: number): string {
  return roster[marbleIndex] ?? `Marble ${marbleIndex + 1}`;
}

function diamondPath(point: MinimapPoint, radius: number): string {
  return [
    `M ${point.x} ${point.y - radius}`,
    `L ${point.x + radius} ${point.y}`,
    `L ${point.x} ${point.y + radius}`,
    `L ${point.x - radius} ${point.y}`,
    "Z",
  ].join(" ");
}

/** Accessible Board-space overview. The decisive marble keeps a distinct
 * diamond in the map and a named chip in the caption, so selection stays
 * legible without relying on color. */
export function CourseMinimap({
  board,
  course,
  snapshot,
  roster,
  marbleStyles = createMarbleStyles(roster.length),
}: CourseMinimapProps) {
  const patternPrefix = useId().replaceAll(":", "");
  const projection = createMinimapProjection(board, course.route);
  const route = routePoints(projection, course.route);
  const decisiveIndex = snapshot?.decisiveMarbleIndex ?? null;
  const decisiveStyle = decisiveIndex === null ? null : marbleStyles[decisiveIndex];
  const passedCheckpoint =
    decisiveIndex === null ? null : (snapshot?.passedCheckpoints[decisiveIndex] ?? null);
  const start = projection.project(course.entry.position);
  const finish = projection.project(course.exit.position);

  return (
    <figure className="course-minimap">
      <figcaption className="course-minimap__caption">
        <p className="course-minimap__title">Course map</p>
        {decisiveIndex === null ? (
          <span className="course-minimap__chip course-minimap__chip--idle">Awaiting release</span>
        ) : (
          <span className="course-minimap__chip">
            <span
              aria-hidden="true"
              className="course-minimap__chip-swatch"
              style={{
                background:
                  decisiveStyle == null ? "#ffffff" : marbleStripeBackground(decisiveStyle),
              }}
            />
            Decisive: {marbleName(roster, decisiveIndex)}
          </span>
        )}
      </figcaption>
      <svg
        aria-label="Course minimap"
        className="course-minimap__canvas"
        role="img"
        viewBox={`0 0 ${projection.width} ${projection.height.toFixed(2)}`}
      >
        <title>Course minimap</title>
        <defs>
          {marbleStyles.map((style, marbleIndex) => (
            <pattern
              key={marbleIndex}
              id={`${patternPrefix}-marble-stripe-${marbleIndex}`}
              height="4"
              patternTransform="rotate(35)"
              patternUnits="userSpaceOnUse"
              width="4"
            >
              <rect fill={style.color} height="4" width="4" />
              <rect fill={style.accentColor} height="4" width="1.5" />
            </pattern>
          ))}
        </defs>
        <rect
          className="course-minimap__board"
          height={projection.height}
          width={projection.width}
          x="0"
          y="0"
        />
        <polyline className="course-minimap__route-casing" fill="none" points={route} />
        <polyline className="course-minimap__route" fill="none" points={route} />
        <g className="course-minimap__terminal">
          <circle className="course-minimap__start" cx={start.x} cy={start.y} r="2.4" />
          <path className="course-minimap__finish" d={diamondPath(finish, 3)} />
        </g>
        {course.checkpoints.map(({ slotIndex, anchor }) => {
          const point = projection.project(anchor.position);
          const passed = passedCheckpoint !== null && slotIndex <= passedCheckpoint;
          return (
            <circle
              key={slotIndex}
              aria-label={`Checkpoint ${slotIndex + 1}`}
              className={`course-minimap__checkpoint${passed ? " course-minimap__checkpoint--passed" : ""}`}
              cx={point.x}
              cy={point.y}
              r="1.3"
            />
          );
        })}
        {snapshot?.marbleTransforms.map((marble) => {
          const point = projection.project(marble.position);
          const isDecisive = marble.marbleIndex === decisiveIndex;
          const label = marbleName(roster, marble.marbleIndex);
          const style = marbleStyles[marble.marbleIndex];
          const fill =
            style === undefined
              ? "#ffffff"
              : `url(#${patternPrefix}-marble-stripe-${marble.marbleIndex})`;
          return isDecisive ? (
            <g key={marble.marbleIndex} aria-label={`Decisive marble: ${label}`}>
              <circle className="course-minimap__halo" cx={point.x} cy={point.y} r="5" />
              <path
                className="course-minimap__marble course-minimap__marble--decisive"
                d={diamondPath(point, 3.1)}
                fill={fill}
              />
            </g>
          ) : (
            <circle
              key={marble.marbleIndex}
              aria-label={`Marble: ${label}`}
              className="course-minimap__marble"
              cx={point.x}
              cy={point.y}
              fill={fill}
              r="1.7"
            />
          );
        })}
      </svg>
    </figure>
  );
}
