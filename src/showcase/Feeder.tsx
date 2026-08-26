import { useFrame } from "@react-three/fiber";
import { BallCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildFeederApronSpec } from "../modules/feederApron";
import { INITIAL_KINEMATIC_CLOCK, type KinematicStep } from "../modules/kinematics";
import { ModuleColliders } from "../modules/render/ModuleColliders";
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
const STATIC_STEP: KinematicStep = () => [];

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

interface SpawnedMarble {
  readonly id: number;
  /** Computed once, at the moment of spawn -- never recomputed on a later
   * render. `Feeder` previously recomputed every alive marble's position
   * (with a fresh `Math.random()` lateral jitter) inline in `.map()` on
   * every render, and `<RigidBody position>` applies a changed position
   * value by calling `setTranslation` again -- so an already-rolling marble
   * got silently snapped back toward spawn on nearly every re-render
   * (every exit, every stall, every param edit). Found by fresh review,
   * not observed directly: this session had no browser access at all to
   * see the glitch. */
  readonly spawnPosition: Vector3;
}

/** Drops marbles into a Module in the Showcase -- continuously, in a burst
 * of 15, or one at a time. Each marble tracks its own crossing of the
 * Module's exit plane (via `exitPlaneDistance`, the same math the batch
 * Validator uses) and reports dwell time and exit speed once, then
 * despawns itself shortly after so a long continuous feed doesn't
 * accumulate free-falling bodies forever. */
export function Feeder({ entry, exit, mode, triggerNonce, onExit, onStall }: FeederProps) {
  const [marbles, setMarbles] = useState<readonly SpawnedMarble[]>([]);
  const apronSpec = useMemo(() => buildFeederApronSpec(entry), [entry]);
  const apronClockRef = useRef(INITIAL_KINEMATIC_CLOCK);
  const nextIdRef = useRef(0);
  const lastTriggerRef = useRef(triggerNonce);
  const lastContinuousSpawnRef = useRef(0);
  // Kept current every render so a spawn always uses the live entry frame,
  // without making spawnOne/spawnBurst's identity depend on `entry` (which
  // would otherwise change every render `entry` does, e.g. on every param
  // edit for a Module whose entry position depends on its own params).
  const entryRef = useRef(apronSpec.footprint.entry);
  entryRef.current = apronSpec.footprint.entry;

  const makeSpawnPosition = useCallback((): Vector3 => {
    const currentEntry = entryRef.current;
    const lateral = normalize(cross(currentEntry.tangent, currentEntry.up));
    const basePosition = addScaled(
      addScaled(
        currentEntry.position,
        currentEntry.tangent,
        SCALE.marbleRadius * ENTRY_MARGIN_RADII,
      ),
      currentEntry.up,
      SCALE.marbleRadius * ENTRY_LIFT_RADII,
    );
    const lateralOffset = (Math.random() - 0.5) * (SCALE.channelWidth - SCALE.marbleRadius * 4);
    return addScaled(basePosition, lateral, lateralOffset);
  }, []);

  const spawnOne = useCallback(() => {
    setMarbles((existing) => [
      ...existing,
      { id: nextIdRef.current++, spawnPosition: makeSpawnPosition() },
    ]);
  }, [makeSpawnPosition]);

  const spawnBurst = useCallback(
    (count: number) => {
      setMarbles((existing) => {
        const spawned: SpawnedMarble[] = Array.from({ length: count }, () => ({
          id: nextIdRef.current++,
          spawnPosition: makeSpawnPosition(),
        }));
        return [...existing, ...spawned];
      });
    },
    [makeSpawnPosition],
  );

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
    setMarbles((existing) => existing.filter((marble) => marble.id !== id));
  }, []);

  return (
    <>
      <ModuleColliders spec={apronSpec} step={STATIC_STEP} clockRef={apronClockRef} />
      {marbles.map(({ id, spawnPosition }) => {
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
