export type RaceSeedSource = () => number;

/** Produces the root seed that independently derives Course and start streams. */
export const createRaceSeed: RaceSeedSource = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
};
