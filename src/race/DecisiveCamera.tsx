import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import type { BoardSpec, Course } from "../course/types";
import type { RaceSnapshot } from "./liveTypes";
import type { CameraMode } from "./types";
import { decisiveMarbleTarget } from "./cameraTarget";

const BROADCAST_FOV = 45;
const CLOSE_UP_FOV = 58;
const FRAMING_MARGIN = 1.25;
// Broadcast keeps its elevated three-quarter framing: well behind, high
// above, and offset toward the viewer so the Course reads as a whole.
const BROADCAST_TRAIL_CELLS = 20;
const BROADCAST_ABOVE_CELLS = 12;
const BROADCAST_OUTWARD_CELLS = 8;
const BROADCAST_LOOK_AHEAD_CELLS = 3;
// Close up is a racing-game chase camera: just behind the marble, barely
// above it, no lateral offset at all, looking down the track ahead. The
// lateral offset is what made the old Close up read as a side-on view --
// with zero trail it sat beside the marble rather than behind it.
const CLOSE_UP_TRAIL_CELLS = 3.5;
const CLOSE_UP_ABOVE_CELLS = 1.6;
const CLOSE_UP_LOOK_AHEAD_CELLS = 10;
const TARGET_DAMPING = 3;
const FORWARD_DAMPING = 2;
const CAMERA_DAMPING = 2.5;
const LOOK_AT_DAMPING = 2.5;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DEPTH_AXIS = new THREE.Vector3(0, 0, 1);
/** Above this the view is close enough to vertical that a world-up camera
 * roll is undefined, so the up vector falls back to the Course heading. */
const VERTICAL_VIEW_LIMIT = 0.999;

export interface DecisiveCameraProps {
  readonly course: Course;
  readonly snapshot: RaceSnapshot | null;
  readonly mode?: CameraMode;
}

interface ChaseFraming {
  readonly fov: number;
  readonly trailCells: number;
  readonly aboveCells: number;
  readonly outwardCells: number;
  readonly lookAheadCells: number;
}

function framingForMode(mode: CameraMode): ChaseFraming {
  return mode === "close-up"
    ? {
        fov: CLOSE_UP_FOV,
        trailCells: CLOSE_UP_TRAIL_CELLS,
        aboveCells: CLOSE_UP_ABOVE_CELLS,
        outwardCells: 0,
        lookAheadCells: CLOSE_UP_LOOK_AHEAD_CELLS,
      }
    : {
        fov: BROADCAST_FOV,
        trailCells: BROADCAST_TRAIL_CELLS,
        aboveCells: BROADCAST_ABOVE_CELLS,
        outwardCells: BROADCAST_OUTWARD_CELLS,
        lookAheadCells: BROADCAST_LOOK_AHEAD_CELLS,
      };
}

function centerForBoard(board: BoardSpec): THREE.Vector3 {
  return new THREE.Vector3(
    (board.bounds.min[0] + board.bounds.max[0]) / 2,
    (board.bounds.min[1] + board.bounds.max[1]) / 2,
    (board.bounds.min[2] + board.bounds.max[2]) / 2,
  );
}

function cameraDistance(board: BoardSpec, fov: number): number {
  const largestBay = Math.max(board.bayWidth, board.bayHeight);
  return (largestBay / (2 * Math.tan((fov * Math.PI) / 360))) * FRAMING_MARGIN;
}

function frameDamping(rate: number, deltaSeconds: number): number {
  return 1 - Math.exp(-rate * deltaSeconds);
}

