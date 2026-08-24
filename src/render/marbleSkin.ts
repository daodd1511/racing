import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from "three";

import type { MarbleStyle } from "./marbleStyles";

const STRIPE_PERIOD = 32;
const TEXTURE_WIDTH = STRIPE_PERIOD * 4;
const TEXTURE_HEIGHT = STRIPE_PERIOD * 2;
const ACCENT_WIDTH = 12;

const stripeTextures = new Map<string, DataTexture>();

function colorChannels(color: string): readonly [number, number, number] {
  const hex = new Color(color).getHex(SRGBColorSpace);
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function createStripeTexture(style: MarbleStyle): DataTexture {
  const primary = colorChannels(style.color);
  const accent = colorChannels(style.accentColor);
  const data = new Uint8Array(TEXTURE_WIDTH * TEXTURE_HEIGHT * 4);

  for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
    for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
      const channels = (x + y * 2) % STRIPE_PERIOD < ACCENT_WIDTH ? accent : primary;
      const offset = (y * TEXTURE_WIDTH + x) * 4;
      data[offset] = channels[0];
      data[offset + 1] = channels[1];
      data[offset + 2] = channels[2];
      data[offset + 3] = 255;
    }
  }

  const texture = new DataTexture(
    data,
    TEXTURE_WIDTH,
    TEXTURE_HEIGHT,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Returns one app-lifetime GPU skin per stable color pair. The fixed palette
 * caps this cache at fifteen small textures and lets live/frozen scenes reuse
 * them across React Strict Mode remounts without disposing an active texture. */
export function marbleStripeTexture(style: MarbleStyle): DataTexture {
  const key = `${style.color}:${style.accentColor}`;
  const cached = stripeTextures.get(key);
  if (cached !== undefined) return cached;

  const texture = createStripeTexture(style);
  stripeTextures.set(key, texture);
  return texture;
}
