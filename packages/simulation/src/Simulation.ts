import type { Entity, EntityId } from "./Entity";
import type { Action, MovementEvent, StepInput, StepResult } from "./actions";
import { isWalkable } from "./Terrain";
import { SeededRandom } from "./generation/rng";
import { chooseSpawnPosition, type SpawnOptions } from "./spawn";
import { World } from "./World";
import { directionDelta } from "./movement";

/**
 * The deterministic world-state owner. Movement actions will be added next;
 * this initial slice owns entity placement, occupancy, and removal.
 */
export class Simulation {
  private readonly entityById = new Map<EntityId, Entity>();
  private readonly occupancy = new Map<number, EntityId>();
  private readonly rng: SeededRandom;
  private tickNumber = 0;

  constructor(readonly world: World, simulationSeed = world.seed) {
    this.rng = new SeededRandom(simulationSeed);
  }

  get tick(): number {
    return this.tickNumber;
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
      .sort((left, right) => left.id - right.id);
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
    this.assertValidEntityId(entityId);
    if (this.entityById.has(entityId)) {
      throw new Error(`Entity '${entityId}' already exists`);
    }

    const position = chooseSpawnPosition(this.world, this.entityById, this.rng, options);
    if (position === undefined) {
      throw new Error("No eligible grass tile is available for spawning");
    }

    const entity = { id: entityId, ...position };
    this.placeEntity(entity);
    return { ...entity };
  }

  /** Places an entity at a precisely validated position for setup and tests. */
  placeEntity(entity: Entity): void {
    this.assertValidEntityId(entity.id);
    if (this.entityById.has(entity.id)) {
      throw new Error(`Entity '${entity.id}' already exists`);
    }
    this.assertValidEntityPosition(entity.x, entity.y);

    const stored = { ...entity };
    this.entityById.set(stored.id, stored);
    this.occupancy.set(this.positionKey(stored.x, stored.y), stored.id);
  }

  /**
   * Advances the world by one deterministic tick. Every entity has at most one
   * effective action; absent actions are idle. Movement resolution is based on
   * the state at the start of this tick and never depends on Map insertion order.
   */
  step(input: StepInput): StepResult {
    const proposals = this.collectMovementProposals(input.actions);
    const acceptedIds = this.resolveProposals(proposals);
    const events = this.applyMoves(proposals, acceptedIds);

    this.tickNumber++;
    return { tick: this.tickNumber, events };
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

  private collectMovementProposals(actions: ReadonlyMap<EntityId, Action>): Map<EntityId, Position> {
    const proposals = new Map<EntityId, Position>();

    for (const entity of this.getEntities()) {
      const action = actions.get(entity.id);
      if (action?.type !== "move") {
        continue;
      }

      const delta = directionDelta(action.direction);
      const target = { x: entity.x + delta.x, y: entity.y + delta.y };
      if (this.world.inBounds(target.x, target.y) && isWalkable(this.world.get(target.x, target.y))) {
        proposals.set(entity.id, target);
      }
    }

    return proposals;
  }

  private resolveProposals(proposals: ReadonlyMap<EntityId, Position>): ReadonlySet<EntityId> {
    const rejected = new Set<EntityId>();
    const moversByDestination = new Map<number, EntityId[]>();

    for (const [entityId, target] of proposals) {
      const key = this.positionKey(target.x, target.y);
      const movers = moversByDestination.get(key) ?? [];
      movers.push(entityId);
      moversByDestination.set(key, movers);
    }

    // Multiple entities requesting one destination are all rejected.
    for (const movers of moversByDestination.values()) {
      if (movers.length > 1) {
        for (const entityId of movers) {
          rejected.add(entityId);
        }
      }
    }

    // A direct A <-> B exchange is explicitly disallowed.
    for (const [entityId, target] of proposals) {
      if (rejected.has(entityId)) {
        continue;
      }

      const occupantId = this.occupancy.get(this.positionKey(target.x, target.y));
      const entity = this.entityById.get(entityId)!;
      const occupantTarget = occupantId === undefined ? undefined : proposals.get(occupantId);
      if (
        occupantId !== undefined &&
        occupantTarget !== undefined &&
        occupantTarget.x === entity.x &&
        occupantTarget.y === entity.y
      ) {
        rejected.add(entityId);
        rejected.add(occupantId);
      }
    }

    const candidates = new Set(
      [...proposals.keys()].filter((entityId) => !rejected.has(entityId)),
    );
    const states = new Map<EntityId, "accepted" | "rejected" | "resolving">();

    const resolve = (entityId: EntityId, path: EntityId[]): boolean => {
      const state = states.get(entityId);
      if (state === "accepted") return true;
      if (state === "rejected") return false;
      if (state === "resolving") {
        // Direct swaps were removed above. A remaining cycle has 3+ entities,
        // and every member successfully vacates the next member's tile.
        const cycleStart = path.indexOf(entityId);
        for (const cycleEntityId of path.slice(cycleStart)) {
          states.set(cycleEntityId, "accepted");
        }
        return true;
      }

      states.set(entityId, "resolving");
      path.push(entityId);
      const target = proposals.get(entityId)!;
      const occupantId = this.occupancy.get(this.positionKey(target.x, target.y));

      let accepted: boolean;
      if (occupantId === undefined) {
        accepted = true;
      } else if (!candidates.has(occupantId)) {
        accepted = false;
      } else {
        accepted = resolve(occupantId, path);
      }

      path.pop();
      if (states.get(entityId) !== "accepted") {
        states.set(entityId, accepted ? "accepted" : "rejected");
      }
      return states.get(entityId) === "accepted";
    };

    for (const entityId of [...candidates].sort((left, right) => left - right)) {
      resolve(entityId, []);
    }

    return new Set(
      [...candidates].filter((entityId) => states.get(entityId) === "accepted"),
    );
  }

  private applyMoves(
    proposals: ReadonlyMap<EntityId, Position>,
    acceptedIds: ReadonlySet<EntityId>,
  ): readonly MovementEvent[] {
    const events: MovementEvent[] = [];

    for (const entityId of acceptedIds) {
      const entity = this.entityById.get(entityId)!;
      this.occupancy.delete(this.positionKey(entity.x, entity.y));
    }

    for (const entityId of [...acceptedIds].sort((left, right) => left - right)) {
      const entity = this.entityById.get(entityId)!;
      const target = proposals.get(entityId)!;
      const fromX = entity.x;
      const fromY = entity.y;
      entity.x = target.x;
      entity.y = target.y;
      this.occupancy.set(this.positionKey(entity.x, entity.y), entityId);
      events.push({ type: "moved", entityId, fromX, fromY, toX: entity.x, toY: entity.y });
    }

    return events;
  }

  private assertValidEntityId(entityId: EntityId): void {
    if (!Number.isSafeInteger(entityId) || entityId < 0) {
      throw new Error("Entity ID must be a non-negative safe integer");
    }
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
