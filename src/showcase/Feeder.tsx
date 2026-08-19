import { useFrame } from "@react-three/fiber";
import { BallCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Anchor } from "../modules/types";
import { exitPlaneDistance } from "../validator/metrics";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";

export type FeedMode = "continuous" | "burst15" | "single";

const CONTINUOUS_INTERVAL_SECONDS = 0.4;
const ENTRY_MARGIN_RADII = 3;
const ENTRY_LIFT_RADII = 2;
/** How far past the exit anchor (along -up, i.e. "further down") a marble
 * falls before it's despawned -- long enough that `onExit`'s speed reading
 * settles past the exit plane, short enough not to accumulate free-falling
 * bodies forever under a long continuous feed. */
const DESPAWN_DROP_METERS = 0.6;

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: Vector3): Vector3 {
  const magnitude = Math.hypot(v[0], v[1], v[2]);
  return magnitude === 0 ? v : [v[0] / magnitude, v[1] / magnitude, v[2] / magnitude];
}

function addScaled(base: Vector3, direction: Vector3, amount: number): Vector3 {
  return [
    base[0] + direction[0] * amount,
    base[1] + direction[1] * amount,
    base[2] + direction[2] * amount,
  ];
}

/** How far `position` sits below `origin` along `up` (positive means below,
 * matching gravity's sense regardless of a Module's own tilt). */
function dropBelow(origin: Vector3, up: Vector3, position: Vector3): number {
  const delta: Vector3 = [
    position[0] - origin[0],
    position[1] - origin[1],
    position[2] - origin[2],
  ];
  return -(delta[0] * up[0] + delta[1] * up[1] + delta[2] * up[2]);
}

interface MarbleProps {
  readonly id: number;
  readonly exit: Anchor;
  readonly spawnPosition: Vector3;
  readonly onExit: (id: number, dwellSeconds: number, exitSpeed: number) => void;
  readonly onStall: (id: number) => void;
  readonly onSettled: (id: number) => void;
}

function Marble({ id, exit, spawnPosition, onExit, onStall, onSettled }: MarbleProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const spawnedAtRef = useRef<number | null>(null);
  const previousRef = useRef<{ tSeconds: number; position: Vector3 } | null>(null);
  const exitedRef = useRef(false);
  const settledRef = useRef(false);

  useFrame((state) => {
    const body = bodyRef.current;
    if (body === null || settledRef.current) {
      return;
    }

    const tSeconds = state.clock.elapsedTime;
    spawnedAtRef.current ??= tSeconds;

    const translation = body.translation();
    const position: Vector3 = [translation.x, translation.y, translation.z];
    const previous = previousRef.current;
    previousRef.current = { tSeconds, position };

    if (!exitedRef.current && exitPlaneDistance(exit, position) >= 0) {
      exitedRef.current = true;
      const dwellSeconds = tSeconds - spawnedAtRef.current;
      const exitSpeed =
        previous !== null && tSeconds > previous.tSeconds
          ? Math.hypot(
              position[0] - previous.position[0],
              position[1] - previous.position[1],
              position[2] - previous.position[2],
            ) /
            (tSeconds - previous.tSeconds)
          : 0;
      onExit(id, dwellSeconds, exitSpeed);
    }

    const dropPastExit = dropBelow(exit.position, exit.up, position);
    if (dropPastExit > DESPAWN_DROP_METERS) {
      settledRef.current = true;
      if (!exitedRef.current) {
        onStall(id);
      }
      onSettled(id);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      position={spawnPosition}
      colliders={false}
      linearDamping={SCALE.linearDamping}
      angularDamping={SCALE.angularDamping}
      ccd
    >
      <BallCollider
        args={[SCALE.marbleRadius]}
        restitution={SCALE.defaultRestitution}
        friction={SCALE.defaultFriction}
      />
      <mesh castShadow>
        <sphereGeometry args={[SCALE.marbleRadius, 24, 16]} />
        <meshStandardMaterial color="#eef3f6" metalness={0.9} roughness={0.15} />
      </mesh>
    </RigidBody>
  );
}

export interface FeederProps {
  readonly entry: Anchor;
  readonly exit: Anchor;
  readonly mode: FeedMode;
  /** Bumped by the caller to trigger one single/burst spawn. Ignored while
   * `mode` is `"continuous"`, which spawns on its own cadence instead. */
  readonly triggerNonce: number;
  /** `id` is the marble's spawn index (0, 1, 2, ...), stable for its whole
   * lifetime -- the caller can use it to correlate a stall/exit with when
   * the marble was spawned, e.g. for a Shuffle reading. */
  readonly onExit: (id: number, dwellSeconds: number, exitSpeed: number) => void;
  readonly onStall: (id: number) => void;
}

/** Drops marbles into a Module in the Showcase -- continuously, in a burst
 * of 15, or one at a time. Each marble tracks its own crossing of the
 * Module's exit plane (via `exitPlaneDistance`, the same math the batch
 * Validator uses) and reports dwell time and exit speed once, then
 * despawns itself shortly after so a long continuous feed doesn't
 * accumulate free-falling bodies forever. */
export function Feeder({ entry, exit, mode, triggerNonce, onExit, onStall }: FeederProps) {
  const [marbleIds, setMarbleIds] = useState<readonly number[]>([]);
  const nextIdRef = useRef(0);
  const lastTriggerRef = useRef(triggerNonce);
  const lastContinuousSpawnRef = useRef(0);

  const lateral = normalize(cross(entry.tangent, entry.up));
  const basePosition = addScaled(
    addScaled(entry.position, entry.tangent, SCALE.marbleRadius * ENTRY_MARGIN_RADII),
    entry.up,
    SCALE.marbleRadius * ENTRY_LIFT_RADII,
  );

  const spawnOne = useCallback(() => {
    setMarbleIds((ids) => [...ids, nextIdRef.current++]);
  }, []);

  const spawnBurst = useCallback((count: number) => {
    setMarbleIds((ids) => {
      const spawned = Array.from({ length: count }, () => nextIdRef.current++);
      return [...ids, ...spawned];
    });
  }, []);

  useEffect(() => {
    if (triggerNonce === lastTriggerRef.current) {
      return;
    }
    lastTriggerRef.current = triggerNonce;
    if (mode === "single") {
      spawnOne();
    } else if (mode === "burst15") {
      spawnBurst(15);
    }
  }, [triggerNonce, mode, spawnOne, spawnBurst]);

  useFrame((state) => {
    if (mode !== "continuous") {
      return;
    }
    const now = state.clock.elapsedTime;
    if (now - lastContinuousSpawnRef.current >= CONTINUOUS_INTERVAL_SECONDS) {
      lastContinuousSpawnRef.current = now;
      spawnOne();
    }
  });

  const despawn = useCallback((id: number) => {
    setMarbleIds((ids) => ids.filter((existing) => existing !== id));
  }, []);

  return (
    <>
      {marbleIds.map((id) => {
        const lateralOffset = (Math.random() - 0.5) * (SCALE.channelWidth - SCALE.marbleRadius * 4);
        const spawnPosition = addScaled(basePosition, lateral, lateralOffset);

        return (
          <Marble
            key={id}
            id={id}
            exit={exit}
            spawnPosition={spawnPosition}
            onExit={onExit}
            onStall={onStall}
            onSettled={despawn}
          />
        );
      })}
    </>
  );
}
