import { Quaternion, Vector3 as V3 } from "three";
import { buildChannel } from "../../modules/geometry/channel";
import { sweepProfileToPlates } from "../../modules/geometry/sweep";
import type { WhoopsParams } from "../../modules/whoops";
import type { Anchor, ColliderSpec, Shape, Spec, VisualSpec } from "../../modules/types";
import { SCALE } from "../../race/scale";
import type { Vector3 } from "../../race/types";
import type { ControlBinding } from "../types";
import { finishSpec, anchorDeformation, deformAnchor, deformPoint, transferPart } from "./transfer";

const tuple = (v: V3): Vector3 => [v.x, v.y, v.z];
const profile = (p: WhoopsParams, z: number): Vector3 => [
  0,
  -p.grade * z + p.amplitude * Math.sin((2 * Math.PI * z) / p.wavelength),
  z,
];
function sampleCount(p: WhoopsParams): number {
  const k = (2 * Math.PI) / p.wavelength;
  const radius = 1 / (p.amplitude * k * k);
  const arc =
    2 * radius * Math.acos(Math.max(-1, 1 - Math.min(2, (SCALE.marbleRadius * 0.25) / radius)));
  return Math.ceil((p.length * Math.sqrt(1 + (p.grade + p.amplitude * k) ** 2)) / arc);
}
function reference(p: WhoopsParams, count: number) {
  const route = Array.from({ length: count + 1 }, (_, i) => profile(p, (p.length * i) / count));
  const channel = buildChannel(
    route.slice(0, -1).map((start, i) => ({ start, end: route[i + 1], width: p.width })),
    { friction: 0, restitution: 0 },
    "whoops",
  );
  const plates: ColliderSpec[] = sweepProfileToPlates(
    route,
    p.width,
    SCALE.marbleRadius,
    "whoops",
  ).map(({ halfExtents, ...part }) => ({
    ...part,
    shape: { kind: "cuboid", halfExtents },
    material: { friction: 0, restitution: 0 },
  }));
  return {
    route,
    entry: channel.entry,
    exit: channel.exit,
    colliders: [...channel.colliders.filter(({ id }) => !id.startsWith("whoops-floor")), ...plates],
    visuals: channel.visuals.filter(({ id }) => !id.startsWith("whoops-floor")),
  };
}

/** Only the explicitly bound sampled strip can change topology; arbitrary meshes are rejected. */
export function tuneWhoops(
  spec: Spec,
  rest: WhoopsParams,
  next: WhoopsParams,
  bindings: readonly ControlBinding[],
): Spec {
  const oldCount = spec.footprint.route.length - 1;
  // Keep the authored sampling density when shortening; refine if curvature requires it.
  const count = Math.max(2, Math.ceil((oldCount * next.length) / rest.length), sampleCount(next));
  const a = reference(rest, oldCount),
    b = reference(next, count);
  const sampleFrame = (route: readonly Vector3[], index: number, position: Vector3): Anchor => {
    const low = Math.min(route.length - 2, index);
    const tangent = new V3(...route[low + 1]).sub(new V3(...route[low])).normalize();
    return {
      position,
      tangent: tuple(tangent),
      up: tuple(
        tangent
          .clone()
          .cross(new V3(1, 0, 0))
          .normalize(),
      ),
    };
  };
  const sampleMatrix = (i: number) => {
    const fraction = (i * oldCount) / count;
    const low = Math.min(oldCount - 1, Math.floor(fraction)),
      mix = fraction - low;
    const oldPoint = tuple(new V3(...a.route[low]).lerp(new V3(...a.route[low + 1]), mix));
    return anchorDeformation(
      sampleFrame(a.route, low, oldPoint),
      sampleFrame(b.route, i, b.route[i]),
      [next.width / rest.width, 1, next.length / rest.length],
    );
  };
  const sourceIndex = (i: number) => Math.min(oldCount - 1, Math.floor((i * oldCount) / count));
  function repeat<T extends ColliderSpec | VisualSpec>(
    parts: readonly T[],
    target: ControlBinding["target"],
  ): T[] {
    const oldRefs = target === "collider" ? a.colliders : a.visuals;
    const newRefs = target === "collider" ? b.colliders : b.visuals;
    return newRefs.map((destination) => {
      const i = Number(destination.id.split("-").at(-1));
      const id = destination.id.replace(/\d+$/, String(sourceIndex(i)));
      const source = parts.find((part) => part.id === id);
      const binding = bindings.find((item) => item.partId === id && item.target === target);
      if (!source || binding?.region !== "wave")
        throw new Error(`whoops: missing repeatable wave binding ${id}`);
      return transferPart(
        source,
        oldRefs.find((part) => part.id === id)!,
        destination,
      );
    });
  }
  const floor = spec.visuals.find((part) => part.id === "whoops-floor")!;
  if (
    floor.shape.kind !== "trimesh" ||
    floor.shape.vertices.length !== (oldCount + 1) * 6 ||
    floor.shape.indices.length !== oldCount * 6
  )
    throw new Error(
      "whoops-floor: unsupported deformation; preserve the authored two-vertex sampled strip",
    );
  for (let i = 0; i < oldCount; i++) {
    const expected = [2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3];
    if (
      expected.some(
        (index, j) => floor.shape.kind !== "trimesh" || floor.shape.indices[i * 6 + j] !== index,
      )
    )
      throw new Error("whoops-floor: unsupported strip topology");
  }
  const vertices: number[] = [],
    indices: number[] = [];
  const route: Vector3[] = [];
  for (let i = 0; i <= count; i++) {
    const fraction = (i * oldCount) / count;
    const low = Math.min(oldCount - 1, Math.floor(fraction)),
      mix = fraction - low;
    const matrix = sampleMatrix(i);
    const savedRoute = new V3(...spec.footprint.route[low]).lerp(
      new V3(...spec.footprint.route[low + 1]),
      mix,
    );
    route.push(deformPoint(tuple(savedRoute), matrix));
    for (let side = 0; side < 2; side++) {
      const offset = low * 6 + side * 3;
      const saved = new V3(...floor.shape.vertices.slice(offset, offset + 3))
        .lerp(new V3(...floor.shape.vertices.slice(offset + 6, offset + 9)), mix)
        .applyQuaternion(new Quaternion(...floor.rotation))
        .add(new V3(...floor.position));
      vertices.push(...deformPoint(tuple(saved), matrix));
    }
    if (i < count) indices.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
  }
  const shape: Shape = { kind: "trimesh", vertices, indices };
  const tunedFloor: VisualSpec = {
    ...floor,
    shape,
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    authored: { ...floor.authored!, deformed: true },
  };
  return finishSpec(
    spec,
    repeat(spec.colliders, "collider"),
    [...repeat(spec.visuals, "visual"), tunedFloor],
    deformAnchor(spec.footprint.entry, sampleMatrix(0)),
    deformAnchor(spec.footprint.exit, sampleMatrix(count)),
    route,
  );
}
