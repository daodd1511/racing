import { buildChannel, RAIL_THICKNESS } from "../../modules/geometry/channel";
import type { StaircaseParams } from "../../modules/staircase";
import type { ColliderSpec, Spec } from "../../modules/types";
import type { Vector3 } from "../../race/types";
import type { ControlBinding } from "../types";
import {
  finishSpec,
  controlDeformation,
  deformAnchor,
  deformPoint,
  transferPart,
} from "./transfer";

function reference(p: StaircaseParams) {
  const rise = p.tread * 0.08 + p.riseHeight;
  const channel = buildChannel(
    Array.from({ length: p.stepCount }, (_, i) => ({
      start: [0, -i * rise, i * p.tread] as Vector3,
      end: [0, -i * rise - p.tread * 0.08, (i + 1) * p.tread] as Vector3,
      width: p.width,
    })),
    { friction: 0, restitution: 0 },
    "tread",
    { openContactSurfaces: "entry" },
  );
  const risers: ColliderSpec[] = Array.from({ length: p.stepCount }, (_, i) => ({
    id: `riser-${i}`,
    position: [0, -i * rise - p.tread * 0.08 - p.riseHeight / 2, (i + 1) * p.tread],
    rotation: [0, 0, 0, 1],
    shape: { kind: "cuboid", halfExtents: [p.width / 2 + RAIL_THICKNESS, p.riseHeight / 2, 0.004] },
    material: { friction: 0, restitution: 0 },
  }));
  return {
    ...channel,
    colliders: [...channel.colliders, ...risers],
    visuals: [...channel.visuals, ...risers],
    exit: { ...channel.exit, position: [0, -p.stepCount * rise, p.stepCount * p.tread] as Vector3 },
  };
}

export function tuneStaircase(
  spec: Spec,
  rest: StaircaseParams,
  next: StaircaseParams,
  bindings: readonly ControlBinding[],
): Spec {
  const a = reference(rest),
    b = reference(next);
  const transform = <T extends Spec["colliders"][number] | Spec["visuals"][number]>(
    part: T,
    target: ControlBinding["target"],
  ): T[] => {
    const binding = bindings.find((item) => item.partId === part.id && item.target === target)!;
    if (binding.repeatIndex! >= next.stepCount) return [];
    const oldParts = target === "collider" ? a.colliders : a.visuals;
    const newParts = target === "collider" ? b.colliders : b.visuals;
    return [
      transferPart(
        part,
        oldParts.find(({ id }) => id === part.id)!,
        newParts.find(({ id }) => id === part.id)!,
      ),
    ];
  };
  const treadMatrix = (oldStep: number, newStep: number) =>
    controlDeformation(
      a.visuals.find((part) => part.id === `tread-floor-${oldStep}`)!,
      b.visuals.find((part) => part.id === `tread-floor-${newStep}`)!,
    );
  const terminalMatrix = controlDeformation(a.colliders.at(-1)!, b.colliders.at(-1)!);
  const entry = deformAnchor(spec.footprint.entry, treadMatrix(0, 0));
  // The terminal marker is an authored end offset, even when interior steps are trimmed.
  const exit = deformAnchor(
    spec.footprint.exit,
    terminalMatrix,
    treadMatrix(rest.stepCount - 1, next.stepCount - 1),
  );
  const route = spec.footprint.route.slice(0, next.stepCount * 2 + 1).map((point, i) => {
    if (i === next.stepCount * 2) return deformPoint(spec.footprint.route.at(-1)!, terminalMatrix);
    const step = Math.floor(i / 2);
    return deformPoint(point, treadMatrix(step, step));
  });
  return finishSpec(
    spec,
    spec.colliders.flatMap((part) => transform(part, "collider")),
    spec.visuals.flatMap((part) => transform(part, "visual")),
    entry,
    exit,
    route,
  );
}