/** Chases the decisive marble from behind along the local Course direction. */
export function DecisiveCamera({ course, snapshot, mode = "broadcast" }: DecisiveCameraProps) {
  const { board } = course;
  const { camera } = useThree();
  const targetRef = useRef(centerForBoard(board));
  const desiredTargetRef = useRef(centerForBoard(board));
  const lookAtRef = useRef(centerForBoard(board));
  const desiredPositionRef = useRef(centerForBoard(board));
  const desiredLookAtRef = useRef(centerForBoard(board));
  // A damped three-dimensional heading, not a planar angle. The angle form
  // could only express directions in the Board's face, so a Course that
  // turned through depth placed the camera off to one side of the marble.
  const forwardRef = useRef(new THREE.Vector3(0, -1, 0));
  const desiredForwardRef = useRef(new THREE.Vector3(0, -1, 0));
  const viewDirectionRef = useRef(new THREE.Vector3());
  const cameraUpRef = useRef(new THREE.Vector3(0, 1, 0));
  const followingRef = useRef(false);
  const snapshotRef = useRef<RaceSnapshot | null>(null);
  const courseRef = useRef(course);
  const modeRef = useRef(mode);
  const initializedRef = useRef(false);

  useFrame((_, deltaSeconds) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (courseRef.current !== course || modeRef.current !== mode) {
      courseRef.current = course;
      modeRef.current = mode;
      targetRef.current.copy(centerForBoard(board));
      desiredTargetRef.current.copy(targetRef.current);
      lookAtRef.current.copy(targetRef.current);
      followingRef.current = false;
      snapshotRef.current = null;
      initializedRef.current = false;
    }

    if (snapshotRef.current !== snapshot) {
      snapshotRef.current = snapshot;
      const marble = snapshot === null ? null : decisiveMarbleTarget(course, snapshot);
      if (marble === null) {
        desiredTargetRef.current.copy(centerForBoard(board));
        followingRef.current = false;
      } else {
        desiredTargetRef.current.set(...marble.position);
        desiredForwardRef.current.set(...marble.forward).normalize();
        if (!followingRef.current) forwardRef.current.copy(desiredForwardRef.current);
        followingRef.current = true;
      }
    }

    targetRef.current.lerp(
      desiredTargetRef.current,
      frameDamping(TARGET_DAMPING, deltaSeconds),
    );
    const framing = framingForMode(mode);
    const { fov } = framing;
    const desiredPosition = desiredPositionRef.current.copy(targetRef.current);
    if (followingRef.current) {
      forwardRef.current
        .lerp(desiredForwardRef.current, frameDamping(FORWARD_DAMPING, deltaSeconds))
        .normalize();
      const forward = forwardRef.current;
      // Behind the marble along the Course, then straight up. Both offsets
      // are pure: nothing shifts the camera sideways in Close up, which is
      // what makes it read as a view from the track rather than beside it.
      desiredPosition
        .addScaledVector(forward, -board.cellPitch * framing.trailCells)
        .addScaledVector(WORLD_UP, board.cellPitch * framing.aboveCells);
      desiredPosition.z += board.cellPitch * framing.outwardCells;
      desiredLookAtRef.current
        .copy(targetRef.current)
        .addScaledVector(forward, board.cellPitch * framing.lookAheadCells);
    } else {
      desiredPosition.z += cameraDistance(board, fov);
      desiredLookAtRef.current.copy(targetRef.current);
    }
    const desiredLookAt = desiredLookAtRef.current;

    if (!initializedRef.current) {
      camera.position.copy(desiredPosition);
      lookAtRef.current.copy(desiredLookAt);
      initializedRef.current = true;
    } else {
      camera.position.lerp(
        desiredPosition,
        frameDamping(CAMERA_DAMPING, deltaSeconds),
      );
      lookAtRef.current.lerp(
        desiredLookAt,
        frameDamping(LOOK_AT_DAMPING, deltaSeconds),
      );
    }

    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // World up everywhere except a near-vertical view, where up and the view
    // direction are parallel and `lookAt` has no roll left to resolve. There
    // the Course heading's horizontal part stands in, so a steep drop tips
    // the frame instead of collapsing it.
    const viewDirection = viewDirectionRef.current
      .copy(lookAtRef.current)
      .sub(camera.position);
    const vertical =
      viewDirection.lengthSq() > 0 &&
      Math.abs(viewDirection.normalize().dot(WORLD_UP)) > VERTICAL_VIEW_LIMIT;
    if (vertical) {
      const fallback = cameraUpRef.current.set(forwardRef.current.x, 0, forwardRef.current.z);
      camera.up.copy(fallback.lengthSq() > 0 ? fallback.normalize() : DEPTH_AXIS);
    } else {
      camera.up.copy(WORLD_UP);
    }
    camera.lookAt(lookAtRef.current);
  });

  return null;
}
