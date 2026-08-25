import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { Shape, Spec, VisualSpec } from "../types";

export function geometryForShape(shape: Shape): THREE.BufferGeometry {
  switch (shape.kind) {
    case "cuboid":
      return new THREE.BoxGeometry(
        shape.halfExtents[0] * 2,
        shape.halfExtents[1] * 2,
        shape.halfExtents[2] * 2,
      );
    case "cylinder":
      return new THREE.CylinderGeometry(shape.radius, shape.radius, shape.halfHeight * 2, 24);
    case "ball":
      return new THREE.SphereGeometry(shape.radius, 24, 16);
    case "trimesh": {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(shape.vertices, 3));
      geometry.setIndex(shape.indices as number[]);
      geometry.computeVertexNormals();
      return geometry;
    }
  }
}

function materialKey(material: VisualSpec["material"]): string {
  return `${material.color}:${material.metalness}:${material.roughness}`;
}

export interface StaticVisualBatch {
  readonly geometry: THREE.BufferGeometry;
  readonly material: VisualSpec["material"];
}

/** Pre-transforms immutable course visuals and merges them by material. */
export function mergeStaticVisualsByMaterial(specs: readonly Spec[]): readonly StaticVisualBatch[] {
  const visualsByMaterial = new Map<
    string,
    { readonly material: VisualSpec["material"]; readonly visuals: VisualSpec[] }
  >();
  for (const spec of specs) {
    for (const visual of spec.visuals) {
      const key = materialKey(visual.material);
      const group = visualsByMaterial.get(key);
      if (group === undefined) {
        visualsByMaterial.set(key, { material: visual.material, visuals: [visual] });
      } else {
        group.visuals.push(visual);
      }
    }
  }

  return [...visualsByMaterial.values()].map(({ material, visuals }) => {
    const geometries = visuals.map((visual) => {
      const geometry = geometryForShape(visual.shape);
      geometry.deleteAttribute("uv");
      geometry.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(...visual.position),
          new THREE.Quaternion(...visual.rotation),
          new THREE.Vector3(1, 1, 1),
        ),
      );
      return geometry;
    });
    try {
      const geometry = mergeGeometries(geometries);
      if (geometry === null) throw new Error("Static course visuals could not be merged");
      return Object.freeze({ geometry, material });
    } finally {
      geometries.forEach((geometry) => geometry.dispose());
    }
  });
}
