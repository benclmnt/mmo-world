import type { EntityId } from "./Entity";

export type Direction = "north" | "south" | "east" | "west";
export type Action =
  | { type: "idle" }
  | { type: "move"; direction: Direction }
  | { type: "gather"; direction: Direction }
  | { type: "attack"; direction: Direction }
  | { type: "craft-medkit" }
  | { type: "use-medkit" };
export interface StepInput { actions: ReadonlyMap<EntityId, Action>; }
export interface MovementEvent { type: "moved"; entityId: EntityId; fromX: number; fromY: number; toX: number; toY: number; }
export interface GatheredEvent { type: "gathered"; entityId: EntityId; resource: "wood" | "stone"; quantity: number; x: number; y: number; }
export interface AttackEvent { type: "attacked"; entityId: EntityId; targetId: EntityId; damage: number; }
export interface KnockedOutEvent { type: "knocked-out"; entityId: EntityId; x: number; y: number; }
export interface LootCollectedEvent { type: "loot-collected"; entityId: EntityId; lootId: number; wood: number; stone: number; }
export interface DepositedEvent { type: "deposited"; entityId: EntityId; campId: string; wood: number; stone: number; }
export interface CraftedMedkitEvent { type: "crafted-medkit"; entityId: EntityId; }
export interface UsedMedkitEvent { type: "used-medkit"; entityId: EntityId; healing: number; }
export type SimulationEvent = MovementEvent | GatheredEvent | AttackEvent | KnockedOutEvent | LootCollectedEvent | DepositedEvent | CraftedMedkitEvent | UsedMedkitEvent;
export interface StepResult { tick: number; events: readonly SimulationEvent[]; }
