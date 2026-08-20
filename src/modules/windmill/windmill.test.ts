import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";

import { defaultParamValues } from "../params";
import { windmill, type WindmillParams } from "./index";
import { KINEMATIC_FIXED_STEP_SECONDS } from "../kinematics";
import { SCALE } from "../../race/scale";
import { buildWorld } from "../../validator/buildWorld";
import { MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND } from "../../validator/metrics";
import { validateModule, type ValidationReport } from "../../validator/validateModule";
import { applyStep } from "../../validator/applyStep";

const DWELL_P50_MAX_SECONDS = 2.2;
const DWELL_P99_MAX_SECONDS = 3.8;
// The default 20-seed x 15-marble feed separates p50 and p99 exits by about
// 0.167 s. Keep real margin while rejecting a paddle that releases the whole
// Queue in the same solver moment instead of metering a batch.
const MINIMUM_QUEUE_EXIT_SEPARATION_SECONDS = 0.1;

function numberField(key: string) {
  const field = windmill.meta.params.fields.find((candidate) => candidate.key === key);
  if (field?.kind !== "number") {
    throw new Error(`expected ${key} number field`);
  }
  return field;
}

function bladeId(index: number): string {
  return `windmill-blade-${index}`;
}

function toVector(vector: RAPIER.Vector): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function subtract(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(vector: readonly number[], scalar: number): [number, number, number] {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function normalize(vector: readonly number[]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length === 0) {
    throw new Error("expected non-zero vector");
  }
  return scale(vector, 1 / length);
}

describe("windmill guardrails", () => {
  const params = defaultParamValues(windmill.meta.params) as unknown as WindmillParams;
  let report: ValidationReport;

  beforeAll(async () => {
    await RAPIER.init();
    report = await validateModule(windmill, params, {
      seedCount: 20,
      marbleCount: 15,
      maxSimulationSeconds: 8,
    });
  }, 30_000);

  it("clears a 20-seed x 15-marble Queue with visible motion", () => {
    expect(report.stalledMarbles).toBe(0);
    expect(report.minDisplacementPerSecond).toBeGreaterThan(
      MINIMUM_VISIBLE_DISPLACEMENT_PER_SECOND,
    );
    expect(report.dwellSecondsP50).not.toBeNull();
    expect(report.dwellSecondsP50 as number).toBeLessThan(DWELL_P50_MAX_SECONDS);
    expect(report.dwellSecondsP99 as number).toBeLessThan(DWELL_P99_MAX_SECONDS);
  });

  it("separates exit times, earning its queue Role", () => {
    expect(report.stalledMarbles).toBe(0);
    expect((report.dwellSecondsP99 as number) - (report.dwellSecondsP50 as number)).toBeGreaterThan(
      MINIMUM_QUEUE_EXIT_SEPARATION_SECONDS,
    );
  });

  it("returns pure, call-order-independent blade transforms", () => {
    const spec = windmill.buildSpec(params);
    const future = windmill.step(spec, 1.25);

    expect(windmill.step(spec, 0.5)).not.toEqual(future);
    expect(windmill.step(spec, 1.25)).toEqual(future);
    expect(windmill.step(spec, 1.25)).toEqual(future);

    const blades = spec.colliders.filter((collider) => collider.kinematic);
    expect(future.map((transform) => transform.id)).toEqual(blades.map((blade) => blade.id));
  });

  it("caps the longest blade's per-step sweep below one marble diameter", () => {
    const bladeLength = numberField("bladeLength");
    const angularVelocity = numberField("angularVelocity");
    const stepDistance = bladeLength.max * angularVelocity.max * KINEMATIC_FIXED_STEP_SECONDS;

    expect(stepDistance).toBeLessThan(SCALE.marbleRadius * 2);
  });

  it("hits a marble at maximum speed without sweeping it to the far side", () => {
    const angularVelocity = numberField("angularVelocity");
    const maximumSpeedParams = { ...params, angularVelocity: angularVelocity.max };
    const spec = windmill.buildSpec(maximumSpeedParams);
    const blade = spec.colliders.find((collider) => collider.id === bladeId(0));
    if (blade?.motion?.kind !== "rotation") {
      throw new Error("expected the first blade's rotational motion");
    }

    const { world, kinematicBodies } = buildWorld([spec]);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, 0).setGravityScale(0).setCcdEnabled(true),
    );
    const marbleCollider = world.createCollider(
      RAPIER.ColliderDesc.ball(SCALE.marbleRadius)
        .setRestitution(SCALE.defaultRestitution)
        .setFriction(SCALE.defaultFriction),
      body,
    );

    // Put the marble at 75% of blade 0's radial run at a future blade pose.
    // It starts clear of the blade, then the kinematic face reaches it during
    // the sweep. Zero gravity isolates this collision from the channel floor.
    const impactTime = 0.15;
    const impactTransform = windmill
      .step(spec, impactTime)
      .find((transform) => transform.id === blade.id);
    if (impactTransform?.position === undefined) {
      throw new Error("expected a blade position at impact time");
    }
    const pivot = blade.motion.pivot;
    const radial = normalize(subtract(impactTransform.position, pivot));
    const target = [
      pivot[0] + radial[0] * maximumSpeedParams.bladeLength * 0.75,
      pivot[1] + radial[1] * maximumSpeedParams.bladeLength * 0.75,
      pivot[2] + radial[2] * maximumSpeedParams.bladeLength * 0.75,
    ] as const;
    body.setTranslation({ x: target[0], y: target[1], z: target[2] }, true);

    let hitBlade = false;
    let hitStep: number | undefined;
    let lastBladePosition = impactTransform.position;
    for (let step = 1; step <= 15; step += 1) {
      const tSeconds = step * KINEMATIC_FIXED_STEP_SECONDS;
      const transforms = windmill.step(spec, tSeconds);
      applyStep(transforms, kinematicBodies);
      const current = transforms.find((transform) => transform.id === blade.id);
      if (current?.position !== undefined) {
        lastBladePosition = current.position;
      }
      world.step();
      world.contactPairsWith(marbleCollider, (other) => {
        if (other.parent()?.handle === kinematicBodies.get(blade.id)?.handle) {
          hitBlade = true;
          hitStep ??= step;
        }
      });
      if (hitStep !== undefined && step >= hitStep + 2) {
        break;
      }
    }

    const radialAtEnd = normalize(subtract(lastBladePosition, pivot));
    const bladeMotionDirection = normalize(cross(blade.motion.axis, radialAtEnd));
    const marbleSide = dot(
      subtract(toVector(body.translation()), lastBladePosition),
      bladeMotionDirection,
    );
    world.free();

    expect(hitBlade).toBe(true);
    // Positive is the leading, pushed side of the blade. A negative value
    // means the kinematic blade crossed the marble without resolving contact.
    expect(marbleSide).toBeGreaterThan(0);
  });
});
