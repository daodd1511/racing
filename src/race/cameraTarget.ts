import type { Course } from "../course/types";
import type { RaceSnapshot } from "./liveTypes";
import type { Vector3 } from "./types";

const EPSILON = 1e-9;

export interface DecisiveMarbleTarget {
  readonly marbleIndex: number;
  readonly position: Vector3;
  readonly forward: Vector3;
}

interface RouteProjection {
  readonly distance: number;
  readonly segmentIndex: number;
}

function routeDistances(route: readonly Vector3[]): readonly number[] {
  const distances = [0];
  for (let index = 1; index < route.length; index += 1) {
    const start = route[index - 1];
    const end = route[index];
    distances.push(
      distances[index - 1] + Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]),
    );
  }
  return distances;
}

function projectionInterval(
  course: Course,
  snapshot: RaceSnapshot,
  marbleIndex: number,
  totalRouteDistance: number,
): readonly [number, number] {
  const passed = snapshot.passedCheckpoints[marbleIndex] ?? -1;
  const minimum = passed < 0 ? 0 : (course.checkpoints[passed]?.routeDistance ?? 0);
  const maximum =
    passed + 1 < course.checkpoints.length
      ? course.checkpoints[passed + 1].routeDistance
      : totalRouteDistance;
  return [minimum, maximum];
}

function projectOntoRoute(
  route: readonly Vector3[],
  cumulative: readonly number[],
  position: Vector3,
  interval: readonly [number, number],
): RouteProjection | null {
  let closest: RouteProjection | null = null;
  let closestDistanceSquared = Infinity;

  for (let index = 1; index < route.length; index += 1) {
    const start = route[index - 1];
    const end = route[index];
    const segmentStart = cumulative[index - 1];
    const segmentEnd = cumulative[index];
    const segmentLength = segmentEnd - segmentStart;
    if (
      segmentLength <= EPSILON ||
      segmentEnd < interval[0] - EPSILON ||
      segmentStart > interval[1] + EPSILON
    ) {
      continue;
    }

    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const minimumT = Math.max(0, (interval[0] - segmentStart) / segmentLength);
    const maximumT = Math.min(1, (interval[1] - segmentStart) / segmentLength);
    const projectedT =
      ((position[0] - start[0]) * dx +
        (position[1] - start[1]) * dy +
        (position[2] - start[2]) * dz) /
      (segmentLength * segmentLength);
    const t = Math.min(maximumT, Math.max(minimumT, projectedT));
    const offsetX = position[0] - (start[0] + dx * t);
    const offsetY = position[1] - (start[1] + dy * t);
    const offsetZ = position[2] - (start[2] + dz * t);
    const distanceSquared = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ;
    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared;
      closest = { distance: segmentStart + segmentLength * t, segmentIndex: index };
    }
  }

  return closest;
}

function pointAtDistance(
  route: readonly Vector3[],
  cumulative: readonly number[],
  distance: number,
): Vector3 {
  const clamped = Math.min(cumulative.at(-1) ?? 0, Math.max(0, distance));
  for (let index = 1; index < route.length; index += 1) {
    if (clamped > cumulative[index]) continue;
    const segmentLength = cumulative[index] - cumulative[index - 1];
    if (segmentLength <= EPSILON) continue;
    const t = (clamped - cumulative[index - 1]) / segmentLength;
    const start = route[index - 1];
    const end = route[index];
    return [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
      start[2] + (end[2] - start[2]) * t,
    ];
  }
  return route.at(-1) ?? [0, -1, 0];
}

function routeForward(
  course: Course,
  snapshot: RaceSnapshot,
  marbleIndex: number,
  position: Vector3,
) {
  const cumulative = routeDistances(course.route);
  const total = cumulative.at(-1) ?? 0;
  const projection = projectOntoRoute(
    course.route,
    cumulative,
    position,
    projectionInterval(course, snapshot, marbleIndex, total),
  );
  if (projection === null) return [0, -1, 0] as const;

  // The full three-dimensional tangent, depth included. Dropping the z
  // component used to be harmless while the camera only panned across the
  // Board's face, but a chase camera places itself along -forward: on a
  // hairpin connector, which swings through depth, a planar forward put the
  // camera beside the marble instead of behind it.
  const sampleRadius = course.board.cellPitch * 4;
  const before = pointAtDistance(course.route, cumulative, projection.distance - sampleRadius);
  const after = pointAtDistance(course.route, cumulative, projection.distance + sampleRadius);
  let dx = after[0] - before[0];
  let dy = after[1] - before[1];
  let dz = after[2] - before[2];
  let length = Math.hypot(dx, dy, dz);
  if (length <= EPSILON) {
    const start = course.route[projection.segmentIndex - 1];
    const end = course.route[projection.segmentIndex];
    dx = end[0] - start[0];
    dy = end[1] - start[1];
    dz = end[2] - start[2];
    length = Math.hypot(dx, dy, dz);
  }
  return length <= EPSILON
    ? ([0, -1, 0] as const)
    : ([dx / length, dy / length, dz / length] as const);
}

/** Returns the decisive marble transform and the local forward Course direction. */
export function decisiveMarbleTarget(
  course: Course,
  snapshot: RaceSnapshot,
): DecisiveMarbleTarget | null {
  const marble = snapshot.marbleTransforms.find(
    ({ marbleIndex }) => marbleIndex === snapshot.decisiveMarbleIndex,
  );
  if (marble === undefined) {
    return null;
  }

  return Object.freeze({
    marbleIndex: marble.marbleIndex,
    position: marble.position,
    forward: routeForward(course, snapshot, marble.marbleIndex, marble.position),
  });
}
