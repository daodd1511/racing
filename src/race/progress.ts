import type { Course } from "../course/types";
import type { Vector3 } from "./types";
import { DEFAULT_RACE_CONFIG } from "./config";
import type { RaceOutcome, RaceRequest } from "./liveTypes";

const EPSILON = 1e-9;

export interface RaceProgressState {
  readonly request: RaceRequest;
  readonly course: Course;
  readonly elapsedSeconds: number;
  readonly passedCheckpoints: readonly number[];
  readonly splitTimes: readonly (readonly (number | null)[])[];
  readonly routeDistances: readonly number[];
  readonly ranking: readonly number[];
  readonly decisiveMarbleIndex: number;
  readonly finishOrder: readonly number[];
  readonly outcome: RaceOutcome | null;
}

function assertMarbleIndex(state: RaceProgressState, marbleIndex: number): void {
  if (
    !Number.isSafeInteger(marbleIndex) ||
    marbleIndex < 0 ||
    marbleIndex >= state.request.roster.length
  ) {
    throw new RangeError(`Marble index ${marbleIndex} is outside the Roster`);
  }
}

function assertElapsed(state: RaceProgressState, elapsedSeconds: number): void {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < state.elapsedSeconds) {
    throw new RangeError("Race elapsed time must be finite and monotonic");
  }
}

function routeLength(route: readonly Vector3[]): number {
  let length = 0;
  for (let index = 1; index < route.length; index += 1) {
    length += Math.hypot(
      route[index][0] - route[index - 1][0],
      route[index][1] - route[index - 1][1],
      route[index][2] - route[index - 1][2],
    );
  }
  return length;
}

function projectionInterval(
  state: RaceProgressState,
  marbleIndex: number,
): readonly [number, number] {
  const passed = state.passedCheckpoints[marbleIndex];
  const minimum = passed < 0 ? 0 : state.course.checkpoints[passed].routeDistance;
  const maximum =
    passed + 1 < state.course.checkpoints.length
      ? state.course.checkpoints[passed + 1].routeDistance
      : routeLength(state.course.route);
  return [minimum, maximum];
}

function projectOntoRoute(
  route: readonly Vector3[],
  position: Vector3,
  interval: readonly [number, number],
): number {
  let cumulative = 0;
  let closestDistanceSquared = Infinity;
  let closestRouteDistance = interval[0];
  for (let index = 1; index < route.length; index += 1) {
    const start = route[index - 1];
    const end = route[index];
    const delta: Vector3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
    const segmentLength = Math.hypot(...delta);
    const segmentStart = cumulative;
    const segmentEnd = cumulative + segmentLength;
    cumulative = segmentEnd;
    if (segmentEnd < interval[0] - EPSILON || segmentStart > interval[1] + EPSILON) {
      continue;
    }
    const minimumT = Math.max(0, (interval[0] - segmentStart) / segmentLength);
    const maximumT = Math.min(1, (interval[1] - segmentStart) / segmentLength);
    const rawT =
      ((position[0] - start[0]) * delta[0] +
        (position[1] - start[1]) * delta[1] +
        (position[2] - start[2]) * delta[2]) /
      (segmentLength * segmentLength);
    const t = Math.min(maximumT, Math.max(minimumT, rawT));
    const dx = position[0] - (start[0] + delta[0] * t);
    const dy = position[1] - (start[1] + delta[1] * t);
    const dz = position[2] - (start[2] + delta[2] * t);
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared;
      closestRouteDistance = segmentStart + segmentLength * t;
    }
  }
  return closestRouteDistance;
}

function rankedIndices(
  routeDistances: readonly number[],
  finishOrder: readonly number[],
): readonly number[] {
  const finishRank = new Map(finishOrder.map((marbleIndex, index) => [marbleIndex, index]));
  return Object.freeze(
    routeDistances
      .map((_, marbleIndex) => marbleIndex)
      .sort((left, right) => {
        const leftFinish = finishRank.get(left);
        const rightFinish = finishRank.get(right);
        if (leftFinish !== undefined || rightFinish !== undefined) {
          if (leftFinish === undefined) return 1;
          if (rightFinish === undefined) return -1;
          return leftFinish - rightFinish;
        }
        return routeDistances[right] - routeDistances[left] || left - right;
      }),
  );
}

function decisiveIndex(
  selectionMode: RaceRequest["selectionMode"],
  ranking: readonly number[],
  finishOrder: readonly number[],
): number {
  if (selectionMode === "first") {
    return ranking[0];
  }
  const finished = new Set(finishOrder);
  return (
    [...ranking].reverse().find((marbleIndex) => !finished.has(marbleIndex)) ?? finishOrder.at(-1)!
  );
}

function immutableState(
  state: Omit<RaceProgressState, "ranking" | "decisiveMarbleIndex">,
): RaceProgressState {
  const ranking = rankedIndices(state.routeDistances, state.finishOrder);
  return Object.freeze({
    ...state,
    ranking,
    decisiveMarbleIndex: decisiveIndex(state.request.selectionMode, ranking, state.finishOrder),
  });
}

