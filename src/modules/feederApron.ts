import { buildChannel } from "./geometry/channel";
import type { Anchor, Spec } from "./types";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";

export const FEEDER_APRON_LENGTH = SCALE.marbleRadius * 15;

const FEEDER_APRON_MATERIAL = Object.freeze({
  restitution: SCALE.defaultRestitution,
  friction: SCALE.defaultFriction,
});

function addScaled(base: Vector3, direction: Vector3, amount: number): Vector3 {
  return [
    base[0] + direction[0] * amount,
    base[1] + direction[1] * amount,
    base[2] + direction[2] * amount,
  ];
}

/** Infrastructure immediately before a Module's entry plane. The live
 * Showcase and headless Validator consume this exact Spec so feed geometry
 * cannot drift between authoring evidence and acceptance evidence. */
export function buildFeederApronSpec(entry: Anchor): Spec {
  const start = addScaled(entry.position, entry.tangent, -FEEDER_APRON_LENGTH);
  const channel = buildChannel(
    [{ start, end: entry.position, width: SCALE.channelWidth, up: entry.up }],
    FEEDER_APRON_MATERIAL,
    "feeder-apron",
    { openContactSurfaces: true },
  );

  return {
    colliders: channel.colliders,
    visuals: channel.visuals,
    footprint: {
      cells: [],
      entry: channel.entry,
      exit: entry,
      route: channel.route,
      bounds: channel.bounds,
    },
  };
}
