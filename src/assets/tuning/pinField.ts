import { Quaternion, Vector3 } from "three";
import type { PinFieldParams } from "../../modules/pinField";
import { FLOOR_THICKNESS } from "../../modules/geometry/channel";
import type { ColliderSpec, Spec } from "../../modules/types";
import { SCALE } from "../../race/scale";
import type { ControlBinding } from "../types";
import { channelReference } from "./chute";
import {
  finishSpec,
  controlDeformation,
  deformAnchor,
  deformPoint,
  transferPart,
} from "./transfer";

type Params = Required<PinFieldParams>;
const leadIn = SCALE.marbleRadius * 36;
const run = (p: Params) => leadIn + (p.rowCount - 1) * p.rowPitch + SCALE.marbleRadius * 6;
function reference(p: Params, binding: ControlBinding): ColliderSpec {
  const row = binding.repeatIndex!;
  const pitch = new Quaternion().setFromUnitVectors(
    new Vector3(0, 0, 1),
    new Vector3(0, -p.courseGrade, 1).normalize(),
  );
  const bumper = binding.region === "bumper";
  const column = Number(binding.partId.split("-").at(-1));
  const shift = Math.max(
    0,
    SCALE.channelWidth / 2 -
      (p.postWidth * Math.SQRT2) / 2 -
      SCALE.marbleRadius * 2.5 -
      1.5 * p.postSpacing,
  );
  const x = bumper
    ? ((row % 2 ? -1 : 1) * SCALE.channelWidth) / 2
    : (column - 1.5) * p.postSpacing + (row % 2 ? shift : -shift);
  const center = new Vector3(0, (-run(p) * p.courseGrade) / 2, run(p) / 2);
  const position = new Vector3(
    x,
    FLOOR_THICKNESS / 2 + p.postHeight / 2,
    leadIn + row * p.rowPitch - run(p) / 2,
  )
    .applyQuaternion(pitch)
    .add(center);
  const rotation =
    binding.target === "visual" && !bumper
      ? pitch.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4))
      : pitch;
  return {
    id: binding.partId,
    position: [position.x, position.y, position.z],
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    shape: {
      kind: "cylinder",
      radius: bumper ? SCALE.marbleRadius * 3 : (p.postWidth * Math.SQRT2) / 2,
      halfHeight: p.postHeight / 2,
    },
    material: { friction: 0, restitution: 0 },
  };
}

export function tunePinField(
  spec: Spec,
  rest: Params,
  next: Params,
  bindings: readonly ControlBinding[],
): Spec {
  const span = 3 * next.postSpacing + next.postWidth * Math.SQRT2 + SCALE.marbleRadius * 5;
  if (span > SCALE.channelWidth + 1e-9)
    throw new Error(
      "pin-field.postSpacing: four posts and required rail gaps do not fit the channel",
    );
  const a = channelReference(run(rest), rest.courseGrade, SCALE.channelWidth);
  const b = channelReference(run(next), next.courseGrade, SCALE.channelWidth);
  function transform<T extends Spec["colliders"][number] | Spec["visuals"][number]>(
    part: T,
    target: ControlBinding["target"],
  ): T[] {
    const binding = bindings.find((item) => item.partId === part.id && item.target === target)!;
    if (binding.repeatIndex !== undefined && binding.repeatIndex >= next.rowCount) return [];
    if (binding.region === "channel") {
      const oldParts = target === "collider" ? a.colliders : a.visuals;
      const newParts = target === "collider" ? b.colliders : b.visuals;
      return [
        transferPart(
          part,
          oldParts.find(({ id }) => id === part.id)!,
          newParts.find(({ id }) => id === part.id)!,
        ),
      ];
    }
    return [transferPart(part, reference(rest, binding), reference(next, binding))];
  }
  const matrix = controlDeformation(a.visuals[0], b.visuals[0]);
  const entry = deformAnchor(spec.footprint.entry, matrix);
  const exit = deformAnchor(spec.footprint.exit, matrix);
  const route = spec.footprint.route.map((point) => deformPoint(point, matrix));
  return finishSpec(
    spec,
    spec.colliders.flatMap((part) => transform(part, "collider")),
    spec.visuals.flatMap((part) => transform(part, "visual")),
    entry,
    exit,
    route,
  );
}
