import type { Entity } from "./Entity";
import type { Terrain } from "./Terrain";
import type { Inventory, ResourceNodeSnapshot } from "./resources";

export interface PrivateInventory { unsecuredPack: Inventory; securedStash: Inventory; }

export interface SnapshotEntity extends Entity {
  health: number;
  facing: "north" | "south" | "east" | "west";
  knockedOut: boolean;
  respawnsAtTick?: number;
  protected: boolean;
  /** Included only in the recipient's personalized snapshot. */
  inventory?: PrivateInventory;
}
export interface LootPileSnapshot { id: number; x: number; y: number; wood: number; stone: number; expiresAtTick: number; }
export interface SimulationSnapshot { tick: number; entities: readonly SnapshotEntity[]; resourceNodes: readonly ResourceNodeSnapshot[]; lootPiles: readonly LootPileSnapshot[]; }
export interface AgentObservation { tick: number; self: Entity; originX: number; originY: number; terrain: readonly (Terrain | null)[]; resourceNodes: readonly ResourceNodeSnapshot[]; entities: readonly Entity[]; }
