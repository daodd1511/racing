import RAPIER from "@dimforge/rapier3d-compat";

import { buildFeederApronSpec } from "../modules/feederApron";
import {
  INITIAL_KINEMATIC_CLOCK,
  KINEMATIC_FIXED_STEP_SECONDS,
  advanceKinematicClock,
  kinematicSeconds,
  kinematicTransformsAt,
  type KinematicStep,
} from "../modules/kinematics";
import type { ParamValues } from "../modules/params";
import type { ModuleDefinition, ParamField, ParamSchema, Spec } from "../modules/types";
import { createSeededRandom } from "../race/random";
import { SCALE } from "../race/scale";
import type { Vector3 } from "../race/types";
import { applyStep } from "./applyStep";
import { buildWorld } from "./buildWorld";
import {
  buildFeedCohort,
  type FeedCohort,
  type FeedProfile,
  type FeedRelease,
} from "./feedProfiles";
import {
  MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND,
  displacementPerSecond,
  measureDwell,
  observeModuleRun,
  percentile,
  shuffleCoefficient,
  type FrameSample,
  type MarbleRun,
  type ModuleRunObservation,
} from "./metrics";
import {
  buildAccelControl,
  buildConstrainedEntryScatterControl,
  buildShuffleControl,
  buildSortControl,
  buildWideEntryScatterControl,
  pairSameSeedRuns,
  type ModuleControl,
} from "./moduleControls";
import {
  accelEvidence,
  constrainedEntryScatterEvidence,
  dwellEvidence,
  shuffleEvidence,
  sortEvidence,
  wideEntryScatterEvidence,
  type DwellEvidence,
  type RoleEvidence,
  type RoleMetricRun,
} from "./roleMetrics";
import { ROLE_THRESHOLDS } from "./roleThresholds";

const DISPLACEMENT_WARMUP_FRAMES = 6;
const VISIBLE_MOTION_WINDOW_FRAMES = 60;
const STATIC_STEP: KinematicStep = () => [];
const LEGACY_ENTRY_MARGIN_RADII = 3;
const LEGACY_ENTRY_LIFT_RADII = 2;

export type ValidationMatrix = "pr" | "full";
export type ScatterMeasurementMode = "wide-entry" | "constrained-entry";

const PR_SEEDS: Readonly<Record<FeedProfile, readonly number[]>> = Object.freeze({
  burst15: Object.freeze([0, 1]),
  continuous: Object.freeze([0, 1]),
  single: Object.freeze([0, 1, 2]),
});
const FULL_SEEDS: Readonly<Record<FeedProfile, readonly number[]>> = Object.freeze({
  burst15: Object.freeze(Array.from({ length: 20 }, (_, seed) => seed)),
  continuous: Object.freeze(Array.from({ length: 10 }, (_, seed) => seed)),
  single: Object.freeze(Array.from({ length: 60 }, (_, seed) => seed)),
});

export interface ValidateModuleOptions {
  readonly matrix?: ValidationMatrix;
  readonly profiles?: readonly FeedProfile[];
  readonly seedsByProfile?: Readonly<Partial<Record<FeedProfile, readonly number[]>>>;
  readonly minimumCompletedRuns?: number;
  readonly scatterMode?: ScatterMeasurementMode;
  readonly entryConstraintWidth?: number;
  /** Compatibility inputs for existing pre-calibration Module tests. */
  readonly seedCount?: number;
  readonly marbleCount?: number;
  readonly maxSimulationSeconds?: number;
}

export interface ValidatedRun {
  readonly seed: number;
  readonly marbleIndex: number;
  readonly observation: ModuleRunObservation;
  readonly minimumDisplacementPerSecond: number;
  readonly stalled: boolean;
  readonly timedOut: boolean;
  /** Physical displacement while a declared Burst gate held the body. */
  readonly gateHoldDisplacementMeters: number | null;
}

