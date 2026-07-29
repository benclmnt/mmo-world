import type { Action } from "../../simulation/src/actions";
import type { SimulationSnapshot } from "../../simulation/src/state";

export interface WorldMessage {
  type: "world";
  playerId: number;
  seed: number;
  width: number;
  height: number;
  tiles: readonly number[];
}

export interface SnapshotMessage extends SimulationSnapshot {
  type: "snapshot";
}

export interface ActionMessage {
  type: "action";
  sequence: number;
  action: Action;
}

export type ServerMessage = WorldMessage | SnapshotMessage;

export function isActionMessage(value: unknown): value is ActionMessage {
  if (!isRecord(value) || value.type !== "action" || !isSequence(value.sequence)) return false;
  if (!isRecord(value.action)) return false;

  return value.action.type === "idle"
    || (value.action.type === "move" && isDirection(value.action.direction));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isDirection(value: unknown): value is "north" | "south" | "east" | "west" {
  return value === "north" || value === "south" || value === "east" || value === "west";
}
