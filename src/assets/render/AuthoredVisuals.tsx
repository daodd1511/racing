import type { RefObject } from "react";
import type { Mesh } from "three";
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
  return (
    <mesh
      ref={meshRef}
      geometry={resource.geometry}
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
