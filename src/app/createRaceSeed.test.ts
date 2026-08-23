import { afterEach, describe, expect, it, vi } from "vitest";

import { createRaceSeed } from "./createRaceSeed";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createRaceSeed", () => {
  it("returns the unsigned 32-bit value from Web Crypto", () => {
    const getRandomValues = vi.fn((values: Uint32Array) => {
      values[0] = 0xfedc_ba98;
      return values;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    expect(createRaceSeed()).toBe(0xfedc_ba98);
    expect(getRandomValues).toHaveBeenCalledWith(expect.any(Uint32Array));
  });
});
