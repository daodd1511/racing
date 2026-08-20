import type { KinematicTransform, Spec } from "./types";
import type { Quaternion, Vector3 } from "../race/types";

// Both construction paths advance Rapier at this exact cadence. Representing
// elapsed time as an integer step count keeps the renderer's accumulated time
// bit-for-bit aligned with the Validator's `stepCount * (1 / 60)` calculation
// instead of accumulating frame deltas with different rounding.
export const KINEMATIC_FIXED_STEP_SECONDS = 1 / 60;

export interface KinematicClock {
  readonly stepCount: number;
}

export const INITIAL_KINEMATIC_CLOCK: KinematicClock = Object.freeze({ stepCount: 0 });

export function advanceKinematicClock(clock: KinematicClock): KinematicClock {
  return { stepCount: clock.stepCount + 1 };
}

export function kinematicSeconds(clock: KinematicClock): number {
  return clock.stepCount * KINEMATIC_FIXED_STEP_SECONDS;
}

/** The renderer calls the exact same pure Module function as the Validator;
 * extracting this boundary keeps their clock arithmetic testable without
 * mounting React or constructing a browser physics world. */
export type KinematicStep = (spec: Spec, tSeconds: number) => readonly KinematicTransform[];

export function kinematicTransformsAt(
  step: KinematicStep,
  spec: Spec,
  tSeconds: number,
): readonly KinematicTransform[] {
  return step(spec, tSeconds);
}

export interface ModuleAnchor {
  readonly position?: Vector3;
  readonly rotation?: Quaternion;
}

function rotateVector(vector: Vector3, quaternion: Quaternion): Vector3 {
  const [vx, vy, vz] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

function multiplyQuaternions(left: Quaternion, right: Quaternion): Quaternion {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ];
}

/** Converts a Module-local kinematic transform into the world space Rapier
 * expects for a body nested under `ModuleColliders`' optional scene anchor.
 * Visual meshes remain children of that anchor and therefore keep the local
 * transform unchanged. */
export function transformForAnchor(
  transform: KinematicTransform,
  anchor: ModuleAnchor | undefined,
): KinematicTransform {
  if (anchor === undefined || (anchor.position === undefined && anchor.rotation === undefined)) {
    return transform;
  }

  const anchorPosition = anchor.position ?? [0, 0, 0];
  const anchorRotation = anchor.rotation ?? [0, 0, 0, 1];
  const position =
    transform.position === undefined
      ? undefined
      : (() => {
          const rotated = rotateVector(transform.position, anchorRotation);
          return [
            rotated[0] + anchorPosition[0],
            rotated[1] + anchorPosition[1],
            rotated[2] + anchorPosition[2],
          ] as Vector3;
        })();
  const rotation =
    transform.rotation === undefined
      ? undefined
      : multiplyQuaternions(anchorRotation, transform.rotation);

  return { id: transform.id, position, rotation };
}
