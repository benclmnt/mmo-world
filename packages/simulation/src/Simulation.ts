import type { Entity, EntityId } from "./Entity";
import type { AgentObservation, SimulationSnapshot, SnapshotEntity } from "./state";
import type { Action, GatheredEvent, MovementEvent, StepInput, StepResult } from "./actions";
import { isWalkable } from "./Terrain";
import {
  createResourceNode,
  emptyInventory,
  resourceForTerrain,
  RESOURCE_REGROWTH_TICKS,
  type Inventory,
  type ResourceNode,
  type ResourceNodeSnapshot,
} from "./resources";
import { hash32, SeededRandom } from "./generation/rng";
import { chooseSpawnPosition, type SpawnOptions } from "./spawn";
import { World } from "./World";
import { directionDelta } from "./movement";

const GATHER_COOLDOWN_TICKS = 5;

/**
 * The deterministic world-state owner. Movement actions will be added next;
 * this initial slice owns entity placement, occupancy, and removal.
 */
export class Simulation {
  private readonly entityById = new Map<EntityId, Entity>();
  private readonly occupancy = new Map<number, EntityId>();
  private readonly inventoryById = new Map<EntityId, Inventory>();
  private readonly nextGatherTickById = new Map<EntityId, number>();
  private readonly resourceNodeByPosition = new Map<number, ResourceNode>();
  private readonly rng: SeededRandom;
  private readonly simulationSeed: number;
  private tickNumber = 0;

