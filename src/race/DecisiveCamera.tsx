import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import type { BoardSpec } from "../course/types";
import type { RaceSnapshot } from "./liveTypes";
import { decisiveMarbleTarget } from "./cameraTarget";

const CAMERA_FOV = 40;
const FRAMING_MARGIN = 1.25;
const FOLLOW_DISTANCE_RATIO = 0.76;
const LOOK_AHEAD_CELLS = 4;
const TRAIL_CELLS = 1.6;
const CAMERA_DAMPING = 7;

export interface DecisiveCameraProps {
  readonly board: BoardSpec;
  readonly snapshot: RaceSnapshot | null;
}

function centerForBoard(board: BoardSpec): THREE.Vector3 {
  return new THREE.Vector3(
    (board.bounds.min[0] + board.bounds.max[0]) / 2,
    (board.bounds.min[1] + board.bounds.max[1]) / 2,
    0,
  );
}

function cameraDistance(board: BoardSpec): number {
  const largestBay = Math.max(board.bayWidth, board.bayHeight);
  return (largestBay / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360))) * FRAMING_MARGIN;
}

function frameDamping(deltaSeconds: number): number {
  return 1 - Math.exp(-CAMERA_DAMPING * deltaSeconds);
}

/** Follows the snapshot's decisive marble with a short look-ahead along its Course path. */
export function DecisiveCamera({ board, snapshot }: DecisiveCameraProps) {
  const { camera } = useThree();
  const targetRef = useRef(centerForBoard(board));
  const lookAtRef = useRef(centerForBoard(board));
  const desiredPositionRef = useRef(centerForBoard(board));
  const desiredLookAtRef = useRef(centerForBoard(board));
  const previousMarbleRef = useRef<THREE.Vector3 | null>(null);
  const forwardRef = useRef(new THREE.Vector3(0, -1, 0));
  const snapshotRef = useRef<RaceSnapshot | null>(null);
  const boardRef = useRef(board);
  const initializedRef = useRef(false);

  useFrame((_, deltaSeconds) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (boardRef.current !== board) {
      boardRef.current = board;
      targetRef.current.copy(centerForBoard(board));
      lookAtRef.current.copy(targetRef.current);
      previousMarbleRef.current = null;
      forwardRef.current.set(0, -1, 0);
      snapshotRef.current = null;
      initializedRef.current = false;
    }

    if (snapshotRef.current !== snapshot) {
      snapshotRef.current = snapshot;
      const marble = snapshot === null ? null : decisiveMarbleTarget(snapshot);
      if (marble === null) {
        previousMarbleRef.current = null;
      } else {
        const previous = previousMarbleRef.current;
        if (previous !== null) {
          forwardRef.current.set(
            marble.position[0] - previous.x,
            marble.position[1] - previous.y,
            0,
          );
          if (forwardRef.current.lengthSq() > Number.EPSILON) {
            forwardRef.current.normalize();
          }
          previous.set(...marble.position);
        } else {
          previousMarbleRef.current = new THREE.Vector3(...marble.position);
        }
        targetRef.current.set(...marble.position);
      }
    }

    const following = previousMarbleRef.current !== null;
    const distance = cameraDistance(board) * (following ? FOLLOW_DISTANCE_RATIO : 1);
    const desiredPosition = desiredPositionRef.current
      .copy(targetRef.current)
      .addScaledVector(forwardRef.current, following ? -board.cellPitch * TRAIL_CELLS : 0);
    desiredPosition.z += distance;
    const desiredLookAt = desiredLookAtRef.current
      .copy(targetRef.current)
      .addScaledVector(forwardRef.current, following ? board.cellPitch * LOOK_AHEAD_CELLS : 0);

    if (!initializedRef.current) {
      camera.position.copy(desiredPosition);
      lookAtRef.current.copy(desiredLookAt);
      initializedRef.current = true;
    } else {
      const damping = frameDamping(deltaSeconds);
      camera.position.lerp(desiredPosition, damping);
      lookAtRef.current.lerp(desiredLookAt, damping);
    }

    if (camera.fov !== CAMERA_FOV) {
      camera.fov = CAMERA_FOV;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(lookAtRef.current);
  });

  return null;
}
