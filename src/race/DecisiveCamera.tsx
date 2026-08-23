import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import type { BoardSpec } from "../course/types";
import type { RaceSnapshot } from "./liveTypes";
import { decisiveMarbleTarget } from "./cameraTarget";

const CAMERA_FOV = 40;
const FRAMING_MARGIN = 1.25;
const FOLLOW_DISTANCE_RATIO = 0.76;
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

/** Keeps a north-up camera directly above the snapshot's decisive marble. */
export function DecisiveCamera({ board, snapshot }: DecisiveCameraProps) {
  const { camera } = useThree();
  const targetRef = useRef(centerForBoard(board));
  const lookAtRef = useRef(centerForBoard(board));
  const desiredPositionRef = useRef(centerForBoard(board));
  const desiredLookAtRef = useRef(centerForBoard(board));
  const followingRef = useRef(false);
  const snapshotRef = useRef<RaceSnapshot | null>(null);
  const boardRef = useRef(board);
  const initializedRef = useRef(false);

  useFrame((_, deltaSeconds) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (boardRef.current !== board) {
      boardRef.current = board;
      targetRef.current.copy(centerForBoard(board));
      lookAtRef.current.copy(targetRef.current);
      followingRef.current = false;
      snapshotRef.current = null;
      initializedRef.current = false;
    }

    if (snapshotRef.current !== snapshot) {
      snapshotRef.current = snapshot;
      const marble = snapshot === null ? null : decisiveMarbleTarget(snapshot);
      if (marble === null) {
        targetRef.current.copy(centerForBoard(board));
        followingRef.current = false;
      } else {
        targetRef.current.set(...marble.position);
        followingRef.current = true;
      }
    }

    const distance = cameraDistance(board) * (followingRef.current ? FOLLOW_DISTANCE_RATIO : 1);
    const desiredPosition = desiredPositionRef.current.copy(targetRef.current);
    desiredPosition.z += distance;
    const desiredLookAt = desiredLookAtRef.current.copy(targetRef.current);

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
