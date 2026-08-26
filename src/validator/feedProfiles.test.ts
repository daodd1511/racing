import { describe, expect, it } from "vitest";

import type { Anchor } from "../modules/types";
import { KINEMATIC_FIXED_STEP_SECONDS } from "../modules/kinematics";
import { SCALE } from "../race/scale";
import {
  CONTINUOUS_COHORT_SIZE,
  CONTINUOUS_RELEASE_INTERVAL_SECONDS,
  FEED_STALL_TIMEOUT_SECONDS,
  buildFeedCohort,
  feedConfigurationIdentity,
} from "./feedProfiles";

const ENTRY: Anchor = {
  position: [0, 0, 0],
  tangent: [0, 0, 1],
  up: [0, 1, 0],
};

describe("buildFeedCohort", () => {
  it("reproduces seeded cohorts", () => {
    expect(buildFeedCohort("continuous", 42, ENTRY)).toEqual(
      buildFeedCohort("continuous", 42, ENTRY),
    );
    expect(buildFeedCohort("continuous", 43, ENTRY)).not.toEqual(
      buildFeedCohort("continuous", 42, ENTRY),
    );
  });

  it("builds Burst 15 from the non-overlapping 5x3 start grid and releases one tick", () => {
    const cohort = buildFeedCohort("burst15", 7, ENTRY);

    expect(cohort.releases).toHaveLength(15);
    expect(new Set(cohort.releases.map(({ releaseStep }) => releaseStep))).toEqual(new Set([0]));
    expect(cohort.releases.every(({ heldByGate }) => heldByGate)).toBe(true);
    expect(
      cohort.releases.every(({ initialVelocity }) => initialVelocity.every((v) => v === 0)),
    ).toBe(true);
    for (let left = 0; left < cohort.releases.length; left += 1) {
      for (let right = left + 1; right < cohort.releases.length; right += 1) {
        expect(
          Math.hypot(
            cohort.releases[left].position[0] - cohort.releases[right].position[0],
            cohort.releases[left].position[1] - cohort.releases[right].position[1],
            cohort.releases[left].position[2] - cohort.releases[right].position[2],
          ),
        ).toBeGreaterThan(SCALE.marbleRadius * 2);
      }
    }
  });

  it("builds 30-marble Continuous and isolated Single cohorts", () => {
    const continuous = buildFeedCohort("continuous", 7, ENTRY);
    const single = buildFeedCohort("single", 7, ENTRY);

    expect(continuous.releases).toHaveLength(CONTINUOUS_COHORT_SIZE);
    expect(continuous.releases[1].releaseStep * KINEMATIC_FIXED_STEP_SECONDS).toBe(
      CONTINUOUS_RELEASE_INTERVAL_SECONDS,
    );
    expect(single.releases).toHaveLength(1);
    expect(single.releases[0].releaseStep).toBe(0);
    expect(continuous.stallTimeoutSeconds).toBe(FEED_STALL_TIMEOUT_SECONDS);
  });

  it.each(["burst15", "continuous", "single"] as const)(
    "keeps %s nominal inputs inside a constrained entry",
    (profile) => {
      const width = SCALE.marbleRadius * 5;
      const cohort = buildFeedCohort(profile, 7, ENTRY, width);

      expect(
        cohort.releases.every(
          ({ position }) => Math.abs(position[0]) <= width / 2 - SCALE.marbleRadius + 1e-12,
        ),
      ).toBe(true);
      if (profile === "burst15") {
        for (let left = 0; left < cohort.releases.length; left += 1) {
          for (let right = left + 1; right < cohort.releases.length; right += 1) {
            expect(
              Math.hypot(
                cohort.releases[left].position[0] - cohort.releases[right].position[0],
                cohort.releases[left].position[1] - cohort.releases[right].position[1],
                cohort.releases[left].position[2] - cohort.releases[right].position[2],
              ),
            ).toBeGreaterThan(SCALE.marbleRadius * 2);
          }
        }
      }
    },
  );

  it("rejects an entry constraint narrower than one marble", () => {
    expect(() => buildFeedCohort("single", 7, ENTRY, SCALE.marbleRadius)).toThrow(
      "Feed constraint width",
    );
  });
});

describe("feedConfigurationIdentity", () => {
  const base = {
    moduleId: "chute",
    params: { grade: 0.2, length: 0.6 },
    profile: "continuous" as const,
    seed: 9,
  };

  it("is stable across parameter insertion order", () => {
    expect(feedConfigurationIdentity(base)).toBe(
      feedConfigurationIdentity({ ...base, params: { length: 0.6, grade: 0.2 } }),
    );
  });

  it.each([
    { ...base, moduleId: "whoops" },
    { ...base, params: { grade: 0.3, length: 0.6 } },
    { ...base, profile: "burst15" as const },
    { ...base, seed: 10 },
  ])("changes when a reset boundary changes", (configuration) => {
    expect(feedConfigurationIdentity(configuration)).not.toBe(feedConfigurationIdentity(base));
  });
});
