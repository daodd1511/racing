import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { SphereGeometry, type BufferGeometry } from "three";
import { courseParamValues, COURSE_MODULES } from "../../src/course/courseModules";
import { buildStartSpec, buildFinishSpec } from "../../src/course/startFinish";
import { raceVisibleSpec } from "../../src/course/render/raceVisuals";
import { geometryForShape } from "../../src/modules/render/visualGeometry";
import type { Spec } from "../../src/modules/types";
import { createMarbleStyles } from "../../src/render/marbleStyles";
import { marbleStripeTexture } from "../../src/render/marbleSkin";
import { SCALE } from "../../src/race/scale";
import { PHYSICS_PROFILES } from "../../src/assets/physicsProfiles";
import { parseAuthoredAsset } from "../../src/assets/parseAuthoredAsset";
import type { AssetId, ControlBinding } from "../../src/assets/types";

function mesh(geometry: BufferGeometry) {
  try {
    return {
      vertices: Array.from(geometry.getAttribute("position").array),
      indices: geometry.index
        ? Array.from(geometry.index.array)
        : Array.from({ length: geometry.getAttribute("position").count }, (_, i) => i),
      normals: Array.from(geometry.getAttribute("normal").array),
      uv: geometry.hasAttribute("uv") ? Array.from(geometry.getAttribute("uv").array) : null,
    };
  } finally {
    geometry.dispose();
  }
}
function binding(
  assetId: AssetId,
  target: ControlBinding["target"],
  partId: string,
): ControlBinding {
  let region: ControlBinding["region"] = "channel";
  let repeatIndex: number | undefined;
  if (assetId === "pin-field") {
    if (partId.includes("bumper")) region = "bumper";
    else if (partId.includes("post")) region = "post";
  } else if (assetId === "staircase") region = "step";
  else if (assetId === "whoops") region = partId.includes("entrance") ? "end" : "wave";
  if (["post", "bumper", "step"].includes(region)) {
    const match = partId.match(/\d+/);
    if (match) repeatIndex = Number(match[0]);
  }
  return { target, partId, region, ...(repeatIndex === undefined ? {} : { repeatIndex }) };
}
async function capture(id: AssetId, raw: Spec, values: unknown = null) {
  const spec = raceVisibleSpec(raw);
  const baseline = values === null ? null : { moduleId: id, values };
  const gate = spec.colliders.find((part) => part.motion)?.motion;
  const sensor = spec.colliders.find((part) => part.sensor);
  const asset = parseAuthoredAsset({
    schemaVersion: 1,
    id,
    footprint: spec.footprint,
    ...(spec.recoveryBoxes === undefined ? {} : { recoveryBoxes: spec.recoveryBoxes }),
    colliders: spec.colliders.map(({ material, ...part }) => {
      const profile = Object.entries(PHYSICS_PROFILES).find(
        ([, v]) =>
          Math.abs(v.restitution - material.restitution) < 1e-12 &&
          v.friction === material.friction,
      )?.[0];
      if (!profile) throw new Error(`Uncaptured physical material on ${id}:${part.id}`);
      return { ...part, physicalProfile: profile };
    }),
    visuals: spec.visuals.map((part) => ({ ...part, node: part.id })),
    markers: {
      ...(gate ? { gatePivot: gate.pivot } : {}),
      ...(sensor ? { finishSensor: sensor.id } : {}),
    },
    controls:
      baseline === null
        ? []
        : [
            ...spec.visuals.map((p) => binding(id, "visual", p.id)),
            ...spec.colliders.map((p) => binding(id, "collider", p.id)),
          ],
    baseline,
  });
  const meshes = Object.fromEntries(
    spec.visuals.map((p) => [p.id, mesh(geometryForShape(p.shape))]),
  );
  const colliderMeshes = Object.fromEntries(
    spec.colliders.map((p) => [p.id, mesh(geometryForShape(p.shape))]),
  );
  await writeFile(
    `assets/baseline/${id}.json`,
    JSON.stringify({ asset, meshes, colliderMeshes }, null, 2) + "\n",
    { flag: "wx" },
  );
}

await mkdir("assets/baseline", { recursive: true });
for (const module of COURSE_MODULES)
  await capture(
    module.id as AssetId,
    module.buildSpec(courseParamValues(module)),
    courseParamValues(module),
  );
await capture("start", buildStartSpec());
await capture("finish", buildFinishSpec());
const radius = SCALE.marbleRadius;
const marbleGeometry = mesh(new SphereGeometry(radius, 20, 14));
const marbleSpec: Spec = {
  colliders: [],
  visuals: [
    {
      id: "marble",
      shape: {
        kind: "trimesh",
        vertices: marbleGeometry.vertices,
        indices: marbleGeometry.indices,
      },
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      material: { color: "#ffffff", metalness: 0.2, roughness: 0.22 },
    },
  ],
  footprint: {
    cells: [],
    entry: { position: [0, 0, 0], tangent: [0, 0, 1], up: [0, 1, 0] },
    exit: { position: [0, 0, radius], tangent: [0, 0, 1], up: [0, 1, 0] },
    route: [
      [0, 0, 0],
      [0, 0, radius],
    ],
    bounds: { min: [-radius, -radius, -radius], max: [radius, radius, radius] },
  },
};
// Preserve the actual live sphere topology, UVs and every Roster stripe texture.
await capture("marble", marbleSpec);
const styles = createMarbleStyles(15).map((style) => {
  const texture = marbleStripeTexture(style);
  if (texture.image.data === null) throw new Error("Marble stripe texture has no pixels");
  return {
    ...style,
    width: texture.image.width,
    height: texture.image.height,
    pixels: Array.from(texture.image.data),
    geometry: marbleGeometry,
  };
});
await writeFile("assets/baseline/marble-styles.json", JSON.stringify(styles) + "\n", {
  flag: "wx",
});
await writeFile(
  "src/config/module-settings.json",
  JSON.stringify(
    Object.fromEntries(COURSE_MODULES.map((m) => [m.id, courseParamValues(m)])),
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
await writeFile(
  "assets/baseline/README.md",
  `# Captured Course geometry\n\nCaptured from commit ${execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()} with pnpm assets:capture.\n\nInputs: courseParamValues, registered buildSpec generators, buildStartSpec, buildFinishSpec, raceVisibleSpec, live sphere topology and marbleStripeTexture. Coordinates are game-local meters, Y up; quaternions use XYZW.\n\nCapture refuses existing files. These references document the migration baseline. Saved Blender sources become authoritative after bootstrap; normal export never runs capture or bootstrap.\n`,
  { flag: "wx" },
);
