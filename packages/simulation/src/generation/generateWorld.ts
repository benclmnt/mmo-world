import { Terrain } from "../Terrain";
import { World } from "../World";
import { analyzeWalkableConnectivity } from "./connectivity";
import { valueNoise2D } from "./noise";
import { hash32, hashToUnit } from "./rng";

export interface WorldGenerationOptions {
  seed: number;
  width?: number;
  height?: number;
  maxAttempts?: number;
}

export const DEFAULT_WORLD_WIDTH = 64;
export const DEFAULT_WORLD_HEIGHT = 64;
const DEFAULT_MAX_ATTEMPTS = 64;

/**
 * Generates deterministic candidate maps until every walkable tile belongs to
 * one connected component. `seed` remains the public reproducibility key;
 * attempt seeds are derived from it internally and recorded on the World.
 */
export function generateWorld(options: WorldGenerationOptions): World {
  const width = options.width ?? DEFAULT_WORLD_WIDTH;
  const height = options.height ?? DEFAULT_WORLD_HEIGHT;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const terrainSeed = attempt === 0
      ? options.seed
      : hash32(options.seed, attempt, 0, 0x51f15e);
    const world = generateCandidate(options.seed, terrainSeed, width, height, attempt);

    if (analyzeWalkableConnectivity(world).isFullyConnected) {
      return world;
    }
  }

  throw new Error(`Could not generate a connected world for seed ${options.seed} in ${maxAttempts} attempts`);
}

function generateCandidate(
  worldSeed: number,
  terrainSeed: number,
  width: number,
  height: number,
  generationAttempt: number,
): World {
  const world = new World(worldSeed, width, height, undefined, generationAttempt);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Elevation includes a broad field so low areas become lake-sized regions.
      const elevation = blendNoise(x, y, terrainSeed, 1, [
        [32, 0.65],
        [14, 0.25],
        [6, 0.10],
      ]);
      // Forest intentionally excludes a huge field: forests become more numerous
      // medium/small clusters rather than one dominant continent-wide blob.
      const forest = blendNoise(x, y, terrainSeed, 2, [
        [11, 0.70],
        [5, 0.30],
      ]);
      const rockiness = blendNoise(x, y, terrainSeed, 3, [
        [15, 0.70],
        [6, 0.30],
      ]);

      let terrain = Terrain.Grass;
      if (elevation < 0.33) {
        terrain = Terrain.Water;
      } else if (rockiness > 0.74) {
        terrain = Terrain.Rock;
      } else if (forest > 0.64) {
        terrain = Terrain.Tree;
      }

      world.set(x, y, terrain);
    }
  }

  // Some deterministic candidates receive a winding river that runs from one
  // map edge into an interior lake. It is deliberately not edge-to-edge: an
  // impassable cross-map river would split the playable area in two.
  if (hashToUnit(terrainSeed, 0, 0, 10) > 0.45) {
    carveRiver(world, terrainSeed);
  }

  return world;
}

function blendNoise(
  x: number,
  y: number,
  seed: number,
  salt: number,
  layers: readonly (readonly [scale: number, weight: number])[],
): number {
  return layers.reduce(
    (total, [scale, weight]) => total + valueNoise2D(x, y, scale, seed, salt) * weight,
    0,
  );
}

function carveRiver(world: World, terrainSeed: number): void {
  const target = chooseInteriorWaterTile(world, terrainSeed);
  if (target === undefined) {
    return;
  }

  const edge = Math.floor(hashToUnit(terrainSeed, 0, 0, 11) * 4);
  const horizontal = edge === 0 || edge === 1;
  const startsAtLowEdge = edge === 0 || edge === 2;
  const primaryLength = horizontal ? world.width : world.height;
  const secondaryLength = horizontal ? world.height : world.width;
  const targetPrimary = horizontal ? target.x : target.y;
  const targetSecondary = horizontal ? target.y : target.x;
  const startPrimary = startsAtLowEdge ? 0 : primaryLength - 1;
  const startSecondary = Math.floor(hashToUnit(terrainSeed, 0, 0, 12) * secondaryLength);
  const direction = startPrimary < targetPrimary ? 1 : -1;
  const pathLength = Math.abs(targetPrimary - startPrimary);

  for (
    let primary = startPrimary;
    direction > 0 ? primary <= targetPrimary : primary >= targetPrimary;
    primary += direction
  ) {
    const progress = Math.abs(primary - startPrimary) / Math.max(1, pathLength);
    // Meander fades to zero at both endpoints, guaranteeing the river joins its lake.
    const meander = (valueNoise2D(primary, 0, 12, terrainSeed, 15) - 0.5) * 14
      * Math.sin(Math.PI * progress);
    const secondary = Math.round(startSecondary + (targetSecondary - startSecondary) * progress + meander);
    // Radius 1..3 means the river visibly varies between 3, 5, and 7 tiles wide.
    const radius = 1 + Math.floor(valueNoise2D(primary, 1, 10, terrainSeed, 16) * 3);

    for (let offset = -radius; offset <= radius; offset++) {
      const x = horizontal ? primary : secondary + offset;
      const y = horizontal ? secondary + offset : primary;
      if (world.inBounds(x, y)) {
        world.set(x, y, Terrain.Water);
      }
    }
  }
}

function chooseInteriorWaterTile(world: World, terrainSeed: number): { x: number; y: number } | undefined {
  const candidates: { x: number; y: number }[] = [];
  const margin = 10;

  for (let y = margin; y < world.height - margin; y++) {
    for (let x = margin; x < world.width - margin; x++) {
      if (world.get(x, y) === Terrain.Water) {
        candidates.push({ x, y });
      }
    }
  }

  if (candidates.length === 0) {
    return undefined;
  }

  return candidates[Math.floor(hashToUnit(terrainSeed, 0, 0, 13) * candidates.length)];
}
