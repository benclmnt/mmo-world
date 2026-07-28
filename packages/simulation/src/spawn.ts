import type { Entity, EntityId } from "./Entity";
import { Terrain } from "./Terrain";
import type { World } from "./World";
import type { RandomSource } from "./generation/rng";

export interface SpawnOptions {
  /** Minimum four-direction movement distance from every occupied tile. */
  minSeparation: number;
}

export interface SpawnPosition {
  x: number;
  y: number;
}

/**
 * Selects one grass tile uniformly from currently valid candidates.
 * It never silently relaxes minimum separation: callers receive undefined when
 * the world cannot accommodate another entity under the requested policy.
 */
export function chooseSpawnPosition(
  world: World,
  entities: ReadonlyMap<EntityId, Entity>,
  rng: RandomSource,
  options: SpawnOptions,
): SpawnPosition | undefined {
  validateOptions(options);
  const candidates: SpawnPosition[] = [];

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (world.get(x, y) !== Terrain.Grass || isOccupied(x, y, entities)) {
        continue;
      }

      if (hasRequiredSeparation(x, y, entities, options.minSeparation)) {
        candidates.push({ x, y });
      }
    }
  }

  if (candidates.length === 0) {
    return undefined;
  }

  return candidates[rng.nextInt(candidates.length)];
}

function isOccupied(x: number, y: number, entities: ReadonlyMap<EntityId, Entity>): boolean {
  for (const entity of entities.values()) {
    if (entity.x === x && entity.y === y) {
      return true;
    }
  }
  return false;
}

function hasRequiredSeparation(
  x: number,
  y: number,
  entities: ReadonlyMap<EntityId, Entity>,
  minSeparation: number,
): boolean {
  for (const entity of entities.values()) {
    const manhattanDistance = Math.abs(entity.x - x) + Math.abs(entity.y - y);
    if (manhattanDistance < minSeparation) {
      return false;
    }
  }
  return true;
}

function validateOptions(options: SpawnOptions): void {
  if (!Number.isInteger(options.minSeparation) || options.minSeparation < 0) {
    throw new Error("minSeparation must be a non-negative integer");
  }
}
