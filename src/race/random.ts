export type RaceRandomStream = "course" | "start";

const RACE_STREAM_SALTS: Readonly<Record<RaceRandomStream, number>> = Object.freeze({
  course: 0x9e37_79b9,
  start: 0x243f_6a88,
});

/** Derives an independent unsigned 32-bit seed for one race concern. The
 * tagged salt makes each stream insensitive to draws and call order in the
 * other stream. */
export function deriveRaceSeed(seed: number, stream: RaceRandomStream): number {
  let value = (seed >>> 0) ^ RACE_STREAM_SALTS[stream];
  value = Math.imul(value ^ (value >>> 16), 0x21f0_aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a_2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function shuffleStartSlots(count: number, random: () => number): number[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("Slot count must be a non-negative safe integer");
  }

  const slots = Array.from({ length: count }, (_, index) => index);

  for (let index = slots.length - 1; index > 0; index -= 1) {
    const value = random();

    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("Random generator must return a number in [0, 1)");
    }

    const swapIndex = Math.floor(value * (index + 1));
    [slots[index], slots[swapIndex]] = [slots[swapIndex], slots[index]];
  }

  return slots;
}
