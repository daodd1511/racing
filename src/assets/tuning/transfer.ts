import { Matrix3, Matrix4, Quaternion, Vector3 as V3 } from "three";
import type {
  Anchor,
  ColliderSpec,
  RecoveryBox,
  Shape,
  Spec,
  VisualSpec,
} from "../../modules/types";
import type { Vector3 } from "../../race/types";

type Part = Pick<ColliderSpec, "id" | "position" | "rotation" | "shape">;
const tuple = (v: V3): Vector3 => [v.x, v.y, v.z];
function frame(part: Pick<Part, "position" | "rotation">): Matrix4 {
  return new Matrix4().compose(
    new V3(...part.position),
    new Quaternion(...part.rotation),
    new V3(1, 1, 1),
  );
}
function dimensions(shape: Shape): Vector3 {
  switch (shape.kind) {
    case "cuboid":
      return shape.halfExtents;
    case "cylinder":
      return [shape.radius, shape.halfHeight, shape.radius];
    case "ball":
      return [shape.radius, shape.radius, shape.radius];
    case "trimesh": {
      const min = [Infinity, Infinity, Infinity],
        max = [-Infinity, -Infinity, -Infinity];
      shape.vertices.forEach((value, i) => {
        min[i % 3] = Math.min(min[i % 3], value);
        max[i % 3] = Math.max(max[i % 3], value);
      });
      return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    }
  }
}

/** Shared point/part deformation between explicit control frames. */
export function controlDeformation(rest: Part, next: Part): Matrix4 {
  const a = dimensions(rest.shape),
    b = dimensions(next.shape);
  const scale = a.map((value, i) => (value === 0 ? 1 : b[i] / value)) as unknown as Vector3;
  // Zero-width contact planes move with their authored channel control frame.
  const local = new Matrix4().makeScale(...scale);
  if (rest.shape.kind === "trimesh" && next.shape.kind === "trimesh") {
    const center = (shape: Extract<Shape, { kind: "trimesh" }>) => {
      const p = new V3();
      for (let i = 0; i < shape.vertices.length; i += 3)
        p.add(new V3(...shape.vertices.slice(i, i + 3)));
      return p.divideScalar(shape.vertices.length / 3);
    };
    const offset = center(next.shape).sub(center(rest.shape).multiply(new V3(...scale)));
    local.setPosition(offset);
  }
  return frame(next).multiply(local).multiply(frame(rest).invert());
}

/** Transfer an authored part between two explicit control frames, including saved offsets. */
export function transferPart<T extends Part>(part: T, rest: Part, next: Part): T {
  const transformed = controlDeformation(rest, next).multiply(frame(part));
  const position = new V3(),
    rotation = new Quaternion(),
    partScale = new V3();
  transformed.decompose(position, rotation, partScale);
  const rigid = new Matrix4().compose(position, rotation, new V3(1, 1, 1));
  const deformation = rigid.clone().invert().multiply(transformed);
  const shape = transformShape(part.shape, deformation, part.id);
  const result = {
    ...part,
    id: next.id,
    position: tuple(position),
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    shape,
  };
  if ("authored" in part && part.authored) {
    Object.assign(result, {
      authored: { ...part.authored, deformed: true, deformation: deformation.toArray() },
    });
  }
  return result as T;
}