export interface FeedProfileValidation {
  readonly profile: FeedProfile;
  readonly seeds: readonly number[];
  readonly totalMarbles: number;
  readonly completedMarbles: number;
  readonly stalledMarbles: number;
  readonly timedOutMarbles: number;
  readonly controlStalledMarbles: number;
  readonly controlTimedOutMarbles: number;
  readonly dwell: DwellEvidence;
  readonly controlDwell: DwellEvidence;
  readonly evidence: RoleEvidence | null;
  readonly controlEvidence: RoleEvidence | null;
  readonly runs: readonly ValidatedRun[];
  readonly roleRuns: readonly RoleMetricRun[];
  readonly controlRoleRuns: readonly RoleMetricRun[];
}

export interface ModuleValidationReport {
  readonly moduleId: string;
  readonly role: ModuleDefinition<unknown>["role"];
  readonly matrix: ValidationMatrix | "compatibility";
  readonly rapierVersion: string;
  readonly profiles: readonly FeedProfileValidation[];
  readonly totalMarbles: number;
  readonly completedMarbles: number;
  readonly stalledMarbles: number;
  readonly timedOutMarbles: number;
  readonly dwellSecondsP50: number | null;
  readonly dwellSecondsP95: number | null;
  /** Compatibility alias removed when Phase 2 migrates old guardrails. */
  readonly dwellSecondsP99: number | null;
  readonly maximumDwellSeconds: number | null;
  readonly exitSpeeds: readonly number[];
  readonly minDisplacementPerSecond: number;
  readonly shuffleCoefficients: readonly number[];
  readonly seeds: number;
}

/** Compatibility name for existing Module guardrails until Phase 2 rewrites them. */
export type ValidationReport = ModuleValidationReport;

interface SimulatedCohort {
  readonly runs: readonly ValidatedRun[];
  readonly roleRuns: readonly RoleMetricRun[];
}

