import { describe, expect, it } from "vitest";

import type { TrackBoxKind } from "./definition";
import { createTrackDefinition, DEFAULT_TRACK_CONFIG } from "./definition";
import { measureTrackProgress, sampleTrackPath } from "./progress";
import { DEFAULT_MARBLE_MATERIAL } from "../simulation/simulateRace";

const ALL_TRACK_BOX_KINDS: readonly TrackBoxKind[] = ["side-rail", "pin", "rumble"];

describe("createTrackDefinition", () => {
  it("builds the fixed raceway modules and one-line starting grid", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);

    expect(track.surface.vertices.length).toBeGreaterThan(100);
    expect(track.surface.indices.length).toBeGreaterThan(100);
    expect(track.boxes.some((box) => box.kind === "side-rail")).toBe(true);
    expect(track.boxes.filter((box) => box.kind === "pin")).toHaveLength(18);
    expect(track.boxes.filter((box) => box.kind === "rumble")).toHaveLength(3);
    for (const kind of ALL_TRACK_BOX_KINDS) {
      expect(track.boxes.some((box) => box.kind === kind)).toBe(true);
    }
    expect(track.path.length).toBeGreaterThan(50);
    expect(track.startSlots).toHaveLength(DEFAULT_TRACK_CONFIG.startSlotCount);
    const startTangent = sampleTrackPath(track, 1.5).tangent;
    const startProgress = track.startSlots.map((slot) => measureTrackProgress(track, slot));
    expect(Math.max(...startProgress) - Math.min(...startProgress)).toBeLessThan(0.02);
    expect(
      Math.hypot(
        track.startSlots[1][0] - track.startSlots[0][0],
        track.startSlots[1][1] - track.startSlots[0][1],
        track.startSlots[1][2] - track.startSlots[0][2],
      ),
    ).toBeGreaterThan(DEFAULT_TRACK_CONFIG.marbleRadius * 1.8);
    for (let index = 1; index < track.startSlots.length; index += 1) {
      const previous = track.startSlots[index - 1];
      const current = track.startSlots[index];
      const separation = [
        current[0] - previous[0],
        current[1] - previous[1],
        current[2] - previous[2],
      ];
      const longitudinalOffset = Math.abs(
        separation[0] * startTangent[0] +
          separation[1] * startTangent[1] +
          separation[2] * startTangent[2],
      );
      expect(longitudinalOffset).toBeLessThan(0.001);
    }
  });

  it("uses grounded raceway materials instead of springy pinball materials", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);

    expect(track.surface.material.restitution).toBe(0);
    expect(track.surface.material.friction).toBe(0.1);
    expect(track.boxes.find((box) => box.kind === "side-rail")?.material).toEqual({
      restitution: 0.03,
      friction: 0.11,
    });
    expect(DEFAULT_MARBLE_MATERIAL).toEqual({ restitution: 0, friction: 0.12 });
  });

  it("places the finish line near the end of the sampled centreline", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);
    const totalDistance = track.path.at(-1)?.distance ?? 0;

    expect(track.finishProgress).toBeGreaterThan(totalDistance * 0.9);
    expect(track.finishProgress).toBeLessThan(totalDistance);
    expect(track.finishLine.halfWidth).toBe(DEFAULT_TRACK_CONFIG.trackHalfWidth);
  });

  it("keeps the pin field clear enough for a 15-marble pack to drain", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);
    const pinCenters = track.boxes.filter((box) => box.kind === "pin").map((box) => box.center);
    const footprintWidth = 0.25 * Math.SQRT2 * 2;

    let minDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pinCenters.length; i += 1) {
      for (let j = i + 1; j < pinCenters.length; j += 1) {
        const distance = Math.hypot(
          pinCenters[i][0] - pinCenters[j][0],
          pinCenters[i][1] - pinCenters[j][1],
          pinCenters[i][2] - pinCenters[j][2],
        );
        minDistance = Math.min(minDistance, distance);
      }
    }

    expect(minDistance - footprintWidth).toBeGreaterThanOrEqual(1.2);
  });

  it("keeps every pin post clear of the rails, with no dead-end pocket", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);
    const footprintHalfWidth = 0.25 * Math.SQRT2;

    for (const pin of track.boxes.filter((box) => box.kind === "pin")) {
      const progress = measureTrackProgress(track, pin.center);
      const sample = sampleTrackPath(track, progress);
      const lateral =
        (pin.center[0] - sample.position[0]) * sample.side[0] +
        (pin.center[1] - sample.position[1]) * sample.side[1] +
        (pin.center[2] - sample.position[2]) * sample.side[2];
      const clearanceToRail =
        DEFAULT_TRACK_CONFIG.trackHalfWidth -
        DEFAULT_TRACK_CONFIG.railThickness -
        Math.abs(lateral) -
        footprintHalfWidth;

      expect(clearanceToRail).toBeGreaterThan(0);
    }
  });

  it("rejects unsupported banking", () => {
    expect(() =>
      createTrackDefinition({
        ...DEFAULT_TRACK_CONFIG,
        maximumBankRadians: Math.PI / 3,
      }),
    ).toThrow(RangeError);
  });
});

