import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import type { BoardSpec, Course } from "../course/types";
import type { RaceSnapshot } from "./liveTypes";
import type { CameraMode } from "./types";
import { decisiveMarbleTarget } from "./cameraTarget";

const BROADCAST_FOV = 45;
const CLOSE_UP_FOV = 52;
const FRAMING_MARGIN = 1.25;
const CHASE_ABOVE_CELLS = 12;
const CHASE_OUTWARD_CELLS = 8;
const CHASE_TRAIL_CELLS = 20;
const CHASE_LOOK_AHEAD_CELLS = 3;
const CLOSE_UP_TRAIL_CELLS = 0;
const CLOSE_UP_OUTWARD_CELLS = 3;
const CLOSE_UP_LOOK_AHEAD_CELLS = 12;
const TARGET_DAMPING = 3;
const HEADING_DAMPING = 2;
const CAMERA_DAMPING = 2.5;
const LOOK_AT_DAMPING = 2.5;

export interface DecisiveCameraProps {
  readonly course: Course;
  readonly snapshot: RaceSnapshot | null;
  readonly mode?: CameraMode;
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
  const headingRef = useRef(-Math.PI / 2);
  const desiredHeadingRef = useRef(-Math.PI / 2);
  const forwardRef = useRef(new THREE.Vector3(0, -1, 0));
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
        desiredHeadingRef.current = Math.atan2(marble.forward[1], marble.forward[0]);
        if (!followingRef.current) headingRef.current = desiredHeadingRef.current;
        followingRef.current = true;
      }
    }

    targetRef.current.lerp(
      desiredTargetRef.current,
      frameDamping(TARGET_DAMPING, deltaSeconds),
    );
    const fov = mode === "close-up" ? CLOSE_UP_FOV : BROADCAST_FOV;
    const distance = cameraDistance(board, fov);
    const desiredPosition = desiredPositionRef.current.copy(targetRef.current);
    if (followingRef.current) {
      const headingDamping = frameDamping(HEADING_DAMPING, deltaSeconds);
      const headingDelta = Math.atan2(
        Math.sin(desiredHeadingRef.current - headingRef.current),
        Math.cos(desiredHeadingRef.current - headingRef.current),
      );
      headingRef.current += headingDelta * headingDamping;
      const forwardX = Math.cos(headingRef.current);
      const forwardY = Math.sin(headingRef.current);
      forwardRef.current.set(forwardX, forwardY, 0);
      const trailCells = mode === "close-up" ? CLOSE_UP_TRAIL_CELLS : CHASE_TRAIL_CELLS;
      const outwardCells =
        mode === "close-up" ? CLOSE_UP_OUTWARD_CELLS : CHASE_OUTWARD_CELLS;
      const lookAheadCells =
        mode === "close-up" ? CLOSE_UP_LOOK_AHEAD_CELLS : CHASE_LOOK_AHEAD_CELLS;
      desiredPosition.x -= forwardX * board.cellPitch * trailCells;
      desiredPosition.y -= forwardY * board.cellPitch * trailCells;
      if (mode === "broadcast") {
        desiredPosition.y += board.cellPitch * CHASE_ABOVE_CELLS;
      }
      desiredPosition.z += board.cellPitch * outwardCells;
      desiredLookAtRef.current
        .copy(targetRef.current)
        .addScaledVector(forwardRef.current, board.cellPitch * lookAheadCells);
    } else {
      desiredPosition.z += distance;
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
    camera.up.set(0, 1, 0);
    camera.lookAt(lookAtRef.current);
  });

  return null;
}
