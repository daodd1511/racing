import { describe, expect, it } from "vitest";

import { chute, type ChuteParams } from "./chute";
import type { ModuleDefinition } from "./types";

// `buildSpec` purity is load-bearing, not stylistic -- ADR 0002 depends on
// it: the Validator and the live renderer both consume `buildSpec`'s output,
// and if it isn't a pure function of `params`, the Validator starts
// validating a different world than the one that ships. This test is the
// one place that gets enforced, module by module, as the catalogue grows.

function assertBuildSpecIsPure<P>(module: ModuleDefinition<P>, params: P): void {
  const first = module.buildSpec(params);
  const second = module.buildSpec(params);
  const third = module.buildSpec(params);

  // Deep-equal, not the same reference -- a fresh object per call is fine;
  // what matters is the output never depends on anything but `params`.
  expect(second).toEqual(first);
  expect(third).toEqual(first);
}

describe("Module buildSpec purity", () => {
  it.each<ChuteParams>([
    { length: 0.6, grade: 0.25, width: 0.5 },
    { length: 1.2, grade: 0.05, width: 0.3 },
    { length: 0.2, grade: 0.6, width: 0.8 },
  ])("chute.buildSpec(%o) is referentially transparent", (params) => {
    assertBuildSpecIsPure(chute, params);
  });

  it("chute.buildSpec output does not depend on call order", () => {
    const paramsA: ChuteParams = { length: 0.6, grade: 0.25, width: 0.5 };
    const paramsB: ChuteParams = { length: 1.0, grade: 0.4, width: 0.4 };

    const a1 = chute.buildSpec(paramsA);
    const b1 = chute.buildSpec(paramsB);
    const a2 = chute.buildSpec(paramsA);

    expect(a2).toEqual(a1);
    expect(b1).not.toEqual(a1);
  });

  it("chute.step is static: it returns no kinematic transforms regardless of time", () => {
    const spec = chute.buildSpec({ length: 0.6, grade: 0.25, width: 0.5 });

    expect(chute.step(spec, 0)).toEqual([]);
    expect(chute.step(spec, 12.5)).toEqual([]);
  });
});
