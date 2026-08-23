import { Terrain } from "./Terrain";

export type Resource = "wood" | "stone";

export interface Inventory {
  wood: number;
  stone: number;
}

export function emptyInventory(): Inventory {
  return { wood: 0, stone: 0 };
}

export function resourceForTerrain(terrain: Terrain): Resource | undefined {
  if (terrain === Terrain.Tree) return "wood";
  if (terrain === Terrain.Rock) return "stone";
  return undefined;
}
