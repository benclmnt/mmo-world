import type {
  Action,
  Direction,
} from "../../../packages/simulation/src/actions";
import type { EntityId } from "../../../packages/simulation/src/Entity";
import { SeededRandom } from "../../../packages/simulation/src/generation/rng";
import type { AgentObservation } from "../../../packages/simulation/src/state";
import { isWalkable } from "../../../packages/simulation/src/Terrain";

export type BotPolicyName =
  | "random-walker"
  | "persistent-wanderer"
  | "obstacle-aware-wanderer"
  | "player-raider";

export interface BotSession {
  readonly entityId: EntityId;
  readonly displayName: string;
  readonly policy: BotPolicyName;
  readonly controller: BotController;
}

interface BotController {
  nextAction(observation: AgentObservation, playerEntityIds?: ReadonlySet<EntityId>): Action;
}

const directions: readonly Direction[] = ["north", "east", "south", "west"];

/** Builds deterministic server-side controllers; each only emits normal actions. */
export function createBot(
  entityId: EntityId,
  ordinal: number,
  seed: number,
): BotSession {
  const policy = policyForOrdinal(ordinal);
  const random = new SeededRandom(seedForBot(seed, ordinal));
  const controller =
    policy === "random-walker"
      ? new RandomWalker(random)
      : policy === "persistent-wanderer"
        ? new PersistentWanderer(random)
        : policy === "obstacle-aware-wanderer"
          ? new ObstacleAwareWanderer(random)
          : new PlayerRaider(random);

  return {
    entityId,
    displayName: `${policyLabel(policy)} ${ordinal + 1}`,
    policy,
    controller,
  };
}

export function policyForOrdinal(ordinal: number): BotPolicyName {
  return ["random-walker", "persistent-wanderer", "obstacle-aware-wanderer", "player-raider"][
    ordinal % 4
  ] as BotPolicyName;
}

class RandomWalker implements BotController {
  constructor(private readonly random: SeededRandom) {}

  nextAction(observation: AgentObservation): Action {
    const gather = gatherIfNearby(observation);
    if (gather !== undefined) return gather;
    const open = directions.filter((direction) => isOpen(observation, direction));
    if (open.length === 0) return { type: "idle" };
    // A small idle chance keeps this policy visibly distinct without wasting
    // most ticks trying to walk into trees or occupied tiles.
    if (this.random.nextInt(8) === 0) return { type: "idle" };
    return { type: "move", direction: open[this.random.nextInt(open.length)]! };
  }
}

class PersistentWanderer implements BotController {
  private direction: Direction | undefined;
  private remainingSteps = 0;

  constructor(private readonly random: SeededRandom) {}

  nextAction(observation: AgentObservation): Action {
    const gather = gatherIfNearby(observation);
    if (gather !== undefined) return gather;
    if (
      this.direction === undefined ||
      this.remainingSteps === 0 ||
      !isOpen(observation, this.direction)
    ) {
      const open = directions.filter((direction) => isOpen(observation, direction));
      if (open.length === 0) return { type: "idle" };
      this.direction = open[this.random.nextInt(open.length)]!;
      // Commit to a heading for a short, deterministic run, but immediately
      // reroute when a tree or another actor blocks that heading.
      this.remainingSteps = 3 + this.random.nextInt(6);
    }
    this.remainingSteps--;
    return { type: "move", direction: this.direction };
  }
}

class ObstacleAwareWanderer implements BotController {
  constructor(private readonly random: SeededRandom) {}

  nextAction(observation: AgentObservation): Action {
    const gather = gatherIfNearby(observation);
    if (gather !== undefined) return gather;
    // Pick afresh each tick. Holding a heading here can make two scouts keep
    // proposing the same contested tile forever, even though alternatives are
    // available. The random rotation remains deterministic per bot.
    const start = this.random.nextInt(directions.length);
    for (let offset = 0; offset < directions.length; offset++) {
      const candidate = directions[(start + offset) % directions.length]!;
      if (isOpen(observation, candidate)) {
        return { type: "move", direction: candidate };
      }
    }

    return { type: "idle" };
  }
}

