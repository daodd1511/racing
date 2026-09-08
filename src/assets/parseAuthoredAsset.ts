import { ASSET_IDS, type AuthoredAsset } from "./types";
import { PHYSICS_PROFILES } from "./physicsProfiles";

function fail(path: string): never {
  throw new Error(`Invalid authored asset: ${path}`);
}
function keys(v: Record<string, unknown>, allowed: readonly string[], path: string) {
  for (const key of Reflect.ownKeys(v)) {
    if (typeof key !== "string" || !allowed.includes(key))
      fail(`${path}: unknown key ${String(key)}`);
  }
}
function object(v: unknown, path: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) fail(path);
  if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
    fail(path);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(v))) {
    if (!("value" in descriptor) || !descriptor.enumerable) fail(path);
  }
  return v as Record<string, unknown>;
}
function number(v: unknown, path: string): asserts v is number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(path);
}
function positive(v: unknown, path: string) {
  number(v, path);
  if (v <= 0) fail(path);
}
function array(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path);
  if (
    Reflect.ownKeys(v).length !== v.length + 1 ||
    Object.keys(v).some((key, i) => key !== String(i))
  )
    fail(path);
  return v;
}
function vector(v: unknown, n: number, path: string) {
  const values = array(v, path);
  if (values.length !== n) fail(path);
  values.forEach((value) => number(value, path));
  return values as number[];
}
function unit(v: unknown, n: number, path: string) {
  const values = vector(v, n, path);
  if (Math.abs(Math.hypot(...values) - 1) > 1e-5) fail(path);
}
function id(v: unknown, path: string): string {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]+$/.test(v)) fail(path);
  return v;
}
function frame(v: Record<string, unknown>, path: string) {
  vector(v.position, 3, `${path}.position`);
  unit(v.rotation, 4, `${path}.rotation`);
}
function shape(v: unknown, path: string) {
  const s = object(v, path);
  switch (s.kind) {
    case "cuboid":
      keys(s, ["kind", "halfExtents"], path);
      vector(s.halfExtents, 3, path).forEach((n) => positive(n, path));
      break;
    case "cylinder":
      keys(s, ["kind", "radius", "halfHeight"], path);
      positive(s.radius, path);
      positive(s.halfHeight, path);
      break;
    case "ball":
      keys(s, ["kind", "radius"], path);
      positive(s.radius, path);
      break;
    case "trimesh": {
      keys(s, ["kind", "vertices", "indices"], path);
      const vertices = array(s.vertices, path);
      const indices = array(s.indices, path);
      if (vertices.length < 9 || vertices.length % 3 || !indices.length || indices.length % 3)
        fail(path);
      vertices.forEach((n) => number(n, path));
      indices.forEach((n) => {
        number(n, path);
        if (!Number.isSafeInteger(n) || n < 0 || n >= vertices.length / 3) fail(path);
      });
      break;
    }
    default:
      fail(`${path}.kind`);
  }
}

// Existing schema ranges, extended only for effective captured Course defaults.
const postSpacingMin = 0.032 * 1.1 * Math.SQRT2 + (1.2 / 0.7) * 0.032;
const parameterLimits: Record<string, Record<string, readonly [number, number]>> = {
  chute: { length: [0.2, 1.5], grade: [0.05, 0.6], width: [0.2, 0.8] },
  "pin-field": {
    rowCount: [3, 10],
    postSpacing: [postSpacingMin, postSpacingMin * 2.5],
    postHeight: [0.032 * 0.8, 0.064],
    postWidth: [0.016, 0.032 * 1.1],
    rowPitch: [postSpacingMin, postSpacingMin * 2.5],
    courseGrade: [0.12, 0.12],
  },
  staircase: {
    stepCount: [3, 10],
    tread: [0.08, 0.2],
    riseHeight: [0.016 * 1.2, 0.048],
    width: [0.5, 0.5],
  },
  whoops: {
    amplitude: [0.006, 0.016],
    wavelength: [0.28, 0.5],
    length: [0.6, 2.4],
    grade: [0.12, 0.7],
    width: [0.5, 0.5],
  },
};

