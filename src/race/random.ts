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
