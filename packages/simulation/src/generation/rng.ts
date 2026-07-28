/** A stable coordinate hash used instead of Math.random() during generation. */
export function hash32(seed: number, x: number, y: number, salt = 0): number {
  let value = (seed >>> 0) ^ Math.imul(x | 0, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value ^= Math.imul(y | 0, 0xc2b2ae35);
  value = Math.imul(value ^ (salt | 0), 0x27d4eb2d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return value >>> 0;
}

export function hashToUnit(seed: number, x: number, y: number, salt = 0): number {
  return hash32(seed, x, y, salt) / 0x1_0000_0000;
}
