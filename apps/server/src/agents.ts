import type {
  Action,
  Direction,
} from "../../../packages/simulation/src/actions";
import type { EntityId } from "../../../packages/simulation/src/Entity";
import { SeededRandom } from "../../../packages/simulation/src/generation/rng";
import type { AgentObservation } from "../../../packages/simulation/src/state";
import { isWalkable } from "../../../packages/simulation/src/Terrain";

export type BotPolicyName =
  "random-walker" | "persistent-wanderer" | "obstacle-aware-wanderer";

export interface BotSession {
  readonly entityId: EntityId;
  readonly displayName: string;
  readonly policy: BotPolicyName;
  readonly controller: BotController;
}

interface BotController {
  nextAction(observation: AgentObservation): Action;
}

const directions: readonly Direction[] = ["north", "east", "south", "west"];
const randomActions: readonly Action[] = [
  { type: "idle" },
  ...directions.map((direction) => ({ type: "move" as const, direction })),
];

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
        : new ObstacleAwareWanderer(random);

  return {
    entityId,
    displayName: `${policyLabel(policy)} ${ordinal + 1}`,
    policy,
    controller,
  };
}

export function policyForOrdinal(ordinal: number): BotPolicyName {
  return ["random-walker", "persistent-wanderer", "obstacle-aware-wanderer"][
    ordinal % 3
  ] as BotPolicyName;
}

class RandomWalker implements BotController {
  constructor(private readonly random: SeededRandom) {}

  nextAction(): Action {
    return randomActions[this.random.nextInt(randomActions.length)]!;
  }
}

class PersistentWanderer implements BotController {
  private direction: Direction | undefined;
  private remainingSteps = 0;

  constructor(private readonly random: SeededRandom) {}

  nextAction(): Action {
    if (this.direction === undefined || this.remainingSteps === 0) {
      this.direction = randomDirection(this.random);
      // Commit to a heading for a short, deterministic run.
      this.remainingSteps = 3 + this.random.nextInt(6);
    }
    this.remainingSteps--;
    return { type: "move", direction: this.direction };
  }
}

class ObstacleAwareWanderer implements BotController {
  constructor(private readonly random: SeededRandom) {}

  nextAction(observation: AgentObservation): Action {
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

function randomDirection(random: SeededRandom): Direction {
  return directions[random.nextInt(directions.length)]!;
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
  }
}

function seedForBot(seed: number, ordinal: number): number {
  // Keep controller RNG streams independent from spawn RNG and each other.
  return (seed + Math.imul(ordinal + 1, 0x9e3779b9)) >>> 0;
}
