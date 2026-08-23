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

function snapshotAt(x: number, y: number, z = 0): RaceSnapshot {
  return {
    elapsedSeconds: 1,
    marbleTransforms: [{ marbleIndex: 0, position: [x, y, z], rotation: [0, 0, 0, 1] }],
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
  it("chases behind and above the decisive marble while looking forward and down", () => {
    const camera = new THREE.PerspectiveCamera();
    const viewDirection = new THREE.Vector3();
    cameraRuntime.camera = camera;
    const view = render(<DecisiveCamera board={BOARD} snapshot={snapshotAt(0, 0)} />);
    advanceCamera(1 / 60);

    view.rerender(<DecisiveCamera board={BOARD} snapshot={snapshotAt(1, 0)} />);
    advanceCamera(1);

    expect(camera.fov).toBe(40);
    expect(camera.position.x).toBeGreaterThan(0.9);
    expect(camera.position.y).toBeCloseTo(1.8, 5);
    expect(camera.position.z).toBeCloseTo(0.5, 5);
    expect(camera.up.toArray()).toEqual([0, 1, 0]);
    camera.getWorldDirection(viewDirection);
    expect(viewDirection.x).toBeCloseTo(0, 5);
    expect(viewDirection.y).toBeLessThan(-0.5);
    expect(viewDirection.z).toBeLessThan(-0.1);
    expect(Math.abs(viewDirection.y)).toBeGreaterThan(Math.abs(viewDirection.x) * 2);
    expect(Math.abs(viewDirection.y)).toBeGreaterThan(Math.abs(viewDirection.z) * 2);
  });

  it("keeps its heading stable through tiny marble movement", () => {
    const camera = new THREE.PerspectiveCamera();
    const initialDirection = new THREE.Vector3();
    const jitteredDirection = new THREE.Vector3();
    cameraRuntime.camera = camera;
    const view = render(<DecisiveCamera board={BOARD} snapshot={snapshotAt(0, 0)} />);
    advanceCamera(1 / 60);
    camera.getWorldDirection(initialDirection);

    for (const [x, y] of [
      [0.001, -0.001],
      [-0.001, 0.001],
      [0.002, -0.002],
    ] as const) {
      view.rerender(<DecisiveCamera board={BOARD} snapshot={snapshotAt(x, y)} />);
      advanceCamera(1 / 60);
    }

    camera.getWorldDirection(jitteredDirection);
    expect(jitteredDirection.angleTo(initialDirection)).toBeCloseTo(0, 8);
  });
});
