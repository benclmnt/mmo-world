import { Terrain } from "./Terrain";

export type Resource = "wood" | "stone";

export interface Inventory {
  wood: number;
  stone: number;
}

export function emptyInventory(): Inventory {
  return { wood: 0, stone: 0 };
}

export const RESOURCE_NODE_CAPACITY: Readonly<Record<Resource, number>> = {
  wood: 3,
  stone: 4,
};

export const RESOURCE_REGROWTH_TICKS = 100;

/** Dynamic state for a terrain-backed resource node. */
export interface ResourceNode {
  x: number;
  y: number;
  resource: Resource;
  remaining: number;
  capacity: number;
  /** Set only while fully depleted; measured in simulation ticks. */
  regrowsAtTick?: number;
}

/** Snapshot form; only nodes below capacity are transmitted. */
export type ResourceNodeSnapshot = Readonly<ResourceNode>;

export function createResourceNode(x: number, y: number, resource: Resource): ResourceNode {
  const capacity = RESOURCE_NODE_CAPACITY[resource];
  return { x, y, resource, remaining: capacity, capacity };
}

export function resourceForTerrain(terrain: Terrain): Resource | undefined {
  if (terrain === Terrain.Tree) return "wood";
  if (terrain === Terrain.Rock) return "stone";
  return undefined;
}
