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

/** Stateful deterministic randomness for simulation decisions such as spawning. */
export interface RandomSource {
  nextUint32(): number;
  nextFloat(): number;
  nextInt(upperExclusive: number): number;
}

export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = hash32(seed, 0, 0, 0x6d2b79f5) || 1;
  }

  nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  nextInt(upperExclusive: number): number {
    if (!Number.isInteger(upperExclusive) || upperExclusive <= 0) {
      throw new Error("upperExclusive must be a positive integer");
    }
    return Math.floor(this.nextFloat() * upperExclusive);
  }
}
