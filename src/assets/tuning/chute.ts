import { buildChannel } from "../../modules/geometry/channel";
import type { ChuteParams } from "../../modules/chute";
import type { Spec } from "../../modules/types";
import {
  finishSpec,
  controlDeformation,
  deformAnchor,
  deformPoint,
  transferPart,
  transferRecovery,
} from "./transfer";

export function channelReference(length: number, grade: number, width: number) {
  return buildChannel(
    [{ start: [0, 0, 0], end: [0, -length * grade, length], width }],
    { friction: 0, restitution: 0 },
    "",
    { openContactSurfaces: true },
  );
}

export function tuneChute(spec: Spec, rest: ChuteParams, next: ChuteParams): Spec {
  const a = channelReference(rest.length, rest.grade, rest.width);
  const b = channelReference(next.length, next.grade, next.width);
  const colliders = spec.colliders.map((part) =>
    transferPart(
      part,
      a.colliders.find(({ id }) => id === part.id)!,
      b.colliders.find(({ id }) => id === part.id)!,
    ),
  );
  const visuals = spec.visuals.map((part) =>
    transferPart(
      part,
      a.visuals.find(({ id }) => id === part.id)!,
      b.visuals.find(({ id }) => id === part.id)!,
    ),
  );
  const matrix = controlDeformation(a.visuals[0], b.visuals[0]);
  const entry = deformAnchor(spec.footprint.entry, matrix);
  const exit = deformAnchor(spec.footprint.exit, matrix);
  const route = spec.footprint.route.map((point) => deformPoint(point, matrix));
  return finishSpec(
    {
      ...spec,
      ...(spec.recoveryBoxes === undefined
        ? {}
        : { recoveryBoxes: transferRecovery(spec.recoveryBoxes, a.visuals[0], b.visuals[0]) }),
    },
    colliders,
    visuals,
    entry,
    exit,
    route,
  );
}