class PlayerRaider implements BotController {
  constructor(private readonly random: SeededRandom) {}

  nextAction(observation: AgentObservation, playerEntityIds: ReadonlySet<EntityId> = new Set()): Action {
    const target = observation.entities
      .filter((entity) => entity.id !== observation.self.id && playerEntityIds.has(entity.id))
      .sort((left, right) => manhattan(observation.self, left) - manhattan(observation.self, right) || left.id - right.id)[0];
    if (target) {
      if (manhattan(observation.self, target) === 1) return { type: "attack", direction: directionToward(observation.self, target)! };
      const toward = directions.filter((direction) => reducesDistance(observation.self, target, direction) && isOpen(observation, direction));
      if (toward.length > 0) return { type: "move", direction: toward[this.random.nextInt(toward.length)]! };
    }
    return new ObstacleAwareWanderer(this.random).nextAction(observation);
  }
}

function gatherIfNearby(observation: AgentObservation): Action | undefined {
  // Gathering has a five-tick simulation cooldown. Spread bot attempts across
  // those ticks so a worker leaves a node between gathers instead of appearing
  // frozen while repeatedly submitting cooldown-rejected actions.
  if ((observation.tick + observation.self.id) % 5 !== 0) return undefined;
  const resourceAt = (x: number, y: number) =>
    observation.resourceNodes.some((node) => node.x === x && node.y === y);
  if (resourceAt(observation.self.x, observation.self.y)) return { type: "gather", direction: "north" };
  for (const direction of directions) {
    const delta = directionDelta(direction);
    const x = observation.self.x + delta.x, y = observation.self.y + delta.y;
    if (resourceAt(x, y)) return { type: "gather", direction };
  }
  return undefined;
}


function manhattan(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function directionToward(from: { x: number; y: number }, to: { x: number; y: number }): Direction | undefined {
  if (to.x === from.x && to.y === from.y - 1) return "north";
  if (to.x === from.x + 1 && to.y === from.y) return "east";
  if (to.x === from.x && to.y === from.y + 1) return "south";
  if (to.x === from.x - 1 && to.y === from.y) return "west";
  return undefined;
}

function reducesDistance(from: { x: number; y: number }, to: { x: number; y: number }, direction: Direction): boolean {
  const delta = directionDelta(direction);
  return Math.abs(from.x + delta.x - to.x) + Math.abs(from.y + delta.y - to.y) < manhattan(from, to);
}

function isOpen(observation: AgentObservation, direction: Direction): boolean {
  const delta = directionDelta(direction);
  const x = observation.self.x + delta.x;
  const y = observation.self.y + delta.y;
  const terrainIndex = (y - observation.originY) * 9 + x - observation.originX;
  const terrain = observation.terrain[terrainIndex];
  if (terrain === null || terrain === undefined || !isWalkable(terrain))
    return false;

  // Avoid a tile occupied at the beginning of the tick. The simulation remains
  // authoritative: another entity may still contest an otherwise open tile.
  return !observation.entities.some(
    (entity) =>
      entity.id !== observation.self.id && entity.x === x && entity.y === y,
  );
}

function directionDelta(direction: Direction): { x: number; y: number } {
  switch (direction) {
    case "north":
      return { x: 0, y: -1 };
    case "east":
      return { x: 1, y: 0 };
    case "south":
      return { x: 0, y: 1 };
    case "west":
      return { x: -1, y: 0 };
  }
}

function policyLabel(policy: BotPolicyName): string {
  switch (policy) {
    case "random-walker":
      return "Random Bot";
    case "persistent-wanderer":
      return "Wander Bot";
    case "obstacle-aware-wanderer":
      return "Scout Bot";
    case "player-raider":
      return "Raider Bot";
  }
}

function seedForBot(seed: number, ordinal: number): number {
  // Keep controller RNG streams independent from spawn RNG and each other.
  return (seed + Math.imul(ordinal + 1, 0x9e3779b9)) >>> 0;
}
