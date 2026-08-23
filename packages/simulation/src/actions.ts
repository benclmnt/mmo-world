import type { EntityId } from "./Entity";

export type Direction = "north" | "south" | "east" | "west";

export type Action =
  | { type: "idle" }
  | { type: "move"; direction: Direction }
  | { type: "gather"; direction: Direction };

export interface StepInput {
  actions: ReadonlyMap<EntityId, Action>;
}

export interface MovementEvent {
  type: "moved";
  entityId: EntityId;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface GatheredEvent {
  type: "gathered";
  entityId: EntityId;
  resource: "wood" | "stone";
  quantity: number;
  x: number;
  y: number;
}

export interface StepResult {
  tick: number;
  events: readonly (MovementEvent | GatheredEvent)[];
}