describe("vortex bowl", () => {
  it("keeps the funnel's facet chord well under the marble diameter", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);
    // Mirrors BOWL_RADIAL_SEGMENTS in definition.ts — kept here as an
    // independent recomputation rather than an import, matching this file's
    // existing pattern of duplicating known-safe constants (see the pin
    // field's footprintWidth above).
    const radialSegments = 192;
    const chord = 2 * track.bowl.radius * Math.sin(Math.PI / radialSegments);

    expect(chord).toBeLessThan(DEFAULT_TRACK_CONFIG.marbleRadius);
  });

  it("sizes the drain to at least three marble diameters", () => {
    // Mirrors BOWL_DRAIN_RADIUS in definition.ts.
    const drainRadius = 1.05;

    expect(drainRadius * 2).toBeGreaterThanOrEqual(DEFAULT_TRACK_CONFIG.marbleRadius * 2 * 3);
  });

  it("keeps every non-bridge path sample clear of the bowl's bounding volume", () => {
    const track = createTrackDefinition(DEFAULT_TRACK_CONFIG);
    const bowl = track.bowl;
    // Same margin as measureBowlProgress in src/track/progress.ts — a
    // sample inside this margin would corrupt an unrelated part of the
    // course's progress reading, and the monotone tracker would make that
    // corruption permanent (PLAN.md -> "The bounding volume must not
    // swallow unrelated track").
    const margin = 1;
    const bridgeEntryDistance = bowl.entryDistance;
    const bridgeExitDistance = bowl.entryDistance + bowl.bridgeLength;
    // A generous exclusion around the bridge itself, not its exact
    // endpoints: the approach ribbon converges tangentially onto the bowl's
    // boundary, so its last samples (~0.3 m apart at the default 32
    // samples/span) are inherently within a fraction of a metre of
    // entryDistance by construction -- that's expected proximity, not the
    // unrelated-course intrusion this test exists to catch.
    const approachExclusion = 5;

    for (const sample of track.path) {
      if (
        sample.distance >= bridgeEntryDistance - approachExclusion &&
        sample.distance <= bridgeExitDistance + approachExclusion
      ) {
        continue;
      }
      const dx = sample.position[0] - bowl.center[0];
      const dz = sample.position[2] - bowl.center[2];
      const planarDistance = Math.hypot(dx, dz);
      const withinPlanar = planarDistance <= bowl.radius + margin;
      const withinHeight =
        sample.position[1] <= bowl.rimY + margin && sample.position[1] >= bowl.drainY - margin;

      expect(
        withinPlanar && withinHeight,
        `path sample at distance ${sample.distance.toFixed(1)} intrudes into the bowl's bounding volume`,
      ).toBe(false);
    }
  });
});
