import { describe, expect, it } from "vitest";

import { createMarbleStyles, marbleStripeBackground } from "./marbleStyles";
import { marbleStripeTexture } from "./marbleSkin";

describe("createMarbleStyles", () => {
  it("assigns every marble a distinct two-color striped skin", () => {
    const styles = createMarbleStyles(15);

    expect(styles.every((style) => style.pattern === "stripe")).toBe(true);
    expect(new Set(styles.map((style) => style.color)).size).toBe(15);
    expect(styles.every((style) => marbleStripeBackground(style).includes(style.accentColor))).toBe(
      true,
    );
  });

  it("reuses a skin texture containing both marble colors", () => {
    const style = createMarbleStyles(1)[0];
    const texture = marbleStripeTexture(style);
    const pixels = texture.image.data as Uint8Array;
    const colors = new Set<string>();
    for (let offset = 0; offset < pixels.length; offset += 4) {
      colors.add(`${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`);
    }

    expect(marbleStripeTexture(style)).toBe(texture);
    expect(colors).toEqual(new Set(["223,63,67", "255,241,199"]));
  });

  it("rejects invalid counts", () => {
    expect(() => createMarbleStyles(-1)).toThrow(RangeError);
  });
});
