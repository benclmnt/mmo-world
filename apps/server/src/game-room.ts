import { generateWorld } from "../../../packages/simulation/src/generation/generateWorld";
import { Simulation } from "../../../packages/simulation/src/Simulation";
import type { Action } from "../../../packages/simulation/src/actions";
import {
  isActionMessage,
  isSetDisplayNameMessage,
  normalizeDisplayName,
  type PlayerProfile,
  type SnapshotMessage,
  type WorldMessage,
} from "../../../packages/protocol/src/messages";

export type PlayerSession = {
  readonly entityId: number;
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
  private readonly players = new Map<number, PlayerSession>();
  private nextEntityId = 1;

  constructor(seed: number) {
    this.world = generateWorld({ seed });
    this.simulation = new Simulation(this.world);
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

  leave(entityId: number): boolean {
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
      player.displayName = this.uniqueDisplayName(normalizeDisplayName(rawMessage.displayName), player.entityId);
    }
  }

  step(): void {
    const actions = new Map<number, Action>();
    for (const player of this.players.values()) actions.set(player.entityId, player.latestAction);
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
      players: [...this.players.values()]
        .map((player) => this.profileFor(player))
        .sort((left, right) => left.entityId - right.entityId),
    };
  }

  private profileFor(player: PlayerSession): PlayerProfile {
    return {
      entityId: player.entityId,
      guestId: player.guestId,
      displayName: player.displayName,
    };
  }

  private uniqueDisplayName(requestedName: string, entityId: number): string {
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
