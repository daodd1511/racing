import { describe, expect, it } from "vitest";

import { createSeededRandom, deriveRaceSeed, shuffleStartSlots } from "./random";

describe("deriveRaceSeed", () => {
  it("reproduces each tagged seed and separates the tags", () => {
    expect(deriveRaceSeed(42, "course")).toBe(deriveRaceSeed(42, "course"));
    expect(deriveRaceSeed(42, "start")).toBe(deriveRaceSeed(42, "start"));
    expect(deriveRaceSeed(42, "course")).not.toBe(deriveRaceSeed(42, "start"));
  });

  it("keeps Start draws isolated from Course draws", () => {
    const seed = 0xdecafbad;
    const course = createSeededRandom(deriveRaceSeed(seed, "course"));
    const expectedStart = createSeededRandom(deriveRaceSeed(seed, "start"));
    const actualStart = createSeededRandom(deriveRaceSeed(seed, "start"));

    for (let draw = 0; draw < 100; draw += 1) {
      course();
    }

    expect([actualStart(), actualStart(), actualStart()]).toEqual([
      expectedStart(),
      expectedStart(),
      expectedStart(),
    ]);
  });
});

describe("createSeededRandom", () => {
  it("reproduces a stream for the same seed", () => {
    const first = createSeededRandom(0xdecafbad);
    const second = createSeededRandom(0xdecafbad);

    expect([first(), first(), first(), first()]).toEqual([second(), second(), second(), second()]);
  });

  it("normalizes seeds to unsigned 32-bit values", () => {
    const negativeSeed = createSeededRandom(-1);
    const unsignedSeed = createSeededRandom(0xffff_ffff);

    expect([negativeSeed(), negativeSeed()]).toEqual([unsignedSeed(), unsignedSeed()]);
  });
});

describe("shuffleStartSlots", () => {
  it("returns every slot exactly once", () => {
    const slots = shuffleStartSlots(15, createSeededRandom(8));

    expect([...slots].sort((left, right) => left - right)).toEqual(
      Array.from({ length: 15 }, (_, index) => index),
    );
  });

  it("uses Fisher-Yates decisions without mutating roster data", () => {
    const slots = shuffleStartSlots(4, () => 0);

    expect(slots).toEqual([1, 2, 3, 0]);
  });

  it("rejects invalid counts and random values", () => {
    expect(() => shuffleStartSlots(-1, () => 0.5)).toThrow(RangeError);
    expect(() => shuffleStartSlots(2, () => 1)).toThrow(RangeError);
  });
});
