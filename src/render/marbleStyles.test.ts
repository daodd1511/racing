import { describe, expect, it } from "vitest";

import { createMarbleStyles } from "./marbleStyles";

describe("createMarbleStyles", () => {
  it("assigns distinct solid colours before adding patterns", () => {
    const styles = createMarbleStyles(15);

    expect(styles.slice(0, 10).every((style) => style.pattern === "solid")).toBe(true);
    expect(styles.slice(10).some((style) => style.pattern === "stripe")).toBe(true);
    expect(styles.slice(10).some((style) => style.pattern === "spot")).toBe(true);
  });

  it("rejects invalid counts", () => {
    expect(() => createMarbleStyles(-1)).toThrow(RangeError);
  });
});