function validateBinding(moduleId: unknown, binding: Record<string, unknown>, baseline: unknown) {
  const name = String(binding.partId);
  let expected: string;
  let repeatIndex: number | undefined;
  if (moduleId === "chute") expected = "channel";
  else if (moduleId === "pin-field") {
    const post = /^post-(\d+)-\d+$/.exec(name);
    const bumper = /^rail-bumper-(\d+)$/.exec(name);
    expected = post ? "post" : bumper ? "bumper" : "channel";
    if (post || bumper) repeatIndex = Number((post || bumper)![1]);
  } else if (moduleId === "staircase") {
    const step = /^(?:tread-(?:floor|rail-left|rail-right)|riser)-(\d+)$/.exec(name);
    if (!step) fail("unsupported step binding");
    expected = "step";
    repeatIndex = Number(step[1]);
  } else if (moduleId === "whoops") expected = name.includes("entrance") ? "end" : "wave";
  else fail("infrastructure controls");
  if (binding.region !== expected || binding.repeatIndex !== repeatIndex)
    fail("Module-specific control binding");
  if (repeatIndex !== undefined) {
    const values = object(object(baseline, "baseline").values, "baseline.values");
    const count = values[moduleId === "staircase" ? "stepCount" : "rowCount"];
    number(count, "repeat count");
    if (repeatIndex >= count) fail("control repeatIndex outside baseline count");
  }
}