  constructor(readonly world: World, simulationSeed = world.seed) {
    this.simulationSeed = simulationSeed;
    this.rng = new SeededRandom(simulationSeed);
    this.initializeResourceNodes();
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

  getInventory(entityId: EntityId): Inventory | undefined {
    const inventory = this.inventoryById.get(entityId);
    return inventory === undefined ? undefined : { ...inventory };
  }

  setInventory(entityId: EntityId, inventory: Inventory): void {
    if (!Number.isSafeInteger(inventory.wood) || inventory.wood < 0 ||
        !Number.isSafeInteger(inventory.stone) || inventory.stone < 0) {
      throw new Error("Inventory counts must be non-negative safe integers");
    }
    if (!this.entityById.has(entityId)) {
      throw new Error(`Entity '${entityId}' does not exist`);
    }
    this.inventoryById.set(entityId, { ...inventory });
  }

  /**
   * Returns an independent, deterministic view of the dynamic state. Static
   * world terrain is intentionally omitted: it is defined once by `world`.
   */
  createSnapshot(): SimulationSnapshot {
    return {
      tick: this.tick,
      entities: this.getEntities().map((entity) => this.snapshotEntity(entity)),
      resourceNodes: this.getResourceNodeSnapshots(),
    };
  }

  /**
   * Returns the 9×9 terrain/entity window centered on an existing entity.
   * Out-of-bounds terrain cells are represented by null.
   */
  observeAgent(entityId: EntityId): AgentObservation {
    const self = this.getEntity(entityId);
    if (self === undefined) {
      throw new Error(`Entity '${entityId}' does not exist`);
    }

    const radius = 4;
    const originX = self.x - radius;
    const originY = self.y - radius;
    const terrain = [];
    for (let y = originY; y <= self.y + radius; y++) {
      for (let x = originX; x <= self.x + radius; x++) {
        terrain.push(this.world.inBounds(x, y) ? this.world.get(x, y) : null);
      }
    }

    const maxX = self.x + radius;
    const maxY = self.y + radius;
    const entities = this.getEntities().filter(
      (entity) => entity.x >= originX && entity.x <= maxX && entity.y >= originY && entity.y <= maxY,
    );

    return { tick: this.tick, self, originX, originY, terrain, entities };
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
    this.inventoryById.set(stored.id, emptyInventory());
    this.occupancy.set(this.positionKey(stored.x, stored.y), stored.id);
  }

  /**
   * Advances the world by one deterministic tick. Every entity has at most one
   * effective action; absent actions are idle. Movement resolution is based on
   * the state at the start of this tick and never depends on Map insertion order.
   */
  step(input: StepInput): StepResult {
    this.regrowDepletedResourceNodes();
    const proposals = this.collectMovementProposals(input.actions);
    const acceptedIds = this.resolveProposals(proposals);
    const events: (MovementEvent | GatheredEvent)[] = this.applyMoves(
      proposals,
      acceptedIds,
    );
    events.push(...this.applyGathers(input.actions));

    this.tickNumber++;
    return { tick: this.tickNumber, events };
  }

  removeEntity(entityId: EntityId): boolean {
    const entity = this.entityById.get(entityId);
    if (entity === undefined) {
      return false;
    }

    this.entityById.delete(entityId);
    this.inventoryById.delete(entityId);
    this.nextGatherTickById.delete(entityId);
    this.occupancy.delete(this.positionKey(entity.x, entity.y));
    return true;
  }

  private initializeResourceNodes(): void {
    for (let y = 0; y < this.world.height; y++) {
      for (let x = 0; x < this.world.width; x++) {
        const resource = resourceForTerrain(this.world.get(x, y));
        if (resource !== undefined) {
          this.resourceNodeByPosition.set(this.positionKey(x, y), createResourceNode(x, y, resource));
        }
      }
    }
  }

  private regrowDepletedResourceNodes(): void {
    for (const node of this.resourceNodeByPosition.values()) {
      if (node.regrowsAtTick === undefined || node.regrowsAtTick > this.tickNumber) continue;
      node.remaining = node.capacity;
      node.regrowsAtTick = undefined;
    }
  }

  private getResourceNodeSnapshots(): readonly ResourceNodeSnapshot[] {
    return [...this.resourceNodeByPosition.values()]
      .filter((node) => node.remaining < node.capacity)
      .sort((left, right) => left.y - right.y || left.x - right.x)
      .map((node) => ({ ...node }));
  }

  private applyGathers(actions: ReadonlyMap<EntityId, Action>): GatheredEvent[] {
    const candidatesByNode = new Map<number, GatherCandidate[]>();
    for (const entity of this.getEntities()) {
      const action = actions.get(entity.id);
      if (action?.type !== "gather") continue;
      if (this.tickNumber < (this.nextGatherTickById.get(entity.id) ?? 0)) continue;
      const source = this.gatherSource(entity, action);
      if (source === undefined) continue;
      const key = this.positionKey(source.x, source.y);
      const node = this.resourceNodeByPosition.get(key);
      if (node === undefined || node.remaining === 0) continue;
      const candidates = candidatesByNode.get(key) ?? [];
      candidates.push({ entity, node, source });
      candidatesByNode.set(key, candidates);
    }

    const winners: GatherCandidate[] = [];
    for (const candidates of [...candidatesByNode.values()].sort((left, right) =>
      left[0]!.source.y - right[0]!.source.y || left[0]!.source.x - right[0]!.source.x,
    )) {
      winners.push(...this.chooseGatherWinners(candidates));
    }

    const events: GatheredEvent[] = [];
    for (const candidate of winners.sort((left, right) => left.entity.id - right.entity.id)) {
      const { entity, node, source } = candidate;
      this.inventoryById.get(entity.id)![node.resource]++;
      node.remaining--;
      if (node.remaining === 0) node.regrowsAtTick = this.tickNumber + RESOURCE_REGROWTH_TICKS;
      this.nextGatherTickById.set(entity.id, this.tickNumber + GATHER_COOLDOWN_TICKS);
      events.push({ type: "gathered", entityId: entity.id, resource: node.resource, quantity: 1, ...source });
    }
    return events;
  }

  /** Selects scarce simultaneous gathers fairly without relying on input/Map order. */
  private chooseGatherWinners(candidates: readonly GatherCandidate[]): readonly GatherCandidate[] {
    const available = candidates[0]!.node.remaining;
    if (candidates.length <= available) return candidates;

    const shuffled = [...candidates].sort((left, right) => left.entity.id - right.entity.id);
    const source = candidates[0]!.source;
    const random = new SeededRandom(hash32(this.simulationSeed, source.x, source.y, this.tickNumber));
    for (let index = shuffled.length - 1; index > 0; index--) {
      const selected = random.nextInt(index + 1);
      [shuffled[index], shuffled[selected]] = [shuffled[selected]!, shuffled[index]!];
    }
    return shuffled.slice(0, available);
  }

  private gatherSource(entity: Entity, action: Extract<Action, { type: "gather" }>): Position | undefined {
    if (resourceForTerrain(this.world.get(entity.x, entity.y)) !== undefined) {
      return { x: entity.x, y: entity.y };
    }
    const delta = directionDelta(action.direction);
    const target = { x: entity.x + delta.x, y: entity.y + delta.y };
    return this.world.inBounds(target.x, target.y) ? target : undefined;
  }

  private snapshotEntity(entity: Entity): SnapshotEntity {
    return { ...entity, inventory: { ...this.inventoryById.get(entity.id)! } };
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
  ): MovementEvent[] {
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

interface GatherCandidate {
  entity: Entity;
  node: ResourceNode;
  source: Position;
}

interface Position {
  x: number;
  y: number;
}
