import { Terrain } from "../Terrain";
import { World } from "../World";
import { layeredValueNoise } from "./noise";

export interface WorldGenerationOptions {
  seed: number;
  width?: number;
  height?: number;
}

export const DEFAULT_WORLD_WIDTH = 64;
export const DEFAULT_WORLD_HEIGHT = 64;
export const SPAWN_CLEARING_RADIUS = 4;

/**
 * Produces the initial static terrain. Connectivity retries are intentionally
 * deferred to the next M0 step, so generator tuning remains easy to inspect.
 */
export function generateWorld(options: WorldGenerationOptions): World {
  const width = options.width ?? DEFAULT_WORLD_WIDTH;
  const height = options.height ?? DEFAULT_WORLD_HEIGHT;
  const world = new World(options.seed, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const elevation = layeredValueNoise(x, y, options.seed, 1);
      const forest = layeredValueNoise(x, y, options.seed, 2);
      const rockiness = layeredValueNoise(x, y, options.seed, 3);

      let terrain = Terrain.Grass;
      if (elevation < 0.25) {
        terrain = Terrain.Water;
      } else if (rockiness > 0.72) {
        terrain = Terrain.Rock;
      } else if (forest > 0.61) {
        terrain = Terrain.Tree;
      }

      world.set(x, y, terrain);
    }
  }

  clearCentralSpawn(world);
  return world;
}

export function clearCentralSpawn(world: World): void {
  const centerX = Math.floor(world.width / 2);
  const centerY = Math.floor(world.height / 2);

  for (let y = centerY - SPAWN_CLEARING_RADIUS; y <= centerY + SPAWN_CLEARING_RADIUS; y++) {
    for (let x = centerX - SPAWN_CLEARING_RADIUS; x <= centerX + SPAWN_CLEARING_RADIUS; x++) {
      if (world.inBounds(x, y)) {
        world.set(x, y, Terrain.Grass);
      }
    }
  }
}