export function createRaceProgress(request: RaceRequest, course: Course): RaceProgressState {
  if (
    !Number.isSafeInteger(request.seed) ||
    request.roster.length < 1 ||
    request.roster.length > DEFAULT_RACE_CONFIG.maximumRosterSize ||
    request.roster.some((name) => name.trim().length === 0) ||
    (request.selectionMode !== "first" && request.selectionMode !== "last")
  ) {
    throw new Error("Race request is invalid");
  }
  const roster = Object.freeze([...request.roster]);
  const immutableRequest = Object.freeze({ ...request, roster });
  return immutableState({
    request: immutableRequest,
    course,
    elapsedSeconds: 0,
    passedCheckpoints: Object.freeze(roster.map(() => -1)),
    splitTimes: Object.freeze(roster.map(() => Object.freeze(course.checkpoints.map(() => null)))),
    routeDistances: Object.freeze(roster.map(() => 0)),
    finishOrder: Object.freeze([]),
    outcome: null,
  });
}

export function recordMarbleProgress(
  state: RaceProgressState,
  marbleIndex: number,
  position: Vector3,
  elapsedSeconds: number,
): RaceProgressState {
  assertMarbleIndex(state, marbleIndex);
  assertElapsed(state, elapsedSeconds);
  if (state.outcome || state.finishOrder.includes(marbleIndex)) {
    return state;
  }
  const projected = projectOntoRoute(
    state.course.route,
    position,
    projectionInterval(state, marbleIndex),
  );
  const routeDistances = [...state.routeDistances];
  routeDistances[marbleIndex] = Math.max(routeDistances[marbleIndex], projected);
  return immutableState({
    ...state,
    elapsedSeconds,
    routeDistances: Object.freeze(routeDistances),
  });
}

export function recordCheckpoint(
  state: RaceProgressState,
  marbleIndex: number,
  checkpointIndex: number,
  elapsedSeconds: number,
): RaceProgressState {
  assertMarbleIndex(state, marbleIndex);
  assertElapsed(state, elapsedSeconds);
  if (state.outcome || checkpointIndex !== state.passedCheckpoints[marbleIndex] + 1) {
    return state;
  }
  if (checkpointIndex < 0 || checkpointIndex >= state.course.checkpoints.length) {
    throw new RangeError(`Checkpoint index ${checkpointIndex} is outside the Course`);
  }
  const passedCheckpoints = [...state.passedCheckpoints];
  passedCheckpoints[marbleIndex] = checkpointIndex;
  const splitTimes = state.splitTimes.map((times, index) => {
    if (index !== marbleIndex) return times;
    const next = [...times];
    next[checkpointIndex] = elapsedSeconds;
    return Object.freeze(next);
  });
  const routeDistances = [...state.routeDistances];
  routeDistances[marbleIndex] = Math.max(
    routeDistances[marbleIndex],
    state.course.checkpoints[checkpointIndex].routeDistance,
  );
  return immutableState({
    ...state,
    elapsedSeconds,
    passedCheckpoints: Object.freeze(passedCheckpoints),
    splitTimes: Object.freeze(splitTimes),
    routeDistances: Object.freeze(routeDistances),
  });
}

export function recordFinish(
  state: RaceProgressState,
  marbleIndex: number,
  elapsedSeconds: number,
): RaceProgressState {
  assertMarbleIndex(state, marbleIndex);
  assertElapsed(state, elapsedSeconds);
  if (state.outcome || state.finishOrder.includes(marbleIndex)) {
    return state;
  }
  const finishOrder = Object.freeze([...state.finishOrder, marbleIndex]);
  const routeDistances = [...state.routeDistances];
  routeDistances[marbleIndex] = routeLength(state.course.route);
  const ranking = rankedIndices(routeDistances, finishOrder);
  const completed =
    state.request.selectionMode === "first" || finishOrder.length === state.request.roster.length;
  const outcome: RaceOutcome | null = completed
    ? Object.freeze({
        kind: "completed",
        seed: state.request.seed,
        selectedMarbleIndex:
          state.request.selectionMode === "first" ? finishOrder[0] : finishOrder.at(-1)!,
        finishOrder,
        finalRanking:
          state.request.selectionMode === "first" ? ranking : Object.freeze([...finishOrder]),
        elapsedSeconds,
      })
    : null;
  return immutableState({
    ...state,
    elapsedSeconds,
    routeDistances: Object.freeze(routeDistances),
    finishOrder,
    outcome,
  });
}

export function advanceWatchdog(
  state: RaceProgressState,
  elapsedSeconds: number,
): RaceProgressState {
  assertElapsed(state, elapsedSeconds);
  if (state.outcome) {
    return state;
  }
  if (elapsedSeconds < DEFAULT_RACE_CONFIG.maximumSimulationSeconds) {
    return immutableState({ ...state, elapsedSeconds });
  }
  const finished = new Set(state.finishOrder);
  const unfinishedMarbleIndices = Object.freeze(
    state.request.roster.map((_, index) => index).filter((index) => !finished.has(index)),
  );
  return immutableState({
    ...state,
    elapsedSeconds,
    outcome: Object.freeze({
      kind: "watchdog",
      seed: state.request.seed,
      unfinishedMarbleIndices,
      elapsedSeconds,
    }),
  });
}
