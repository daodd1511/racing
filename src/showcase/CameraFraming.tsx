import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef } from "react";
import * as THREE from "three";

import type { Footprint } from "../modules/types";

// Fits the camera to a Module's Footprint.bounds, then hands off to
// OrbitControls so the user can zoom out (or in, or orbit) freely from
// there. The old camera was one fixed position `{[0, 0.3, 0.6], fov: 50}`
// tuned for the chute, so larger Modules could extend outside the viewport
// with no way to back the camera up.

/** Padding around the bounds so a Module's own edges aren't touching the
 * viewport's -- a tight crop reads as "cut off", not "fits". */
const FRAMING_MARGIN = 1.35;

/** Same elevated front-ish angle the old fixed camera always used, just
 * scaled to whatever distance a given Module's bounds need. */
const VIEW_DIRECTION = new THREE.Vector3(0, 0.5, 1).normalize();

/** Floor on the fit distance -- a Module with near-zero bounds (not
 * expected, but not the kind of thing to divide by) still gets a sane
 * camera instead of one sitting inside the geometry. */
const MIN_RADIUS = 0.05;

export interface CameraFramingProps {
  /** The bounds to fit -- pass a value that changes identity only when the
   * *Module* changes, not on every param edit (Showcase.tsx computes this
   * from the Module's default params for exactly that reason), or every
   * slider drag will yank the camera out from under a zoom the user just
   * made by hand. */
  readonly bounds: Footprint["bounds"];
}

export function CameraFraming({ bounds }: CameraFramingProps) {
  const { camera } = useThree();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return; // Showcase's <Canvas> never requests orthographic; this is a type guard, not a real branch.
    }

    const center = new THREE.Vector3(
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    );
    const size = new THREE.Vector3(
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
    );
    const radius = Math.max(size.length() / 2, MIN_RADIUS);
    const fovRadians = (camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fovRadians / 2)) * FRAMING_MARGIN;

    camera.position.copy(center).addScaledVector(VIEW_DIRECTION, distance);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
  }, [bounds, camera]);

  return <OrbitControls ref={controlsRef} makeDefault enableDamping />;
}
