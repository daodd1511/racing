import { describe, expect, it } from "vitest";

import { createMarbleStyles } from "./marbleStyles";

describe("createMarbleStyles", () => {
  it("assigns every marble a distinct patterned design", () => {
    const styles = createMarbleStyles(15);

    expect(styles.every((style) => style.pattern !== undefined)).toBe(true);
    expect(new Set(styles.map((style) => style.color)).size).toBe(15);
    expect(new Set(styles.map((style) => style.pattern)).size).toBeGreaterThanOrEqual(5);
  });

  it("rejects invalid counts", () => {
    expect(() => createMarbleStyles(-1)).toThrow(RangeError);
  });
});
