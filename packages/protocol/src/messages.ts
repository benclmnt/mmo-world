import type { Action } from "../../simulation/src/actions";
import type { SimulationSnapshot } from "../../simulation/src/state";

export interface PlayerProfile {
  entityId: number;
  kind: "player";
  guestId: string;
  displayName: string;
}

export interface BotProfile {
  entityId: number;
  kind: "bot";
  displayName: string;
  policy: "random-walker" | "persistent-wanderer" | "obstacle-aware-wanderer";
}

export type ActorProfile = PlayerProfile | BotProfile;

export interface WorldMessage {
  type: "world";
  playerId: number;
  player: PlayerProfile;
  seed: number;
  width: number;
  height: number;
  tiles: readonly number[];
}

export interface ActionAcknowledgement {
  entityId: number;
  /** Most recent action sequence incorporated into a server simulation tick. */
  sequence: number;
  /** Whether that action moved the entity during this simulation tick. */
  movementAccepted: boolean;
}

export interface SnapshotMessage extends SimulationSnapshot {
  type: "snapshot";
  /** Server wall-clock time immediately before this snapshot was serialized. */
  serverSentAtMs?: number;
  /** Input sequences applied by this tick, keyed by player entity ID. */
  actionAcknowledgements?: readonly ActionAcknowledgement[];
  /** Profiles only for entities present in this authoritative snapshot. */
  actors: readonly ActorProfile[];
}

export interface ActionMessage {
  type: "action";
  sequence: number;
  action: Action;
}

export interface SetDisplayNameMessage {
  type: "set-display-name";
  displayName: string;
}

export type ClientMessage = ActionMessage | SetDisplayNameMessage;
export type ServerMessage = WorldMessage | SnapshotMessage;

export function isClientMessage(value: unknown): value is ClientMessage {
  return isActionMessage(value) || isSetDisplayNameMessage(value);
}

export function isActionMessage(value: unknown): value is ActionMessage {
  if (
    !isRecord(value) ||
    value.type !== "action" ||
    !isSequence(value.sequence)
  )
    return false;
  if (!isRecord(value.action)) return false;

  return (
    value.action.type === "idle" ||
    (value.action.type === "move" && isDirection(value.action.direction))
  );
}

export function isSetDisplayNameMessage(
  value: unknown,
): value is SetDisplayNameMessage {
  return (
    isRecord(value) &&
    value.type === "set-display-name" &&
    isDisplayName(value.displayName)
  );
}

/** Keeps names safe to render and bounded before they enter server state. */
export function isDisplayName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 1 &&
    value.trim().length <= 24 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function normalizeDisplayName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isDirection(
  value: unknown,
): value is "north" | "south" | "east" | "west" {
  return (
    value === "north" ||
    value === "south" ||
    value === "east" ||
    value === "west"
  );
}
