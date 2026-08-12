import * as THREE from "three";

import type { MarbleTransform } from "../race/types";
import type { TrackBox, TrackDefinition } from "../track/definition";
import type { MarbleStyle } from "./marbleStyles";

export interface RaceScene {
  render(transforms: readonly MarbleTransform[]): void;
  resize(): void;
  dispose(): void;
}

const TRACK_COLORS: Record<TrackBox["kind"], number> = {
  "containment-wall": 0x10243b,
  "helix-ramp": 0xf5e9d0,
  "helix-rail": 0xf05a30,
  "funnel-panel": 0xffc93c,
  "finish-tube": 0x10243b,
  "finish-basin": 0xf05a30,
};

function createPatternTexture(style: MarbleStyle): THREE.Texture | null {
  if (style.pattern === "solid") {
    return null;
  }

  const surface = document.createElement("canvas");
  surface.width = 96;
  surface.height = 96;
  const context = surface.getContext("2d");

  if (context === null) {
    return null;
  }

  context.fillStyle = style.color;
  context.fillRect(0, 0, surface.width, surface.height);
  context.fillStyle = style.accentColor;

  if (style.pattern === "stripe") {
    context.lineWidth = 14;
    for (let offset = -96; offset <= 96; offset += 30) {
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset + 96, 96);
      context.stroke();
    }
  } else {
    for (const coordinate of [18, 48, 78]) {
      context.beginPath();
      context.arc(coordinate, 24, 10, 0, Math.PI * 2);
      context.arc(coordinate - 15, 68, 10, 0, Math.PI * 2);
      context.fill();
    }
  }

  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function setVector(target: THREE.Vector3, value: readonly number[]): void {
  target.set(value[0], value[1], value[2]);
}

function setQuaternion(target: THREE.Quaternion, value: readonly number[]): void {
  target.set(value[0], value[1], value[2], value[3]);
}

export function createRaceScene(
  canvas: HTMLCanvasElement,
  track: TrackDefinition,
  styles: readonly MarbleStyle[],
): RaceScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8e7e0);
  scene.fog = new THREE.Fog(0xd8e7e0, 24, 60);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(22, 31, 38);
  camera.lookAt(0, 21.5, 0);

  const ambient = new THREE.HemisphereLight(0xfff3d4, 0x2858d7, 2.2);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0xfff7e8, 3.2);
  keyLight.position.set(-12, 35, 16);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(12, 64),
    new THREE.MeshStandardMaterial({ color: 0xc8ddd4, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = track.config.basinY - 0.61;
  floor.receiveShadow = true;
  scene.add(floor);

  const meshes: THREE.Object3D[] = [floor];
  const geometries: THREE.BufferGeometry[] = [floor.geometry];
  const materials: THREE.Material[] = [floor.material];
  const patternTextures: THREE.Texture[] = [];

  for (const box of track.boxes) {
    const geometry = new THREE.BoxGeometry(
      box.halfExtents[0] * 2,
      box.halfExtents[1] * 2,
      box.halfExtents[2] * 2,
    );
    const material = new THREE.MeshStandardMaterial({
      color: TRACK_COLORS[box.kind],
      roughness: box.kind === "helix-ramp" ? 0.68 : 0.5,
      metalness: box.kind === "helix-rail" ? 0.35 : 0.03,
      transparent: box.kind === "containment-wall",
      opacity: box.kind === "containment-wall" ? 0.09 : 1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    setVector(mesh.position, box.center);
    setQuaternion(mesh.quaternion, box.rotation);
    mesh.castShadow = box.kind !== "containment-wall";
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
    geometries.push(geometry);
    materials.push(material);
  }

  const pegGeometry = new THREE.SphereGeometry(track.config.pegRadius, 14, 10);
  const pegMaterial = new THREE.MeshStandardMaterial({
    color: 0xf05a30,
    roughness: 0.36,
    metalness: 0.1,
  });
  geometries.push(pegGeometry);
  materials.push(pegMaterial);

  for (const peg of track.pegs) {
    const mesh = new THREE.Mesh(pegGeometry, pegMaterial);
    setVector(mesh.position, peg.center);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
  }

  const marbleGeometry = new THREE.SphereGeometry(track.config.marbleRadius, 28, 20);
  geometries.push(marbleGeometry);
  const marbleMeshes = styles.map((style) => {
    const map = createPatternTexture(style);
    if (map !== null) {
      patternTextures.push(map);
    }
    const material = new THREE.MeshStandardMaterial({
      color: style.color,
      map,
      roughness: 0.28,
      metalness: 0.06,
    });
    const mesh = new THREE.Mesh(marbleGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
    materials.push(material);

    return mesh;
  });

  function resize(): void {
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds.width));
    const height = Math.max(1, Math.floor(bounds.height));

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render(transforms: readonly MarbleTransform[]): void {
    for (let index = 0; index < marbleMeshes.length; index += 1) {
      const transform = transforms[index];

      if (transform === undefined) {
        marbleMeshes[index].visible = false;
        continue;
      }

      marbleMeshes[index].visible = true;
      setVector(marbleMeshes[index].position, transform.position);
      setQuaternion(marbleMeshes[index].quaternion, transform.rotation);
    }

    renderer.render(scene, camera);
  }

  resize();

  return {
    render,
    resize,
    dispose() {
      for (const object of meshes) {
        scene.remove(object);
      }
      for (const texture of patternTextures) {
        texture.dispose();
      }
      for (const material of materials) {
        material.dispose();
      }
      for (const geometry of geometries) {
        geometry.dispose();
      }
      renderer.dispose();
    },
  };
}
