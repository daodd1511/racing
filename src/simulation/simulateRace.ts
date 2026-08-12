import RAPIER from "@dimforge/rapier3d-compat";

import { DEFAULT_RACE_CONFIG } from "../race/config";
import { createSeededRandom, shuffleStartSlots } from "../race/random";
import type {
  MarbleTransform,
  RaceRecording,
  RecordedContactEvent,
  SelectionMode,
  TransformFrame,
} from "../race/types";
import { attachTrackColliders } from "../track/colliders";
import { createTrackDefinition, DEFAULT_TRACK_CONFIG } from "../track/definition";
import { assertRapierInitialized } from "./initializeRapier";

interface MarbleBody {
  readonly body: RAPIER.RigidBody;
  readonly colliderHandle: RAPIER.ColliderHandle;
}

function validateRoster(roster: readonly string[]): void {
  if (roster.length === 0 || roster.length > DEFAULT_RACE_CONFIG.maximumRosterSize) {
    throw new RangeError(`Roster must contain 1–${DEFAULT_RACE_CONFIG.maximumRosterSize} entries`);
  }

  for (const name of roster) {
    if (name.trim().length === 0) {
      throw new RangeError("Roster entries must not be blank");
    }
  }
}

function readTransform(body: RAPIER.RigidBody): MarbleTransform {
  const translation = body.translation();
  const rotation = body.rotation();

  return {
    position: [translation.x, translation.y, translation.z],
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
  };
}

function createMarbleBodies(
  world: RAPIER.World,
  track: ReturnType<typeof createTrackDefinition>,
  rosterSize: number,
  slotByMarbleIndex: readonly number[],
  random: () => number,
): MarbleBody[] {
  const bodies: MarbleBody[] = [];

  for (let marbleIndex = 0; marbleIndex < rosterSize; marbleIndex += 1) {
    const slot = track.startSlots[slotByMarbleIndex[marbleIndex]];
    const jitter = (random() - 0.5) * 0.05;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(slot[0], slot[1] + jitter, slot[2])
        .setLinearDamping(0.06)
        .setAngularDamping(0.06)
        .setCcdEnabled(true),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.ball(DEFAULT_TRACK_CONFIG.marbleRadius)
        .setRestitution(0.34)
        .setFriction(0.28)
        .setDensity(2.4)
        .setActiveEvents(
          RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
        )
        .setContactForceEventThreshold(0.01),
      body,
    );

    bodies.push({ body, colliderHandle: collider.handle });
  }

  return bodies;
}

function recordContactEvents(
  eventQueue: RAPIER.EventQueue,
  frameIndex: number,
  simulationTimeSeconds: number,
  fixedTimeStepSeconds: number,
  marbleIndexByColliderHandle: ReadonlyMap<RAPIER.ColliderHandle, number>,
): RecordedContactEvent[] {
  const events: RecordedContactEvent[] = [];

  eventQueue.drainContactForceEvents((event) => {
    const marbleIndices = [event.collider1(), event.collider2()]
      .map((handle) => marbleIndexByColliderHandle.get(handle))
      .filter((index): index is number => index !== undefined);

    if (marbleIndices.length === 0) {
      return;
    }

    const impulse = event.totalForceMagnitude() * fixedTimeStepSeconds;

    events.push({
      frameIndex,
      simulationTimeSeconds,
      marbleIndices: Object.freeze([...new Set(marbleIndices)]),
      impulse: Number.isFinite(impulse) ? impulse : 0,
    });
  });

  return events;
}

function createFinalRanking(
  finishFrameByMarbleIndex: readonly (number | null)[],
  finalFrame: TransformFrame,
): number[] {
  return Array.from(
    { length: finishFrameByMarbleIndex.length },
    (_, marbleIndex) => marbleIndex,
  ).sort((left, right) => {
    const leftFinishFrame = finishFrameByMarbleIndex[left];
    const rightFinishFrame = finishFrameByMarbleIndex[right];

    if (leftFinishFrame !== null && rightFinishFrame !== null) {
      return leftFinishFrame - rightFinishFrame || left - right;
    }

    if (leftFinishFrame !== null) {
      return -1;
    }

    if (rightFinishFrame !== null) {
      return 1;
    }

    const leftPosition = finalFrame.transforms[left].position;
    const rightPosition = finalFrame.transforms[right].position;
    const leftDistanceSquared = leftPosition[0] ** 2 + leftPosition[1] ** 2 + leftPosition[2] ** 2;
    const rightDistanceSquared =
      rightPosition[0] ** 2 + rightPosition[1] ** 2 + rightPosition[2] ** 2;

    return (
      leftPosition[1] - rightPosition[1] ||
      leftDistanceSquared - rightDistanceSquared ||
      left - right
    );
  });
}

