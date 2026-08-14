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
  pin: 0x42d6c8,
  rumble: 0xf6c944,
};

function createPatternTexture(style: MarbleStyle): THREE.CanvasTexture {
  const surface = document.createElement("canvas");
  surface.width = 256;
  surface.height = 256;
  const context = surface.getContext("2d");
  if (context !== null) {
    context.fillStyle = style.color;
    context.fillRect(0, 0, surface.width, surface.height);
    context.strokeStyle = style.accentColor;
    context.fillStyle = style.accentColor;
    context.lineCap = "round";

    if (style.pattern === "ribbon") {
      context.lineWidth = 52;
      context.beginPath();
      context.moveTo(-24, 210);
      context.bezierCurveTo(48, 138, 152, 170, 280, 22);
      context.stroke();
      context.strokeStyle = "#ffffff";
      context.globalAlpha = 0.42;
      context.lineWidth = 10;
      context.beginPath();
      context.moveTo(-20, 192);
      context.bezierCurveTo(58, 126, 142, 160, 268, 14);
      context.stroke();
      context.globalAlpha = 1;
    } else if (style.pattern === "orbit") {
      context.lineWidth = 24;
      for (const rotation of [-0.5, 0.42]) {
        context.save();
        context.translate(128, 128);
        context.rotate(rotation);
        context.beginPath();
        context.ellipse(0, 0, 128, 48, 0, 0, Math.PI * 2);
        context.stroke();
        context.restore();
      }
      context.fillStyle = "#fff7e8";
      context.beginPath();
      context.arc(105, 94, 13, 0, Math.PI * 2);
      context.fill();
    } else if (style.pattern === "confetti") {
      const marks: readonly [number, number, number, number][] = [
        [32, 42, 12, 32],
        [84, 70, 28, 10],
        [148, 32, 14, 30],
        [210, 66, 30, 12],
        [46, 138, 30, 12],
        [108, 130, 12, 34],
        [174, 142, 28, 12],
        [224, 166, 12, 30],
        [72, 218, 14, 28],
        [146, 208, 30, 12],
        [204, 226, 16, 28],
      ];
      for (const [x, y, width, height] of marks) {
        context.save();
        context.translate(x, y);
        context.rotate((x + y) / 110);
        context.fillRect(-width / 2, -height / 2, width, height);
        context.restore();
      }
    } else if (style.pattern === "diamond") {
      for (let row = -1; row < 6; row += 1) {
        for (let column = -1; column < 6; column += 1) {
          context.save();
          context.translate(column * 64 + (row % 2) * 32, row * 52 + 18);
          context.rotate(Math.PI / 4);
          context.fillRect(-20, -20, 40, 40);
          context.restore();
        }
      }
    } else {
      context.fillRect(0, 0, surface.width, 92);
      context.fillStyle = "#fff7e8";
      context.globalAlpha = 0.72;
      context.fillRect(0, 98, surface.width, 12);
      context.globalAlpha = 1;
      context.beginPath();
      context.arc(128, 175, 54, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createNameTagTexture(
  name: string,
  accentColor: string,
): {
  readonly texture: THREE.CanvasTexture;
  readonly aspectRatio: number;
} {
  const surface = document.createElement("canvas");
  const context = surface.getContext("2d");
  const label = name.length > 18 ? `${name.slice(0, 17)}…` : name;
  const font = "700 34px ui-monospace, SFMono-Regular, Menlo, monospace";
  if (context !== null) {
    context.font = font;
  }
  const textWidth = context === null ? label.length * 20 : context.measureText(label).width;
  surface.width = Math.ceil(textWidth + 52);
  surface.height = 58;
  const drawingContext = surface.getContext("2d");
  if (drawingContext !== null) {
    drawingContext.fillStyle = "rgba(7, 17, 31, 0.94)";
    drawingContext.beginPath();
    drawingContext.roundRect(1, 1, surface.width - 2, surface.height - 2, 15);
    drawingContext.fill();
    drawingContext.fillStyle = accentColor;
    drawingContext.fillRect(14, 9, 5, surface.height - 18);
    drawingContext.font = font;
    drawingContext.textBaseline = "middle";
    drawingContext.fillStyle = "#fff7e8";
    drawingContext.fillText(label, 30, surface.height / 2 + 1);
  }
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspectRatio: surface.width / surface.height };
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
  roster: readonly string[],
  styles: readonly MarbleStyle[],
  mode: SelectionMode,
): RaceScene {
  if (roster.length !== styles.length) {
    throw new RangeError("Every marble requires one roster name and one visual style");
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10243b);
  scene.fog = new THREE.Fog(0x10243b, 48, 215);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
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

  const floorGeometry = new THREE.PlaneGeometry(290, 290);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x07111f, roughness: 0.94 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -29, 100);
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
      emissive: box.kind === "side-rail" ? 0x351008 : box.kind === "pin" ? 0x063d42 : 0x493400,
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
    textures.push(map);
    const material = new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      map,
      roughness: 0.16,
      metalness: 0.08,
      clearcoat: 0.9,
      clearcoatRoughness: 0.14,
    });
    const mesh = new THREE.Mesh(marbleGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
    materials.push(material);
    return mesh;
  });
  const marbleLabels = roster.map((name, index) => {
    const tag = createNameTagTexture(name, styles[index].accentColor);
    const material = new THREE.SpriteMaterial({
      map: tag.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    const baseHeight = 0.54;
    sprite.scale.set(baseHeight * tag.aspectRatio, baseHeight, 1);
    sprite.renderOrder = 3;
    scene.add(sprite);
    meshes.push(sprite);
    materials.push(material);
    textures.push(tag.texture);
    return { sprite, material, baseHeight, aspectRatio: tag.aspectRatio };
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
      const label = marbleLabels[index];
      label.sprite.position.set(
        transform.position[0],
        transform.position[1] + track.config.marbleRadius * 2.55,
        transform.position[2],
      );
    }

    let trackedMarbleIndex = -1;
    let trackedPosition: THREE.Vector3 | undefined;
    if (transforms.length > 0) {
      const target = createCameraTarget(transforms, track, mode);
      trackedMarbleIndex = target.marbleIndex;
      trackedPosition = new THREE.Vector3(...transforms[target.marbleIndex].position);
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

    for (let index = 0; index < marbleLabels.length; index += 1) {
      const label = marbleLabels[index];
      const transform = transforms[index];
      if (transform === undefined) {
        label.sprite.visible = false;
        continue;
      }
      const isTracked = index === trackedMarbleIndex;
      const distanceSquared = label.sprite.position.distanceToSquared(camera.position);
      const nearbyTrackedMarbles =
        trackedPosition === undefined
          ? 0
          : transforms.filter(
              (candidate) =>
                new THREE.Vector3(...candidate.position).distanceToSquared(trackedPosition) < 5 * 5,
            ).length;
      label.sprite.visible = isTracked || (nearbyTrackedMarbles <= 3 && distanceSquared < 30 * 30);
      label.material.opacity = isTracked ? 1 : 0.82;
      const height = label.baseHeight * (isTracked ? 1.22 : 1);
      label.sprite.scale.set(height * label.aspectRatio, height, 1);
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