export function parseAuthoredAsset(value: unknown): AuthoredAsset {
  const root = object(value, "root");
  keys(
    root,
    [
      "schemaVersion",
      "id",
      "footprint",
      "recoveryBoxes",
      "colliders",
      "visuals",
      "markers",
      "controls",
      "baseline",
    ],
    "root",
  );
  if (root.schemaVersion !== 1 || !ASSET_IDS.some((id) => id === root.id)) fail("version/id");
  const footprint = object(root.footprint, "footprint");
  keys(footprint, ["entry", "exit", "route", "bounds", "cells"], "footprint");
  for (const name of ["entry", "exit"]) {
    const anchor = object(footprint[name], name);
    keys(anchor, ["position", "tangent", "up"], name);
    vector(anchor.position, 3, name);
    unit(anchor.tangent, 3, name);
    unit(anchor.up, 3, name);
    const tangent = anchor.tangent as number[];
    const up = anchor.up as number[];
    if (Math.abs(tangent.reduce((sum, n, i) => sum + n * up[i], 0)) > 1e-5) fail(name);
  }
  const route = array(footprint.route, "route");
  if (route.length < 2) fail("route");
  route.forEach((v) => vector(v, 3, "route"));
  const bounds = object(footprint.bounds, "bounds");
  keys(bounds, ["min", "max"], "bounds");
  const min = vector(bounds.min, 3, "bounds.min");
  const max = vector(bounds.max, 3, "bounds.max");
  if (min.some((n, i) => n > max[i])) fail("bounds");
  array(footprint.cells, "cells").forEach((v) => {
    const cell = object(v, "cell");
    keys(cell, ["column", "row"], "cell");
    for (const key of ["column", "row"]) if (!Number.isSafeInteger(cell[key])) fail("cell");
  });
  if (root.recoveryBoxes !== undefined)
    array(root.recoveryBoxes, "recoveryBoxes").forEach((v) => {
      const box = object(v, "recoveryBox");
      keys(box, ["position", "rotation", "halfExtents"], "recoveryBox");
      frame(box, "recoveryBox");
      vector(box.halfExtents, 3, "recoveryBox.halfExtents").forEach((n) =>
        positive(n, "recoveryBox.halfExtents"),
      );
    });
  const parts = new Map<string, Set<string>>();
  for (const kind of ["collider", "visual"] as const) {
    const ids = new Set<string>();
    parts.set(kind, ids);
    array(root[`${kind}s`], kind).forEach((v) => {
      const part = object(v, kind);
      keys(
        part,
        kind === "collider"
          ? [
              "id",
              "shape",
              "position",
              "rotation",
              "physicalProfile",
              "sensor",
              "kinematic",
              "motion",
            ]
          : ["id", "shape", "position", "rotation", "material", "node"],
        kind,
      );
      const name = id(part.id, `${kind}.id`);
      if (ids.has(name)) fail(`duplicate ${kind} ${name}`);
      ids.add(name);
      frame(part, name);
      shape(part.shape, name);
      if (kind === "collider") {
        if (
          typeof part.physicalProfile !== "string" ||
          !Object.hasOwn(PHYSICS_PROFILES, part.physicalProfile)
        )
          fail(`${name}.physicalProfile`);
        for (const key of ["sensor", "kinematic"])
          if (part[key] !== undefined && typeof part[key] !== "boolean") fail(`${name}.${key}`);
        if (part.motion !== undefined) {
          const motion = object(part.motion, "motion");
          keys(motion, ["kind", "axis", "pivot", "angularVelocity"], "motion");
          if (motion.kind !== "rotation" || part.kinematic !== true) fail("motion");
          unit(motion.axis, 3, "motion.axis");
          vector(motion.pivot, 3, "motion.pivot");
          number(motion.angularVelocity, "motion.angularVelocity");
        }
      } else {
        if (part.node !== name) fail(`${name}.node`);
        const material = object(part.material, "material");
        keys(material, ["color", "metalness", "roughness"], "material");
        if (typeof material.color !== "string" || !/^#[0-9a-f]{6}$/i.test(material.color))
          fail("material.color");
        for (const key of ["metalness", "roughness"]) {
          const n = material[key];
          number(n, key);
          if (n < 0 || n > 1) fail(key);
        }
      }
    });
  }
  const markers = object(root.markers, "markers");
  keys(markers, ["gatePivot", "finishSensor"], "markers");
  if (markers.gatePivot !== undefined) vector(markers.gatePivot, 3, "gatePivot");
  if (
    markers.finishSensor !== undefined &&
    !parts.get("collider")!.has(id(markers.finishSensor, "finishSensor"))
  )
    fail("finishSensor");
  if (root.id === "start" && markers.gatePivot === undefined) fail("gatePivot missing");
  if (root.id === "finish" && markers.finishSensor === undefined) fail("finishSensor missing");
  const bound = new Set<string>();
  array(root.controls, "controls").forEach((v) => {
    const binding = object(v, "control");
    keys(binding, ["target", "partId", "region", "repeatIndex"], "control");
    if (
      typeof binding.target !== "string" ||
      !parts.get(binding.target)?.has(id(binding.partId, "control.partId"))
    )
      fail("control target");
    if (!["channel", "post", "bumper", "step", "wave", "end"].includes(String(binding.region)))
      fail("control region");
    if (
      binding.repeatIndex !== undefined &&
      (!Number.isSafeInteger(binding.repeatIndex) || Number(binding.repeatIndex) < 0)
    )
      fail("control repeatIndex");
    validateBinding(root.id, binding, root.baseline);
    const key = `${binding.target}:${binding.partId}`;
    if (bound.has(key)) fail("duplicate control");
    bound.add(key);
  });
  const parameterKeys: Record<string, readonly string[]> = {
    chute: ["length", "grade", "width"],
    "pin-field": ["rowCount", "postSpacing", "postHeight", "postWidth", "rowPitch", "courseGrade"],
    staircase: ["stepCount", "tread", "riseHeight", "width"],
    whoops: ["amplitude", "wavelength", "length", "grade", "width"],
  };
  const required = parameterKeys[String(root.id)];
  if (required) {
    const baseline = object(root.baseline, "baseline");
    keys(baseline, ["moduleId", "values"], "baseline");
    if (baseline.moduleId !== root.id) fail("baseline.moduleId");
    const values = object(baseline.values, "baseline.values");
    keys(values, required, "baseline.values");
    if (Object.keys(values).length !== required.length) fail("baseline keys");
    required.forEach((key) => {
      number(values[key], key);
      const [min, max] = parameterLimits[String(root.id)][key];
      if (Number(values[key]) < min || Number(values[key]) > max)
        fail(`baseline.values.${key} range`);
    });
    for (const key of ["rowCount", "stepCount"])
      if (
        values[key] !== undefined &&
        (!Number.isSafeInteger(values[key]) || Number(values[key]) < 1)
      )
        fail(key);
    for (const [kind, ids] of parts)
      for (const name of ids)
        if (!bound.has(`${kind}:${name}`)) fail(`missing control ${kind}:${name}`);
  } else if (root.baseline !== null || bound.size !== 0) fail("infrastructure controls");
  return structuredClone(value) as AuthoredAsset;
}
