import type { Entity, EntityId } from "./Entity";
import { Terrain, isWalkable } from "./Terrain";
import { RandomSource } from "./random";
import { World } from "./World";

export type SpawnFallback = "maximize-separation" | "reject";

export interface SpawnOptions {
  /** Manhattan-tile distance required from every existing entity. */
  minimumSeparation: number;
  /** Explicit behavior when no grass tile satisfies the requested spacing. */
  fallback: SpawnFallback;
}

/**
 * The deterministic world-state owner. Movement actions will be added next;
 * this initial slice owns entity placement, occupancy, and removal.
 */
export class Simulation {
  private readonly entityById = new Map<EntityId, Entity>();
  private readonly occupancy = new Map<number, EntityId>();
  private readonly rng: RandomSource;

  constructor(readonly world: World, simulationSeed = world.seed) {
    this.rng = new RandomSource(simulationSeed);
  }

  get entityCount(): number {
    return this.entityById.size;
  }

  getEntity(entityId: EntityId): Entity | undefined {
    const entity = this.entityById.get(entityId);
    return entity === undefined ? undefined : { ...entity };
  }

  getEntities(): readonly Entity[] {
    return [...this.entityById.values()]
      .map((entity) => ({ ...entity }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  isOccupied(x: number, y: number): boolean {
    return this.occupancy.has(this.positionKey(x, y));
  }

  /**
   * Selects a random grass tile that respects the requested separation where
   * possible. Randomness is deterministic for an equal simulation seed and
   * equal sequence of simulation calls.
   */
  spawnEntity(entityId: EntityId, spawnOptions: SpawnOptions): Entity {
    if (this.entityById.has(entityId)) {
      throw new Error(`Entity '${entityId}' already exists`);
    }

    if (!Number.isInteger(spawnOptions.minimumSeparation) || spawnOptions.minimumSeparation < 0) {
      throw new Error("minimumSeparation must be a non-negative integer");
    }

    const candidates = this.availableGrassTiles();
    if (candidates.length === 0) {
      throw new Error("No unoccupied grass tile is available for spawning");
    }

    const spacedCandidates = candidates.filter((candidate) =>
      this.minimumDistanceToEntities(candidate.x, candidate.y) >= spawnOptions.minimumSeparation,
    );

    let chosen: Position;
    if (spacedCandidates.length > 0) {
      chosen = this.rng.pick(spacedCandidates);
    } else if (spawnOptions.fallback === "maximize-separation") {
      chosen = this.chooseMostSeparated(candidates);
    } else {
      throw new Error(
        `No grass tile satisfies minimum spawn separation ${spawnOptions.minimumSeparation}`,
      );
    }

    const entity = { id: entityId, ...chosen };
    this.addEntity(entity);
    return { ...entity };
  }

  /** Adds a precisely positioned entity for controlled setup and tests. */
  addEntity(entity: Entity): void {
    if (this.entityById.has(entity.id)) {
      throw new Error(`Entity '${entity.id}' already exists`);
    }
    this.assertValidEntityPosition(entity.x, entity.y);

    const stored = { ...entity };
    this.entityById.set(stored.id, stored);
    this.occupancy.set(this.positionKey(stored.x, stored.y), stored.id);
  }

  removeEntity(entityId: EntityId): boolean {
    const entity = this.entityById.get(entityId);
    if (entity === undefined) {
      return false;
    }

    this.entityById.delete(entityId);
    this.occupancy.delete(this.positionKey(entity.x, entity.y));
    return true;
  }

  private availableGrassTiles(): Position[] {
    const candidates: Position[] = [];
    for (let y = 0; y < this.world.height; y++) {
      for (let x = 0; x < this.world.width; x++) {
        if (this.world.get(x, y) === Terrain.Grass && !this.isOccupied(x, y)) {
          candidates.push({ x, y });
        }
      }
    }
    return candidates;
  }

  private chooseMostSeparated(candidates: readonly Position[]): Position {
    let greatestDistance = -1;
    const best: Position[] = [];

    for (const candidate of candidates) {
      const distance = this.minimumDistanceToEntities(candidate.x, candidate.y);
      if (distance > greatestDistance) {
        greatestDistance = distance;
        best.length = 0;
        best.push(candidate);
      } else if (distance === greatestDistance) {
        best.push(candidate);
      }
    }

    return this.rng.pick(best);
  }

  private minimumDistanceToEntities(x: number, y: number): number {
    if (this.entityById.size === 0) {
      return Number.POSITIVE_INFINITY;
    }

    let minimum = Number.POSITIVE_INFINITY;
    for (const entity of this.entityById.values()) {
      minimum = Math.min(minimum, Math.abs(entity.x - x) + Math.abs(entity.y - y));
    }
    return minimum;
  }

  private assertValidEntityPosition(x: number, y: number): void {
    if (!this.world.inBounds(x, y)) {
      throw new Error(`Entity position (${x}, ${y}) is outside the world`);
    }
    if (!isWalkable(this.world.get(x, y))) {
      throw new Error(`Entity position (${x}, ${y}) is blocked`);
    }
    if (this.isOccupied(x, y)) {
      throw new Error(`Entity position (${x}, ${y}) is occupied`);
    }
  }

  private positionKey(x: number, y: number): number {
    return y * this.world.width + x;
  }
}

interface Position {
  x: number;
  y: number;
}
