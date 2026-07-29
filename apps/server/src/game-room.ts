import type { EntityId } from "../../../packages/simulation/src/Entity";
import { createBot, type BotSession } from "./agents";
import { generateWorld } from "../../../packages/simulation/src/generation/generateWorld";
import { Simulation } from "../../../packages/simulation/src/Simulation";
import type { Action } from "../../../packages/simulation/src/actions";
import {
  isActionMessage,
  isSetDisplayNameMessage,
  normalizeDisplayName,
  type ActorProfile,
  type PlayerProfile,
  type SnapshotMessage,
  type WorldMessage,
} from "../../../packages/protocol/src/messages";

const FIRST_BOT_ENTITY_ID = 1_000_000;

export interface GameRoomOptions {
  /** Number of deterministic server-controlled agents to add at room creation. */
  botCount?: number;
}

export type PlayerSession = {
  readonly entityId: EntityId;
  readonly guestId: string;
  displayName: string;
  latestAction: Action;
  latestSequence: number;
};

/**
 * Owns one room's player lifecycle and simulation-facing state. Socket I/O and
 * scheduling intentionally stay outside this class so the room remains simple
 * to test and can later be hosted by a different transport.
 */
export class GameRoom {
  private readonly world;
  private readonly simulation;
  private readonly players = new Map<EntityId, PlayerSession>();
  private readonly bots = new Map<EntityId, BotSession>();
  private nextEntityId: EntityId = 1;

  constructor(seed: number, { botCount = 20 }: GameRoomOptions = {}) {
    if (!Number.isSafeInteger(botCount) || botCount < 0) {
      throw new Error("Bot count must be a non-negative safe integer");
    }
    this.world = generateWorld({ seed });
    this.simulation = new Simulation(this.world);

    for (let ordinal = 0; ordinal < botCount; ordinal++) {
      const entityId = FIRST_BOT_ENTITY_ID + ordinal;
      const bot = createBot(entityId, ordinal, seed);
      this.simulation.spawnEntity(entityId, { minSeparation: 2 });
      this.bots.set(entityId, bot);
    }
  }

  join(): PlayerSession {
    const entityId = this.nextEntityId++;
    const player: PlayerSession = {
      entityId,
      guestId: `guest-${entityId}`,
      displayName: `Guest ${entityId}`,
      latestAction: { type: "idle" },
      latestSequence: -1,
    };

    this.simulation.spawnEntity(entityId, { minSeparation: 0 });
    this.players.set(entityId, player);
    return player;
  }

  leave(entityId: EntityId): boolean {
    if (!this.players.delete(entityId)) return false;
    this.simulation.removeEntity(entityId);
    return true;
  }

  receive(player: PlayerSession, rawMessage: unknown): void {
    if (isActionMessage(rawMessage)) {
      if (rawMessage.sequence > player.latestSequence) {
        player.latestSequence = rawMessage.sequence;
        player.latestAction = rawMessage.action;
      }
      return;
    }

    if (isSetDisplayNameMessage(rawMessage)) {
      player.displayName = this.uniqueDisplayName(
        normalizeDisplayName(rawMessage.displayName),
        player.entityId,
      );
    }
  }

  step(): void {
    const actions = new Map<EntityId, Action>();
    for (const player of this.players.values())
      actions.set(player.entityId, player.latestAction);
    for (const bot of this.bots.values()) {
      actions.set(
        bot.entityId,
        bot.controller.nextAction(this.simulation.observeAgent(bot.entityId)),
      );
    }
    this.simulation.step({ actions });
  }

  worldMessage(player: PlayerSession): WorldMessage {
    return {
      type: "world",
      playerId: player.entityId,
      player: this.profileFor(player),
      seed: this.world.seed,
      width: this.world.width,
      height: this.world.height,
      tiles: [...this.world.tiles],
    };
  }

  snapshotMessage(): SnapshotMessage {
    return {
      type: "snapshot",
      ...this.simulation.createSnapshot(),
      actors: [
        ...[...this.players.values()].map((player) => this.profileFor(player)),
        ...[...this.bots.values()].map((bot) => this.profileForBot(bot)),
      ].sort((left, right) => left.entityId - right.entityId),
    };
  }

  private profileFor(player: PlayerSession): PlayerProfile {
    return {
      entityId: player.entityId,
      kind: "player",
      guestId: player.guestId,
      displayName: player.displayName,
    };
  }

  private profileForBot(bot: BotSession): ActorProfile {
    return {
      entityId: bot.entityId,
      kind: "bot",
      displayName: bot.displayName,
      policy: bot.policy,
    };
  }

  private uniqueDisplayName(requestedName: string, entityId: EntityId): string {
    const taken = new Set(
      [...this.players.values()]
        .filter((player) => player.entityId !== entityId)
        .map((player) => player.displayName.toLocaleLowerCase()),
    );
    if (!taken.has(requestedName.toLocaleLowerCase())) return requestedName;

    for (let suffix = 2; ; suffix++) {
      const candidate = `${requestedName} ${suffix}`;
      if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
    }
  }
}
