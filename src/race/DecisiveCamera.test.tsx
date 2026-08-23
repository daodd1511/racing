/** @vitest-environment happy-dom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import type { BoardSpec } from "../course/types";
import type { RaceSnapshot } from "./liveTypes";

const cameraRuntime = vi.hoisted(() => ({
  camera: null as THREE.PerspectiveCamera | null,
  frame: null as ((state: unknown, deltaSeconds: number) => void) | null,
}));

vi.mock("@react-three/fiber", () => ({
  useFrame(callback: (state: unknown, deltaSeconds: number) => void) {
    cameraRuntime.frame = callback;
  },
  useThree() {
    return { camera: cameraRuntime.camera };
  },
}));

import { DecisiveCamera } from "./DecisiveCamera";

const BOARD: BoardSpec = Object.freeze({
  columns: 3,
  rows: 3,
  cellPitch: 0.1,
  bayWidth: 1,
  bayHeight: 1,
  edgeMargin: 0.2,
  bounds: Object.freeze({ min: [-2, -2, -0.5] as const, max: [2, 2, 0.5] as const }),
});

function snapshotAt(x: number, y: number): RaceSnapshot {
  return {
    elapsedSeconds: 1,
    marbleTransforms: [{ marbleIndex: 0, position: [x, y, 0], rotation: [0, 0, 0, 1] }],
    ranking: [0],
    decisiveMarbleIndex: 0,
    passedCheckpoints: [0],
    splitTimes: [[]],
  };
}

function advanceCamera(deltaSeconds: number): void {
  if (cameraRuntime.frame === null) {
    throw new Error("Expected DecisiveCamera to register a frame callback");
  }
  cameraRuntime.frame({}, deltaSeconds);
}

afterEach(() => {
  cleanup();
  cameraRuntime.camera = null;
  cameraRuntime.frame = null;
  vi.clearAllMocks();
});

describe("DecisiveCamera", () => {
  it("follows directly above the decisive marble with a straight-down view", () => {
    const camera = new THREE.PerspectiveCamera();
    const viewDirection = new THREE.Vector3();
    cameraRuntime.camera = camera;
    const view = render(<DecisiveCamera board={BOARD} snapshot={snapshotAt(0, 0)} />);
    advanceCamera(1 / 60);

    view.rerender(<DecisiveCamera board={BOARD} snapshot={snapshotAt(1, -1)} />);
    advanceCamera(1);

    expect(camera.fov).toBe(40);
    expect(camera.position.x).toBeGreaterThan(0.5);
    expect(camera.position.y).toBeLessThan(-0.5);
    expect(camera.position.z).toBeGreaterThan(0);
    camera.getWorldDirection(viewDirection);
    expect(viewDirection.x).toBeCloseTo(0, 5);
    expect(viewDirection.y).toBeCloseTo(0, 5);
    expect(viewDirection.z).toBeCloseTo(-1, 5);
  });
});
