import * as THREE from "three";

import type { MarbleTransform, SelectionMode } from "../race/types";
import type { TrackBox, TrackDefinition } from "../track/definition";
import type { MarbleStyle } from "./marbleStyles";
import { cameraDampingAlpha, createCameraTarget } from "./cameraTarget";

export interface RaceScene {
  render(transforms: readonly MarbleTransform[]): void;
  resize(): void;
  dispose(): void;
}

const TRACK_COLORS: Record<TrackBox["kind"], number> = {
  "side-rail": 0xf04f2e,
  "splitter-rail": 0x2faaa2,
  deflector: 0xf6c944,
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

function createFinishTexture(): THREE.CanvasTexture {
  const surface = document.createElement("canvas");
  surface.width = 256;
  surface.height = 32;
  const context = surface.getContext("2d");
  if (context !== null) {
    const size = 32;
    for (let row = 0; row < 1; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        context.fillStyle = (row + column) % 2 === 0 ? "#fff7e8" : "#17243b";
        context.fillRect(column * size, row * size, size, size);
      }
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
  mode: SelectionMode,
): RaceScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10243b);
  scene.fog = new THREE.Fog(0x10243b, 34, 105);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 220);
  const cameraLookAt = new THREE.Vector3();
  let cameraInitialized = false;
  let lastRenderedAt = performance.now();

  scene.add(new THREE.HemisphereLight(0xfff3d4, 0x07111f, 2.5));
  const keyLight = new THREE.DirectionalLight(0xfff0c7, 4.2);
  keyLight.position.set(-18, 34, 28);
  keyLight.castShadow = true;
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x48d8cf, 2.2);
  rimLight.position.set(24, 18, -12);
  scene.add(rimLight);

  const floorGeometry = new THREE.PlaneGeometry(190, 190);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x07111f, roughness: 0.94 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -1.5, 55);
  floor.receiveShadow = true;
  scene.add(floor);

  const meshes: THREE.Object3D[] = [floor];
  const geometries: THREE.BufferGeometry[] = [floorGeometry];
  const materials: THREE.Material[] = [floorMaterial];
  const textures: THREE.Texture[] = [];

  const surfaceGeometry = new THREE.BufferGeometry();
  surfaceGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(track.surface.vertices, 3),
  );
  surfaceGeometry.setIndex([...track.surface.indices]);
  surfaceGeometry.computeVertexNormals();
  const surfaceMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe7a3,
    roughness: 0.68,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
  surface.receiveShadow = true;
  scene.add(surface);
  meshes.push(surface);
  geometries.push(surfaceGeometry);
  materials.push(surfaceMaterial);

  for (const box of track.boxes) {
    const geometry = new THREE.BoxGeometry(
      box.halfExtents[0] * 2,
      box.halfExtents[1] * 2,
      box.halfExtents[2] * 2,
    );
    const material = new THREE.MeshStandardMaterial({
      color: TRACK_COLORS[box.kind],
      emissive:
        box.kind === "side-rail" ? 0x351008 : box.kind === "splitter-rail" ? 0x062f34 : 0x000000,
      emissiveIntensity: 0.45,
      roughness: 0.42,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    setVector(mesh.position, box.center);
    setQuaternion(mesh.quaternion, box.rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
    geometries.push(geometry);
    materials.push(material);
  }

  const bumperGeometry = new THREE.SphereGeometry(track.config.bumperRadius, 20, 14);
  const bumperRingGeometry = new THREE.TorusGeometry(
    track.config.bumperRadius * 0.94,
    track.config.bumperRadius * 0.12,
    8,
    20,
  );
  const bumperMaterial = new THREE.MeshStandardMaterial({
    color: 0x6ce0d3,
    emissive: 0x0b4c52,
    emissiveIntensity: 0.75,
    roughness: 0.25,
    metalness: 0.25,
  });
  const bumperRingMaterial = new THREE.MeshStandardMaterial({
    color: 0xf6c944,
    emissive: 0x493400,
    emissiveIntensity: 0.7,
    roughness: 0.28,
  });
  geometries.push(bumperGeometry, bumperRingGeometry);
  materials.push(bumperMaterial, bumperRingMaterial);
  for (const bumper of track.bumpers) {
    const mesh = new THREE.Mesh(bumperGeometry, bumperMaterial);
    setVector(mesh.position, bumper.center);
    mesh.castShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
    const ring = new THREE.Mesh(bumperRingGeometry, bumperRingMaterial);
    setVector(ring.position, bumper.center);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    scene.add(ring);
    meshes.push(ring);
  }

  const finishTexture = createFinishTexture();
  textures.push(finishTexture);
  const finishGeometry = new THREE.BoxGeometry(track.finishLine.halfWidth * 2, 0.035, 0.72);
  const finishMaterial = new THREE.MeshStandardMaterial({ map: finishTexture, roughness: 0.52 });
  const finish = new THREE.Mesh(finishGeometry, finishMaterial);
  const finishPosition: [number, number, number] = [
    track.finishLine.center[0] + track.finishLine.up[0] * 0.035,
    track.finishLine.center[1] + track.finishLine.up[1] * 0.035,
    track.finishLine.center[2] + track.finishLine.up[2] * 0.035,
  ];
  setVector(finish.position, finishPosition);
  const finishMatrix = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...track.finishLine.side),
    new THREE.Vector3(...track.finishLine.up),
    new THREE.Vector3(...track.finishLine.tangent),
  );
  finish.quaternion.setFromRotationMatrix(finishMatrix);
  finish.receiveShadow = true;
  scene.add(finish);
  meshes.push(finish);
  geometries.push(finishGeometry);
  materials.push(finishMaterial);

  const marbleGeometry = new THREE.SphereGeometry(track.config.marbleRadius, 28, 20);
  geometries.push(marbleGeometry);
  const marbleMeshes = styles.map((style) => {
    const map = createPatternTexture(style);
    if (map !== null) {
      textures.push(map);
    }
    const material = new THREE.MeshStandardMaterial({
      color: style.color,
      map,
      roughness: 0.22,
      metalness: 0.12,
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

    if (transforms.length > 0) {
      const target = createCameraTarget(transforms, track, mode);
      const desiredPosition = new THREE.Vector3(...target.position);
      const desiredLookAt = new THREE.Vector3(...target.lookAt);
      const renderedAt = performance.now();
      const deltaSeconds = Math.min(0.05, Math.max(0, (renderedAt - lastRenderedAt) / 1_000));
      lastRenderedAt = renderedAt;
      if (!cameraInitialized) {
        camera.position.copy(desiredPosition);
        cameraLookAt.copy(desiredLookAt);
        cameraInitialized = true;
      } else {
        const response = cameraDampingAlpha(deltaSeconds);
        camera.position.lerp(desiredPosition, response);
        cameraLookAt.lerp(desiredLookAt, response);
      }
      camera.lookAt(cameraLookAt);
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
      for (const texture of textures) {
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
