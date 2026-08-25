import { useEffect, useMemo } from "react";

import type { Spec } from "../types";
import { mergeStaticVisualsByMaterial } from "./visualGeometry";

export function StaticSpecVisuals({ specs }: { readonly specs: readonly Spec[] }) {
  const batches = useMemo(() => mergeStaticVisualsByMaterial(specs), [specs]);

  useEffect(() => {
    return () => batches.forEach(({ geometry }) => geometry.dispose());
  }, [batches]);

  return batches.map(({ geometry, material }) => (
    <mesh key={geometry.uuid} geometry={geometry}>
      <meshStandardMaterial
        color={material.color}
        metalness={material.metalness}
        roughness={material.roughness}
      />
    </mesh>
  ));
}