export function simulateRace(
  roster: readonly string[],
  seed: number,
  mode: SelectionMode,
): RaceRecording | null {
  assertRapierInitialized();
  validateRoster(roster);

  if (!Number.isSafeInteger(seed)) {
    throw new RangeError("Seed must be a safe integer");
  }

  const random = createSeededRandom(seed);
  const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);
  const slotByMarbleIndex = shuffleStartSlots(roster.length, random);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const eventQueue = new RAPIER.EventQueue(true);
  const frames: TransformFrame[] = [];
  const contactEvents: RecordedContactEvent[] = [];
  const finishFrameByMarbleIndex: (number | null)[] = Array.from(
    { length: roster.length },
    () => null,
  );
  const finishOrder: number[] = [];

  try {
    world.timestep = DEFAULT_RACE_CONFIG.fixedTimeStepSeconds;
    attachTrackColliders(world, track);
    const marbleBodies = createMarbleBodies(world, track, roster.length, slotByMarbleIndex, random);
    const marbleIndexByColliderHandle = new Map<RAPIER.ColliderHandle, number>(
      marbleBodies.map(({ colliderHandle }, marbleIndex) => [colliderHandle, marbleIndex]),
    );
    const maximumFrames = Math.ceil(
      DEFAULT_RACE_CONFIG.maximumSimulationSeconds / DEFAULT_RACE_CONFIG.fixedTimeStepSeconds,
    );

    for (let frameIndex = 0; frameIndex < maximumFrames; frameIndex += 1) {
      world.step(eventQueue);
      const simulationTimeSeconds = (frameIndex + 1) * DEFAULT_RACE_CONFIG.fixedTimeStepSeconds;
      const transforms = marbleBodies.map(({ body }) => readTransform(body));
      const frame: TransformFrame = Object.freeze({
        index: frameIndex,
        simulationTimeSeconds,
        transforms: Object.freeze(transforms),
      });
      frames.push(frame);
      contactEvents.push(
        ...recordContactEvents(
          eventQueue,
          frameIndex,
          simulationTimeSeconds,
          DEFAULT_RACE_CONFIG.fixedTimeStepSeconds,
          marbleIndexByColliderHandle,
        ),
      );

      for (let marbleIndex = 0; marbleIndex < transforms.length; marbleIndex += 1) {
        if (
          finishFrameByMarbleIndex[marbleIndex] === null &&
          transforms[marbleIndex].position[1] < track.finishY
        ) {
          finishFrameByMarbleIndex[marbleIndex] = frameIndex;
          finishOrder.push(marbleIndex);

          const isSelected = mode === "first" || finishOrder.length === roster.length;

          if (isSelected) {
            const selectedMarbleIndex =
              mode === "first" ? marbleIndex : finishOrder[finishOrder.length - 1];

            return Object.freeze({
              seed,
              roster: Object.freeze([...roster]),
              selectionMode: mode,
              slotByMarbleIndex: Object.freeze([...slotByMarbleIndex]),
              frames: Object.freeze(frames),
              contactEvents: Object.freeze(contactEvents),
              finishFrameByMarbleIndex: Object.freeze([...finishFrameByMarbleIndex]),
              finishOrder: Object.freeze([...finishOrder]),
              finalRanking: Object.freeze(createFinalRanking(finishFrameByMarbleIndex, frame)),
              selectedMarbleIndex,
              selectionFrameIndex: frameIndex,
              simulationDurationSeconds: simulationTimeSeconds,
            });
          }
        }
      }
    }

    return null;
  } finally {
    eventQueue.free();
    world.free();
  }
}
