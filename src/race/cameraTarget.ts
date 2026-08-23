import type { RaceSnapshot } from "./liveTypes";

export interface CameraTargetState {
  readonly x: number;
  readonly y: number;
  readonly following: boolean;
}

const FOLLOW_START_VIEWPORT_RATIO = 0.3;
const FOLLOW_STOP_VIEWPORT_RATIO = 0.18;
const CUT_VIEWPORT_RATIO = 1;
const DAMPING = 0.18;

function targetForSnapshot(snapshot: RaceSnapshot): readonly [number, number] | null {
  const marble = snapshot.marbleTransforms.find(
    ({ marbleIndex }) => marbleIndex === snapshot.decisiveMarbleIndex,
  );
  return marble ? [marble.position[0], marble.position[1]] : null;
}

function state(x: number, y: number, following: boolean): CameraTargetState {
  return Object.freeze({ x, y, following });
}

/**
 * Follow the decisive marble only after it leaves the outer dead zone, and
 * stop once it returns to the smaller inner zone. A marble more than one
 * viewport away cuts immediately so the camera never pans across empty Board.
 */
export function cameraTargetForSnapshot(
  previous: CameraTargetState,
  snapshot: RaceSnapshot,
  viewportWorldWidth: number,
): CameraTargetState {
  if (!Number.isFinite(viewportWorldWidth) || viewportWorldWidth <= 0) {
    throw new RangeError("Camera viewport width must be positive and finite");
  }
  const target = targetForSnapshot(snapshot);
  if (!target) return previous;

  const [targetX, targetY] = target;
  const distance = Math.hypot(targetX - previous.x, targetY - previous.y);
  if (distance > viewportWorldWidth * CUT_VIEWPORT_RATIO) {
    return state(targetX, targetY, true);
  }

  const threshold =
    viewportWorldWidth *
    (previous.following ? FOLLOW_STOP_VIEWPORT_RATIO : FOLLOW_START_VIEWPORT_RATIO);
  if (distance <= threshold) {
    return state(previous.x, previous.y, false);
  }

  return state(
    previous.x + (targetX - previous.x) * DAMPING,
    previous.y + (targetY - previous.y) * DAMPING,
    true,
  );
}
