import { buildChannel, type ChannelSegment } from "../modules/geometry/channel";
import type { Spec } from "../modules/types";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";
import type { RoleMetricRun } from "./roleMetrics";

export type ModuleControlKind =
  | "accel"
  | "wide-entry-scatter"
  | "constrained-entry-scatter"
  | "shuffle"
  | "sort";

export interface ModuleControl {
  readonly kind: ModuleControlKind;
  readonly spec: Spec;
}

export interface PairedRoleMetricRun {
  readonly seed: number;
  readonly marbleIndex: number;
  readonly module: RoleMetricRun;
  readonly control: RoleMetricRun;
}

const CONTROL_MATERIAL = Object.freeze({
  restitution: SCALE.defaultRestitution,
  friction: SCALE.defaultFriction,
});

function addScaled(base: Vector3, direction: Vector3, amount: number): Vector3 {
  return [
    base[0] + direction[0] * amount,
    base[1] + direction[1] * amount,
    base[2] + direction[2] * amount,
  ];
}

function controlSegments(target: Spec, width: number): readonly ChannelSegment[] {
  if (!Number.isFinite(width) || width < SCALE.marbleRadius * 2) {
    throw new RangeError("Control width must fit at least one marble diameter");
  }
  const { entry, exit } = target.footprint;
  const directDistance = Math.hypot(
    exit.position[0] - entry.position[0],
    exit.position[1] - entry.position[1],
    exit.position[2] - entry.position[2],
  );
  if (directDistance === 0) throw new Error("Control target needs distinct anchors");
  const handleLength = directDistance / 4;
  const route: readonly Vector3[] = [
    entry.position,
    addScaled(entry.position, entry.tangent, handleLength),
    addScaled(exit.position, exit.tangent, -handleLength),
    exit.position,
  ];
  const segments = route.slice(1).map((end, index) => ({
    start: route[index],
    end,
    width,
    up: entry.up,
  }));
  return segments;
}

function buildControl(kind: ModuleControlKind, target: Spec, width: number): ModuleControl {
  const channel = buildChannel(
    controlSegments(target, width),
    CONTROL_MATERIAL,
    `${kind}-control`,
    { openContactSurfaces: true },
  );
  return Object.freeze({
    kind,
    spec: Object.freeze({
      colliders: channel.colliders,
      visuals: channel.visuals,
      footprint: Object.freeze({
        cells: [],
        entry: target.footprint.entry,
        exit: target.footprint.exit,
        route: channel.route,
        bounds: channel.bounds,
      }),
    }),
  });
}

export function buildAccelControl(target: Spec, entryConstraintWidth: number): ModuleControl {
  return buildControl("accel", target, entryConstraintWidth);
}

export function buildWideEntryScatterControl(
  target: Spec,
  entryConstraintWidth: number,
): ModuleControl {
  return buildControl("wide-entry-scatter", target, entryConstraintWidth);
}

export function buildConstrainedEntryScatterControl(
  target: Spec,
  entryConstraintWidth: number,
): ModuleControl {
  return buildControl("constrained-entry-scatter", target, entryConstraintWidth);
}

export function buildShuffleControl(target: Spec, entryConstraintWidth: number): ModuleControl {
  return buildControl("shuffle", target, entryConstraintWidth);
}

export function buildSortControl(target: Spec, entryConstraintWidth: number): ModuleControl {
  return buildControl("sort", target, entryConstraintWidth);
}

/** Pairs module/control evidence by the recorded nominal input identity. A
 * missing or duplicate seed+marble key invalidates the comparison rather
 * than silently comparing different cohorts. */
export function pairSameSeedRuns(
  moduleRuns: readonly RoleMetricRun[],
  controlRuns: readonly RoleMetricRun[],
): readonly PairedRoleMetricRun[] {
  const key = ({ seed, marbleIndex }: RoleMetricRun) => `${seed}:${marbleIndex}`;
  const controlByKey = new Map<string, RoleMetricRun>();
  for (const control of controlRuns) {
    const controlKey = key(control);
    if (controlByKey.has(controlKey)) throw new Error(`Duplicate control run ${controlKey}`);
    controlByKey.set(controlKey, control);
  }

  const moduleKeys = new Set<string>();
  const pairs = moduleRuns.map((module) => {
    const moduleKey = key(module);
    if (moduleKeys.has(moduleKey)) throw new Error(`Duplicate module run ${moduleKey}`);
    moduleKeys.add(moduleKey);
    const control = controlByKey.get(moduleKey);
    if (!control) throw new Error(`Missing paired control run ${moduleKey}`);
    return Object.freeze({
      seed: module.seed,
      marbleIndex: module.marbleIndex,
      module,
      control,
    });
  });

  if (pairs.length !== controlRuns.length) throw new Error("Control cohort has unpaired runs");
  return Object.freeze(pairs);
}
