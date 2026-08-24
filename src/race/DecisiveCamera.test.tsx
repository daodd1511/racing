/** @vitest-environment happy-dom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import type { BoardSpec, Course } from "../course/types";
import type { RaceSnapshot } from "./liveTypes";
import type { Vector3 } from "./types";

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

function course(route: readonly Vector3[]): Course {
  const start = route[0];
  const next = route[1];
  const length = Math.hypot(next[0] - start[0], next[1] - start[1], next[2] - start[2]);
  return {
    seed: 1,
    board: BOARD,
    modules: [],
    connectors: [],
    route,
    checkpoints: [],
    start: {} as Course["start"],
    finish: {} as Course["finish"],
    entry: {
      position: start,
      tangent: [
        (next[0] - start[0]) / length,
        (next[1] - start[1]) / length,
        (next[2] - start[2]) / length,
      ],
      up: [0, 1, 0],
    },
    exit: {} as Course["exit"],
  };
}

const EASTBOUND_COURSE = course([
  [-2, 0, 0],
  [2, 0, 0],
]);

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

function settleCamera(): void {
  for (let frame = 0; frame < 240; frame += 1) {
    advanceCamera(1 / 60);
  }
}

afterEach(() => {
  cleanup();
  cameraRuntime.camera = null;
  cameraRuntime.frame = null;
  vi.clearAllMocks();
});

describe("DecisiveCamera", () => {
  it("frames the staged Start grid while the countdown has no snapshot", () => {
    const camera = new THREE.PerspectiveCamera();
    const viewDirection = new THREE.Vector3();
    cameraRuntime.camera = camera;
    render(<DecisiveCamera course={EASTBOUND_COURSE} snapshot={null} startingGridSize={7} />);
    advanceCamera(1 / 60);

    expect(camera.fov).toBe(45);
    expect(camera.position.x).toBeLessThan(-2.4);
    expect(camera.position.y).toBeGreaterThan(0.6);
    expect(camera.position.z).toBeCloseTo(0.5, 5);
    camera.getWorldDirection(viewDirection);
    expect(viewDirection.x).toBeGreaterThan(0.75);
    expect(viewDirection.y).toBeLessThan(-0.35);
  });

  it("chases behind and above the decisive marble while looking forward and down", () => {
    const camera = new THREE.PerspectiveCamera();
    const viewDirection = new THREE.Vector3();
    cameraRuntime.camera = camera;
    render(<DecisiveCamera course={EASTBOUND_COURSE} snapshot={snapshotAt(0, 0)} />);
    settleCamera();

    expect(camera.fov).toBe(45);
    expect(camera.position.x).toBeCloseTo(-2, 3);
    expect(camera.position.y).toBeCloseTo(1.2, 3);
    expect(camera.position.z).toBeCloseTo(0.8, 3);
    expect(camera.up.toArray()).toEqual([0, 1, 0]);
    camera.getWorldDirection(viewDirection);
    expect(viewDirection.x).toBeGreaterThan(0.8);
    expect(viewDirection.y).toBeLessThan(-0.4);
    expect(viewDirection.z).toBeLessThan(-0.25);
  });

  it("moves behind the Course after its direction turns", () => {
    const southboundCourse = course([
      [0, 2, 0],
      [0, -2, 0],
    ]);
    const camera = new THREE.PerspectiveCamera();
    const viewDirection = new THREE.Vector3();
    cameraRuntime.camera = camera;
    render(<DecisiveCamera course={southboundCourse} snapshot={snapshotAt(0, 0)} />);
    settleCamera();

    expect(camera.position.x).toBeCloseTo(0, 5);
    expect(camera.position.y).toBeCloseTo(3.2, 3);
    camera.getWorldDirection(viewDirection);
    expect(viewDirection.x).toBeCloseTo(0, 5);
    expect(viewDirection.y).toBeLessThan(-0.95);
  });

  it("keeps its heading stable through tiny marble movement", () => {
    const camera = new THREE.PerspectiveCamera();
    const initialDirection = new THREE.Vector3();
    const jitteredDirection = new THREE.Vector3();
    cameraRuntime.camera = camera;
    const view = render(<DecisiveCamera course={EASTBOUND_COURSE} snapshot={snapshotAt(0, 0)} />);
    advanceCamera(1 / 60);
    camera.getWorldDirection(initialDirection);

    for (const [x, y] of [
      [0.001, -0.001],
      [-0.001, 0.001],
      [0.002, -0.002],
    ] as const) {
      view.rerender(<DecisiveCamera course={EASTBOUND_COURSE} snapshot={snapshotAt(x, y)} />);
      advanceCamera(1 / 60);
    }

    camera.getWorldDirection(jitteredDirection);
    expect(jitteredDirection.angleTo(initialDirection)).toBeCloseTo(0, 8);
  });

  it("catches up promptly when the tracked marble advances", () => {
    const camera = new THREE.PerspectiveCamera();
    cameraRuntime.camera = camera;
    const view = render(<DecisiveCamera course={EASTBOUND_COURSE} snapshot={snapshotAt(0, 0)} />);
    settleCamera();

    view.rerender(<DecisiveCamera course={EASTBOUND_COURSE} snapshot={snapshotAt(1, 0)} />);
    for (let frame = 0; frame < 12; frame += 1) {
      advanceCamera(1 / 60);
    }

    expect(camera.position.x).toBeGreaterThan(-1.45);
  });
});