export function transformShape(shape: Shape, matrix: Matrix4, id: string): Shape {
  if (shape.kind === "trimesh") {
    const vertices: number[] = [];
    for (let i = 0; i < shape.vertices.length; i += 3)
      vertices.push(...tuple(new V3(...shape.vertices.slice(i, i + 3)).applyMatrix4(matrix)));
    return { ...shape, vertices };
  }
  const e = matrix.elements;
  if (
    [1, 2, 4, 6, 8, 9, 12, 13, 14].some((i) => Math.abs(e[i]) > 1e-6) ||
    [e[0], e[5], e[10]].some((value) => value <= 0)
  )
    throw new Error(`${id}: unsupported primitive deformation (shear or reflection)`);
  const [x, y, z] = [e[0], e[5], e[10]];
  if (shape.kind === "cuboid")
    return {
      ...shape,
      halfExtents: [shape.halfExtents[0] * x, shape.halfExtents[1] * y, shape.halfExtents[2] * z],
    };
  if (Math.abs(x - z) > 1e-6 || (shape.kind === "ball" && Math.abs(x - y) > 1e-6))
    throw new Error(`${id}: unsupported nonuniform round collider deformation`);
  return shape.kind === "ball"
    ? { ...shape, radius: shape.radius * x }
    : { ...shape, radius: shape.radius * x, halfHeight: shape.halfHeight * y };
}

export function deformPoint(point: Vector3, matrix: Matrix4): Vector3 {
  return tuple(new V3(...point).applyMatrix4(matrix));
}

export function deformAnchor(
  anchor: Anchor,
  matrix: Matrix4,
  directions: Matrix4 = matrix,
): Anchor {
  return {
    position: deformPoint(anchor.position, matrix),
    tangent: tuple(new V3(...anchor.tangent).transformDirection(directions)),
    up: tuple(
      new V3(...anchor.up).applyMatrix3(new Matrix3().getNormalMatrix(directions)).normalize(),
    ),
  };
}

export function anchorDeformation(rest: Anchor, next: Anchor, scale: Vector3): Matrix4 {
  const basis = (anchor: Anchor) =>
    new Matrix4()
      .makeBasis(
        new V3(...anchor.up).cross(new V3(...anchor.tangent)).normalize(),
        new V3(...anchor.up),
        new V3(...anchor.tangent),
      )
      .setPosition(...anchor.position);
  return basis(next)
    .multiply(new Matrix4().makeScale(...scale))
    .multiply(basis(rest).invert());
}

export function finishSpec(
  rest: Spec,
  colliders: readonly ColliderSpec[],
  visuals: readonly VisualSpec[],
  entry: Anchor,
  exit: Anchor,
  route: readonly Vector3[],
): Spec {
  const points: V3[] = [];
  for (const part of [...colliders, ...visuals]) {
    const matrix = frame(part);
    if (part.shape.kind === "trimesh") {
      for (let i = 0; i < part.shape.vertices.length; i += 3)
        points.push(new V3(...part.shape.vertices.slice(i, i + 3)).applyMatrix4(matrix));
    } else {
      const extents = dimensions(part.shape);
      for (const x of [-1, 1])
        for (const y of [-1, 1])
          for (const z of [-1, 1])
            points.push(
              new V3(x * extents[0], y * extents[1], z * extents[2]).applyMatrix4(matrix),
            );
    }
  }
  points.push(...[...route, entry.position, exit.position].map((point) => new V3(...point)));
  const min = new V3(Infinity, Infinity, Infinity),
    max = new V3(-Infinity, -Infinity, -Infinity);
  points.forEach((point) => {
    min.min(point);
    max.max(point);
  });
  return {
    ...rest,
    colliders,
    visuals,
    footprint: { cells: [], entry, exit, route, bounds: { min: tuple(min), max: tuple(max) } },
  };
}

/** No recovery-region bindings exist in v1; only a single affine deformation is safe. */
export function transferRecovery(
  boxes: readonly RecoveryBox[] | undefined,
  rest: Part,
  next: Part,
): readonly RecoveryBox[] | undefined {
  return boxes?.map((box, i) => {
    const result = transferPart(
      {
        ...box,
        id: `recovery-${i}`,
        shape: { kind: "cuboid" as const, halfExtents: box.halfExtents },
      },
      rest,
      next,
    );
    if (result.shape.kind !== "cuboid") throw new Error("Unsupported recovery deformation");
    return {
      position: result.position,
      rotation: result.rotation,
      halfExtents: result.shape.halfExtents,
    };
  });
}