function minimumWindowAverage(values: readonly number[], windowSize: number): number {
  if (values.length === 0) return 0;
  const size = Math.min(values.length, windowSize);
  let sum = values.slice(0, size).reduce((total, value) => total + value, 0);
  let minimum = sum / size;
  for (let index = size; index < values.length; index += 1) {
    sum += values[index] - values[index - size];
    minimum = Math.min(minimum, sum / size);
  }
  return minimum;
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(vector: Vector3): Vector3 {
  const magnitude = Math.hypot(...vector);
  return magnitude === 0
    ? vector
    : [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
}

function lateralCoordinate(origin: Vector3, lateral: Vector3, position: Vector3): number {
  return (
    (position[0] - origin[0]) * lateral[0] +
    (position[1] - origin[1]) * lateral[1] +
    (position[2] - origin[2]) * lateral[2]
  );
}

function createMarble(world: RAPIER.World, release: FeedRelease): RAPIER.RigidBody {
  const descriptor = release.heldByGate
    ? RAPIER.RigidBodyDesc.kinematicPositionBased()
    : RAPIER.RigidBodyDesc.dynamic();
  const body = world.createRigidBody(
    descriptor
      .setTranslation(...release.position)
      .setLinvel(...release.initialVelocity)
      .setLinearDamping(SCALE.linearDamping)
      .setAngularDamping(SCALE.angularDamping)
      .setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(SCALE.marbleRadius)
      .setRestitution(SCALE.defaultRestitution)
      .setFriction(SCALE.defaultFriction)
      .setDensity(2.4),
    body,
  );
  return body;
}

function addScaled(base: Vector3, direction: Vector3, amount: number): Vector3 {
  return [
    base[0] + direction[0] * amount,
    base[1] + direction[1] * amount,
    base[2] + direction[2] * amount,
  ];
}

function legacySpawnMarbles(
  world: RAPIER.World,
  spec: Spec,
  marbleCount: number,
  seed: number,
): RAPIER.RigidBody[] {
  const random = createSeededRandom(seed);
  const { entry } = spec.footprint;
  const basePosition = addScaled(
    addScaled(entry.position, entry.tangent, SCALE.marbleRadius * LEGACY_ENTRY_MARGIN_RADII),
    entry.up,
    SCALE.marbleRadius * LEGACY_ENTRY_LIFT_RADII,
  );
  const lateral = normalize(cross(entry.tangent, entry.up));
  const spreadWidth = Math.max(0, SCALE.channelWidth - SCALE.marbleRadius * 4);

  return Array.from({ length: marbleCount }, (_, index) => {
    const spawnPosition = addScaled(
      addScaled(basePosition, lateral, (random() - 0.5) * spreadWidth),
      entry.up,
      index * SCALE.marbleRadius * 2.5,
    );
    return createMarble(world, {
      marbleIndex: index,
      position: spawnPosition,
      initialVelocity: [0, 0, 0],
      releaseStep: 0,
      heldByGate: false,
    });
  });
}

async function validateCompatibilityModule<P>(
  module: ModuleDefinition<P>,
  params: P,
  options: ValidateModuleOptions,
): Promise<ModuleValidationReport> {
  const seedCount = options.seedCount ?? 1;
  const marbleCount = options.marbleCount ?? 1;
  const maximumSeconds = options.maxSimulationSeconds ?? 15;
  const spec = module.buildSpec(params);
  const maximumSteps = Math.ceil(maximumSeconds / KINEMATIC_FIXED_STEP_SECONDS);
  const dwellSeconds: number[] = [];
  const exitSpeeds: number[] = [];
  const shuffleCoefficients: number[] = [];
  let stalledMarbles = 0;
  let minimumDisplacement = Number.POSITIVE_INFINITY;
  let anyExited = false;

  for (let seed = 0; seed < seedCount; seed += 1) {
    const built = buildWorld([spec]);
    const bodies = legacySpawnMarbles(built.world, spec, marbleCount, seed);
    const runs: MarbleRun[] = bodies.map(() => ({ frames: [] }));
    let clock = INITIAL_KINEMATIC_CLOCK;
    try {
      for (let stepIndex = 0; stepIndex < maximumSteps; stepIndex += 1) {
        clock = advanceKinematicClock(clock);
        const tSeconds = kinematicSeconds(clock);
        applyStep(kinematicTransformsAt(module.step, spec, tSeconds), built.kinematicBodies);
        built.world.step();
        bodies.forEach((body, index) => {
          const translation = body.translation();
          (runs[index].frames as FrameSample[]).push({
            tSeconds,
            position: [translation.x, translation.y, translation.z],
          });
        });
      }
    } finally {
      built.world.free();
    }
    const results = runs.map((run) => measureDwell(run, spec.footprint.exit));
    results.forEach((result) => {
      if (!result.exited || result.dwellSeconds === null) {
        stalledMarbles += 1;
        return;
      }
      anyExited = true;
      dwellSeconds.push(result.dwellSeconds);
      if (result.exitSpeed !== null) exitSpeeds.push(result.exitSpeed);
    });
    shuffleCoefficients.push(shuffleCoefficient(results.map(({ dwellSeconds }) => dwellSeconds)));
    runs.forEach((run) => {
      const motion = displacementPerSecond(run).slice(DISPLACEMENT_WARMUP_FRAMES);
      minimumDisplacement = Math.min(
        minimumDisplacement,
        minimumWindowAverage(motion, VISIBLE_MOTION_WINDOW_FRAMES),
      );
    });
  }

  dwellSeconds.sort((left, right) => left - right);
  const totalMarbles = seedCount * marbleCount;
  return Object.freeze({
    moduleId: module.id,
    role: module.role,
    matrix: "compatibility",
    rapierVersion: RAPIER.version(),
    profiles: Object.freeze([]),
    totalMarbles,
    completedMarbles: totalMarbles - stalledMarbles,
    stalledMarbles,
    timedOutMarbles: stalledMarbles,
    dwellSecondsP50: percentile(dwellSeconds, 0.5),
    dwellSecondsP95: percentile(dwellSeconds, 0.95),
    dwellSecondsP99: percentile(dwellSeconds, 0.99),
    maximumDwellSeconds: dwellSeconds.at(-1) ?? null,
    exitSpeeds: Object.freeze(exitSpeeds),
    minDisplacementPerSecond: anyExited ? minimumDisplacement : 0,
    shuffleCoefficients: Object.freeze(shuffleCoefficients),
    seeds: seedCount,
  });
}

async function simulateCohort(
  spec: Spec,
  stepModule: KinematicStep,
  cohort: FeedCohort,
  maxSimulationSeconds?: number,
): Promise<SimulatedCohort> {
  await RAPIER.init();
  const feederApron = buildFeederApronSpec(spec.footprint.entry, {
    width: cohort.entryConstraintWidth,
    length: cohort.feederApronLength,
  });
  const built = buildWorld([feederApron, spec]);
  const bodies = new Map<number, RAPIER.RigidBody>();
  const runs = new Map<number, MarbleRun>();
  const releaseByStep = new Map<number, FeedRelease[]>();
  const dynamicReleaseByStep = new Map<number, FeedRelease[]>();
  cohort.releases.forEach((release) => {
    const releases = releaseByStep.get(release.releaseStep) ?? [];
    releases.push(release);
    releaseByStep.set(release.releaseStep, releases);
    if (release.heldByGate) {
      const dynamicStep = release.releaseStep + 1;
      const dynamicReleases = dynamicReleaseByStep.get(dynamicStep) ?? [];
      dynamicReleases.push(release);
      dynamicReleaseByStep.set(dynamicStep, dynamicReleases);
    }
  });
  const finalReleaseStep = Math.max(
    ...cohort.releases.map(({ releaseStep, heldByGate }) => releaseStep + (heldByGate ? 1 : 0)),
  );
  const timeoutSeconds = maxSimulationSeconds ?? cohort.stallTimeoutSeconds;
  const maximumSteps = finalReleaseStep + Math.ceil(timeoutSeconds / KINEMATIC_FIXED_STEP_SECONDS);
  let clock = INITIAL_KINEMATIC_CLOCK;

  try {
    for (let stepIndex = 0; stepIndex < maximumSteps; stepIndex += 1) {
      for (const release of releaseByStep.get(stepIndex) ?? []) {
        bodies.set(release.marbleIndex, createMarble(built.world, release));
        runs.set(release.marbleIndex, {
          frames: [
            { tSeconds: stepIndex * KINEMATIC_FIXED_STEP_SECONDS, position: release.position },
          ],
        });
      }
      for (const release of dynamicReleaseByStep.get(stepIndex) ?? []) {
        const body = bodies.get(release.marbleIndex)!;
        body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        body.setLinvel(
          {
            x: release.initialVelocity[0],
            y: release.initialVelocity[1],
            z: release.initialVelocity[2],
          },
          true,
        );
      }
      clock = advanceKinematicClock(clock);
      const tSeconds = kinematicSeconds(clock);
      applyStep(kinematicTransformsAt(stepModule, spec, tSeconds), built.kinematicBodies);
      built.world.step();
      for (const [marbleIndex, body] of bodies) {
        const translation = body.translation();
        (runs.get(marbleIndex)!.frames as FrameSample[]).push({
          tSeconds,
          position: [translation.x, translation.y, translation.z],
        });
      }
    }

    const lateral = normalize(cross(spec.footprint.entry.up, spec.footprint.entry.tangent));
    const validatedRuns = cohort.releases.map((release): ValidatedRun => {
      const run = runs.get(release.marbleIndex)!;
      const dynamicReleaseStep = release.releaseStep + (release.heldByGate ? 1 : 0);
      const deadlineSeconds = dynamicReleaseStep * KINEMATIC_FIXED_STEP_SECONDS + timeoutSeconds;
      const deadlineRun: MarbleRun = {
        frames: run.frames.filter(({ tSeconds }) => tSeconds <= deadlineSeconds),
      };
      const observation = observeModuleRun(deadlineRun, spec.footprint.entry, spec.footprint.exit);
      const motion = displacementPerSecond(deadlineRun).slice(DISPLACEMENT_WARMUP_FRAMES);
      const minimumDisplacement = minimumWindowAverage(motion, VISIBLE_MOTION_WINDOW_FRAMES);
      const timedOut = !observation.completed;
      const stalled = minimumDisplacement < MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND;
      const heldFrames = release.heldByGate ? deadlineRun.frames.slice(0, 2) : [];
      const gateHoldDisplacementMeters =
        heldFrames.length < 2
          ? null
          : Math.hypot(
              heldFrames[1].position[0] - heldFrames[0].position[0],
              heldFrames[1].position[1] - heldFrames[0].position[1],
              heldFrames[1].position[2] - heldFrames[0].position[2],
            );
      return Object.freeze({
        seed: cohort.seed,
        marbleIndex: release.marbleIndex,
        observation,
        minimumDisplacementPerSecond: minimumDisplacement,
        stalled,
        timedOut,
        gateHoldDisplacementMeters,
      });
    });
    const roleRuns = validatedRuns.flatMap(({ seed, marbleIndex, observation }) => {
      if (!observation.entry || !observation.exit) return [];
      return [
        Object.freeze({
          seed,
          marbleIndex,
          entryTimeSeconds: observation.entry.timeSeconds,
          exitTimeSeconds: observation.exit.timeSeconds,
          entryLateral: lateralCoordinate(
            spec.footprint.entry.position,
            lateral,
            observation.entry.position,
          ),
          exitLateral: lateralCoordinate(
            spec.footprint.exit.position,
            lateral,
            observation.exit.position,
          ),
          exitSpeed: observation.exit.speed,
        }),
      ];
    });
    return { runs: Object.freeze(validatedRuns), roleRuns: Object.freeze(roleRuns) };
  } finally {
    built.world.free();
  }
}

function controlFor<P>(
  module: ModuleDefinition<P>,
  spec: Spec,
  width: number,
  scatterMode: ScatterMeasurementMode,
): ModuleControl {
  switch (module.role) {
    case "accel":
      return buildAccelControl(spec, width);
    case "scatter":
      return scatterMode === "wide-entry"
        ? buildWideEntryScatterControl(spec, width)
        : buildConstrainedEntryScatterControl(spec, width);
    case "shuffle":
      return buildShuffleControl(spec, width);
    case "sort":
      return buildSortControl(spec, width);
  }
}

function evidenceFor(
  role: ModuleDefinition<unknown>["role"],
  scatterMode: ScatterMeasurementMode,
  moduleRuns: readonly RoleMetricRun[],
  controlRuns: readonly RoleMetricRun[],
  width: number,
): { readonly evidence: RoleEvidence | null; readonly controlEvidence: RoleEvidence | null } {
  if (moduleRuns.length === 0) return { evidence: null, controlEvidence: null };
  const laneBoundaries = [-width / 6, width / 6];
  switch (role) {
    case "accel":
      return { evidence: accelEvidence(moduleRuns, controlRuns), controlEvidence: null };
    case "scatter":
      return {
        evidence:
          scatterMode === "wide-entry"
            ? wideEntryScatterEvidence(moduleRuns, controlRuns, laneBoundaries)
            : constrainedEntryScatterEvidence(moduleRuns, controlRuns, laneBoundaries),
        controlEvidence: null,
      };
    case "shuffle":
      return {
        evidence: shuffleEvidence(moduleRuns),
        controlEvidence: controlRuns.length === 0 ? null : shuffleEvidence(controlRuns),
      };
    case "sort":
      return { evidence: sortEvidence(moduleRuns, controlRuns), controlEvidence: null };
  }
}

function defaultMinimumCompletedRuns(profile: FeedProfile, totalRuns: number): number {
  const calibrationMinimum =
    profile === "burst15"
      ? ROLE_THRESHOLDS.cohortValidity.burst15MinimumCompletedRuns
      : profile === "continuous"
        ? ROLE_THRESHOLDS.cohortValidity.continuousMinimumCompletedRuns
        : ROLE_THRESHOLDS.cohortValidity.singleMinimumCompletedRuns;
  const calibrationTotal = profile === "single" ? 60 : 300;
  return Math.ceil((totalRuns * calibrationMinimum) / calibrationTotal);
}

function pairedEvidenceRuns(
  moduleRuns: readonly RoleMetricRun[],
  controlRuns: readonly RoleMetricRun[],
): {
  readonly moduleRuns: readonly RoleMetricRun[];
  readonly controlRuns: readonly RoleMetricRun[];
} | null {
  if (moduleRuns.length !== controlRuns.length) return null;
  const controlKeys = new Set(controlRuns.map(({ seed, marbleIndex }) => `${seed}:${marbleIndex}`));
  if (moduleRuns.some(({ seed, marbleIndex }) => !controlKeys.has(`${seed}:${marbleIndex}`))) {
    return null;
  }
  const pairs = pairSameSeedRuns(moduleRuns, controlRuns);
  return Object.freeze({
    moduleRuns: Object.freeze(pairs.map(({ module }) => module)),
    controlRuns: Object.freeze(pairs.map(({ control }) => control)),
  });
}

export function validationSeedsFor(
  matrix: ValidationMatrix,
  profile: FeedProfile,
): readonly number[] {
  return matrix === "full" ? FULL_SEEDS[profile] : PR_SEEDS[profile];
}

function valuesForField(field: ParamField): readonly (number | boolean)[] {
  if (field.kind === "boolean") return [false, true];
  const stepCount = Math.round((field.max - field.min) / field.step);
  return Object.freeze(
    Array.from({ length: stepCount + 1 }, (_, index) =>
      Number((field.min + index * field.step).toPrecision(12)),
    ),
  );
}

export function* enumerateParamConfigurations(schema: ParamSchema): Generator<ParamValues> {
  function* visit(
    index: number,
    current: Record<string, number | boolean>,
  ): Generator<ParamValues> {
    const field = schema.fields[index];
    if (!field) {
      yield Object.freeze({ ...current });
      return;
    }
    for (const value of valuesForField(field)) {
      current[field.key] = value;
      yield* visit(index + 1, current);
    }
    delete current[field.key];
  }
  yield* visit(0, {});
}

/** Runs fixed-step Module/control cohorts and returns threshold-free evidence.
 * Full policy is 20×15 Burst, 10×30 Continuous, and 60 Single runs. */
export async function validateModule<P>(
  module: ModuleDefinition<P>,
  params: P,
  options: ValidateModuleOptions,
): Promise<ModuleValidationReport> {
  await RAPIER.init();
  const compatibility = options.seedCount !== undefined || options.marbleCount !== undefined;
  if (compatibility) return validateCompatibilityModule(module, params, options);
  const spec = module.buildSpec(params);
  const requestedMatrix = options.matrix ?? "pr";
  const matrix = requestedMatrix;
  const profiles: readonly FeedProfile[] = options.profiles ?? ["burst15", "continuous", "single"];
  const width = options.entryConstraintWidth ?? SCALE.channelWidth;
  const scatterMode =
    options.scatterMode ?? (module.id === "pin-field" ? "wide-entry" : "constrained-entry");
  const control = controlFor(module, spec, width, scatterMode);
  const profileReports: FeedProfileValidation[] = [];

  for (const profile of profiles) {
    const seeds = options.seedsByProfile?.[profile] ?? validationSeedsFor(requestedMatrix, profile);
    const moduleRuns: ValidatedRun[] = [];
    const roleRuns: RoleMetricRun[] = [];
    const controlValidatedRuns: ValidatedRun[] = [];
    const controlRoleRuns: RoleMetricRun[] = [];
    for (const seed of seeds) {
      const cohort = buildFeedCohort(profile, seed, spec.footprint.entry, width);
      const [moduleResult, controlResult] = await Promise.all([
        simulateCohort(spec, module.step, cohort, options.maxSimulationSeconds),
        simulateCohort(control.spec, STATIC_STEP, cohort, options.maxSimulationSeconds),
      ]);
      moduleRuns.push(...moduleResult.runs);
      roleRuns.push(...moduleResult.roleRuns);
      controlValidatedRuns.push(...controlResult.runs);
      controlRoleRuns.push(...controlResult.roleRuns);
    }
    const approvedMinimumCompletedRuns = defaultMinimumCompletedRuns(profile, moduleRuns.length);
    const minimumCompletedRuns = Math.max(
      approvedMinimumCompletedRuns,
      options.minimumCompletedRuns ?? approvedMinimumCompletedRuns,
    );
    const dwell = dwellEvidence(
      moduleRuns.map(({ observation }) => observation),
      minimumCompletedRuns,
    );
    const controlDwell = dwellEvidence(
      controlValidatedRuns.map(({ observation }) => observation),
      minimumCompletedRuns,
    );
    const pairedRuns =
      dwell.validity.behaviorAvailable && controlDwell.validity.behaviorAvailable
        ? pairedEvidenceRuns(roleRuns, controlRoleRuns)
        : null;
    const evidence = pairedRuns
      ? evidenceFor(module.role, scatterMode, pairedRuns.moduleRuns, pairedRuns.controlRuns, width)
      : { evidence: null, controlEvidence: null };
    profileReports.push(
      Object.freeze({
        profile,
        seeds: Object.freeze([...seeds]),
        totalMarbles: moduleRuns.length,
        completedMarbles: moduleRuns.filter(({ observation }) => observation.completed).length,
        stalledMarbles: moduleRuns.filter(({ stalled }) => stalled).length,
        timedOutMarbles: moduleRuns.filter(({ timedOut }) => timedOut).length,
        controlStalledMarbles: controlValidatedRuns.filter(({ stalled }) => stalled).length,
        controlTimedOutMarbles: controlValidatedRuns.filter(({ timedOut }) => timedOut).length,
        dwell,
        controlDwell,
        evidence: evidence.evidence,
        controlEvidence: evidence.controlEvidence,
        runs: Object.freeze(moduleRuns),
        roleRuns: Object.freeze(roleRuns),
        controlRoleRuns: Object.freeze(controlRoleRuns),
      }),
    );
  }

  const runs = profileReports.flatMap(({ runs }) => runs);
  const roleRuns = profileReports.flatMap(({ roleRuns }) => roleRuns);
  const dwellSeconds = runs
    .flatMap(({ observation }) =>
      observation.dwellSeconds === null ? [] : [observation.dwellSeconds],
    )
    .sort((left, right) => left - right);
  const exitSpeeds = roleRuns.map(({ exitSpeed }) => exitSpeed);
  const minDisplacement =
    runs.length === 0
      ? 0
      : Math.min(...runs.map(({ minimumDisplacementPerSecond }) => minimumDisplacementPerSecond));
  const shuffleCoefficients = profileReports.flatMap(({ roleRuns: profileRoleRuns }) =>
    [...new Set(profileRoleRuns.map(({ seed }) => seed))].map((seed) => {
      const byMarble = profileRoleRuns
        .filter((run) => run.seed === seed)
        .sort((left, right) => left.marbleIndex - right.marbleIndex);
      return shuffleCoefficient(byMarble.map(({ exitTimeSeconds }) => exitTimeSeconds));
    }),
  );

  return Object.freeze({
    moduleId: module.id,
    role: module.role,
    matrix,
    rapierVersion: RAPIER.version(),
    profiles: Object.freeze(profileReports),
    totalMarbles: runs.length,
    completedMarbles: runs.filter(({ observation }) => observation.completed).length,
    stalledMarbles: runs.filter(({ stalled }) => stalled).length,
    timedOutMarbles: runs.filter(({ timedOut }) => timedOut).length,
    dwellSecondsP50: percentile(dwellSeconds, 0.5),
    dwellSecondsP95: percentile(dwellSeconds, 0.95),
    dwellSecondsP99: percentile(dwellSeconds, 0.99),
    maximumDwellSeconds: dwellSeconds.at(-1) ?? null,
    exitSpeeds: Object.freeze(exitSpeeds),
    minDisplacementPerSecond: minDisplacement,
    shuffleCoefficients: Object.freeze(shuffleCoefficients),
    seeds: new Set(profileReports.flatMap(({ seeds }) => seeds)).size,
  });
}
