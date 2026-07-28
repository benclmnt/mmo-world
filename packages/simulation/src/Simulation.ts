import type { Entity, EntityId } from "./Entity";
import { isWalkable } from "./Terrain";
import { SeededRandom } from "./generation/rng";
import { chooseSpawnPosition, type SpawnOptions } from "./spawn";
import { World } from "./World";

/**
 * The deterministic world-state owner. Movement actions will be added next;
 * this initial slice owns entity placement, occupancy, and removal.
 */
export class Simulation {
  private readonly entityById = new Map<EntityId, Entity>();
  private readonly occupancy = new Map<number, EntityId>();
  private readonly rng: SeededRandom;

  constructor(readonly world: World, simulationSeed = world.seed) {
    this.rng = new SeededRandom(simulationSeed);
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
   * Chooses a random eligible grass tile. The shared spawn selector enforces
   * the explicit minimum-separation policy and returns no position when that
   * policy cannot be satisfied.
   */
  spawnEntity(entityId: EntityId, options: SpawnOptions): Entity {
    if (this.entityById.has(entityId)) {
      throw new Error(`Entity '${entityId}' already exists`);
    }

    const position = chooseSpawnPosition(this.world, this.entityById, this.rng, options);
    if (position === undefined) {
      throw new Error("No eligible grass tile is available for spawning");
    }

    const entity = { id: entityId, ...position };
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
