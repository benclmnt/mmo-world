import { Terrain } from "./Terrain";

export class World {
  readonly tiles: Uint8Array;

  constructor(
    readonly seed: number,
    readonly width: number,
    readonly height: number,
    tiles?: Uint8Array,
  ) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error("World dimensions must be positive integers");
    }

    const expectedLength = width * height;
    if (tiles !== undefined && tiles.length !== expectedLength) {
      throw new Error(`Expected ${expectedLength} tiles, got ${tiles.length}`);
    }

    this.tiles = tiles === undefined
      ? new Uint8Array(expectedLength).fill(Terrain.Grass)
      : new Uint8Array(tiles);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): Terrain {
    if (!this.inBounds(x, y)) {
      throw new Error(`Tile (${x}, ${y}) is outside the world`);
    }
    return this.tiles[y * this.width + x] as Terrain;
  }

  set(x: number, y: number, terrain: Terrain): void {
    if (!this.inBounds(x, y)) {
      throw new Error(`Tile (${x}, ${y}) is outside the world`);
    }
    this.tiles[y * this.width + x] = terrain;
  }
}
