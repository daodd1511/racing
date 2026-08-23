import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import type { BoardSpec } from "../course/types";
import type { RaceSnapshot } from "./liveTypes";
import { cameraTargetForSnapshot, type CameraTargetState } from "./cameraTarget";

const CAMERA_FOV = 42;
const FRAMING_MARGIN = 1.25;

export interface DecisiveCameraProps {
  readonly board: BoardSpec;
  readonly snapshot: RaceSnapshot | null;
}

function centerForBoard(board: BoardSpec): CameraTargetState {
  return {
    x: (board.bounds.min[0] + board.bounds.max[0]) / 2,
    y: (board.bounds.min[1] + board.bounds.max[1]) / 2,
    following: false,
  };
}

function cameraDistance(board: BoardSpec): number {
  const largestBay = Math.max(board.bayWidth, board.bayHeight);
  return (largestBay / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360))) * FRAMING_MARGIN;
}

function viewportWidth(camera: THREE.PerspectiveCamera, distance: number): number {
  return 2 * Math.tan((camera.fov * Math.PI) / 360) * distance * camera.aspect;
}

/** A fixed face-on camera: only Board x/y pans as the decisive marble changes. */
export function DecisiveCamera({ board, snapshot }: DecisiveCameraProps) {
  const { camera } = useThree();
  const targetRef = useRef(centerForBoard(board));
  const boardRef = useRef(board);

  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (boardRef.current !== board) {
      boardRef.current = board;
      targetRef.current = centerForBoard(board);
    }

    const distance = cameraDistance(board);
    camera.fov = CAMERA_FOV;
    if (snapshot) {
      targetRef.current = cameraTargetForSnapshot(
        targetRef.current,
        snapshot,
        viewportWidth(camera, distance),
      );
    }

    camera.position.set(targetRef.current.x, targetRef.current.y, distance);
    camera.lookAt(targetRef.current.x, targetRef.current.y, 0);
    camera.updateProjectionMatrix();
  });

  return null;
}
