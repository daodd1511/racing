import { describe, expect, it } from "vitest";

import { createSeededRandom, shuffleStartSlots } from "./random";

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
