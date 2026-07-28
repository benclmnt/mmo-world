import { hashToUnit } from "./rng";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic 2D value noise in approximately [0, 1].
 * `scale` is the distance in world tiles between invisible control points.
 */
export function valueNoise2D(
  x: number,
  y: number,
  scale: number,
  seed: number,
  salt = 0,
): number {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("Noise scale must be greater than zero");
  }

  const noiseX = x / scale;
  const noiseY = y / scale;
  const x0 = Math.floor(noiseX);
  const y0 = Math.floor(noiseY);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = smoothstep(noiseX - x0);
  const ty = smoothstep(noiseY - y0);

  const top = lerp(
    hashToUnit(seed, x0, y0, salt),
    hashToUnit(seed, x1, y0, salt),
    tx,
  );
  const bottom = lerp(
    hashToUnit(seed, x0, y1, salt),
    hashToUnit(seed, x1, y1, salt),
    tx,
  );

  return lerp(top, bottom, ty);
}

/** Combine broad and fine fields without introducing non-determinism. */
export function layeredValueNoise(
  x: number,
  y: number,
  seed: number,
  salt: number,
): number {
  return (
    valueNoise2D(x, y, 24, seed, salt) * 0.60 +
    valueNoise2D(x, y, 12, seed, salt) * 0.30 +
    valueNoise2D(x, y, 6, seed, salt) * 0.10
  );
}
