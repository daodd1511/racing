import { useEffect, useMemo, type RefObject } from "react";
import { geometryForShape } from "../../modules/render/visualGeometry";
import { Matrix4, type Mesh } from "three";
import type { VisualSpec } from "../../modules/types";
import { getAuthoredMesh } from "./useAuthoredAssets";

export function AuthoredVisualMesh({
  visual,
  meshRef,
}: {
  readonly visual: VisualSpec;
  readonly meshRef?: RefObject<Mesh | null>;
}) {
  if (!visual.authored) throw new Error("Authored visual reference is required");
  const resource = getAuthoredMesh(visual.authored.assetId, visual.authored.node);
  // Geometry construction is expensive and owns a GPU resource across renders.
  const owned = useMemo(() => {
    if (!visual.authored?.deformed) return null;
    return visual.authored.deformation
      ? resource.geometry.clone().applyMatrix4(new Matrix4().fromArray(visual.authored.deformation))
      : geometryForShape(visual.shape);
  }, [resource.geometry, visual.authored?.deformed, visual.authored?.deformation, visual.shape]);
  useEffect(() => () => owned?.dispose(), [owned]);
  return (
    <mesh
      ref={meshRef}
      geometry={owned ?? resource.geometry}
      material={resource.material}
      position={visual.position}
      quaternion={visual.rotation}
      dispose={null}
    />
  );
}

export function AuthoredVisuals({ visuals }: { readonly visuals: readonly VisualSpec[] }) {
  return visuals.map((visual) => <AuthoredVisualMesh key={visual.id} visual={visual} />);
}

/** Primitive attachment borrows cache geometry while sibling JSX materials remain component-owned. */
export function AuthoredMarbleGeometry() {
  return <primitive object={getAuthoredMesh("marble", "marble").geometry} attach="geometry" />;
}
