import { Terrain } from "./Terrain";

export type Resource = "wood" | "stone";
export interface Inventory { wood: number; stone: number; }
export function emptyInventory(): Inventory { return { wood: 0, stone: 0 }; }
export function copyInventory(inventory: Inventory): Inventory { return { ...inventory }; }
export function addInventory(target: Inventory, source: Inventory): void { target.wood += source.wood; target.stone += source.stone; }
export function takeFraction(inventory: Inventory, numerator: number, denominator: number): Inventory {
  const result = { wood: Math.floor(inventory.wood * numerator / denominator), stone: Math.floor(inventory.stone * numerator / denominator) };
  inventory.wood -= result.wood; inventory.stone -= result.stone;
  return result;
}
export const RESOURCE_NODE_CAPACITY: Readonly<Record<Resource, number>> = { wood: 3, stone: 4 };
export const RESOURCE_REGROWTH_TICKS = 100;
export interface ResourceNode { x: number; y: number; resource: Resource; remaining: number; capacity: number; regrowsAtTick?: number; }
export type ResourceNodeSnapshot = Readonly<ResourceNode>;
export function createResourceNode(x: number, y: number, resource: Resource): ResourceNode { const capacity = RESOURCE_NODE_CAPACITY[resource]; return { x, y, resource, remaining: capacity, capacity }; }
export function resourceForTerrain(terrain: Terrain): Resource | undefined { if (terrain === Terrain.Tree) return "wood"; if (terrain === Terrain.Rock) return "stone"; return undefined; }
