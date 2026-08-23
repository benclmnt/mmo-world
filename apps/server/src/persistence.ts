import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { Inventory } from "../../../packages/simulation/src/resources";
import { emptyInventory } from "../../../packages/simulation/src/resources";

const ROOM_ID = 1;
const RECONNECT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export interface PersistentIdentity {
  playerId: string;
  displayName: string;
  inventory: Inventory;
  reconnectToken: string;
  resumed: boolean;
}

type StoredIdentity = { playerId: string; displayName: string; wood: number; stone: number };

/**
 * Durable identity and per-player inventory. Authoritative positions, ticks,
 * actions, snapshots, and resource nodes remain in memory.
 */
export class PersistenceStore {
  private readonly database: Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path, { create: true, strict: true });
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  roomSeed(configuredSeed: number): number {
    const nowMs = Date.now();
    this.database
      .query("INSERT OR IGNORE INTO rooms (id, seed, created_at_ms) VALUES (?, ?, ?)")
      .run(ROOM_ID, configuredSeed, nowMs);
    const room = this.database
      .query<{ seed: number }, [number]>("SELECT seed FROM rooms WHERE id = ?")
      .get(ROOM_ID);
    if (room === null) throw new Error("Failed to initialize the default room");
    return room.seed;
  }

  authenticate(reconnectToken: string | null): PersistentIdentity {
    const nowMs = Date.now();
    const previous = reconnectToken === null ? null : this.findToken(reconnectToken, nowMs);
    const identity = previous ?? this.createPlayer(nowMs);
    const nextToken = createToken();

    this.database.query("DELETE FROM reconnect_tokens WHERE player_id = ?").run(identity.playerId);
    this.database
      .query(
        "INSERT INTO reconnect_tokens (token_hash, player_id, expires_at_ms, created_at_ms, last_used_at_ms) VALUES (?, ?, ?, ?, ?)",
      )
      .run(hashToken(nextToken), identity.playerId, nowMs + RECONNECT_TOKEN_TTL_MS, nowMs, nowMs);

    return {
      ...identity,
      inventory: { wood: identity.wood, stone: identity.stone },
      reconnectToken: nextToken,
      resumed: previous !== null,
    };
  }

  updateDisplayName(playerId: string, displayName: string): void {
    this.database
      .query("UPDATE players SET display_name = ?, updated_at_ms = ? WHERE id = ?")
      .run(displayName, Date.now(), playerId);
  }

  updateInventory(playerId: string, inventory: Inventory): void {
    if (!isInventory(inventory)) throw new Error("Invalid inventory");
    this.database
      .query("UPDATE player_resources SET wood = ?, stone = ?, updated_at_ms = ? WHERE player_id = ?")
      .run(inventory.wood, inventory.stone, Date.now(), playerId);
  }

  openSession(playerId: string, entityId: number): string {
    const id = randomUUID();
    this.database
      .query(
        "INSERT INTO sessions (id, player_id, room_id, entity_id, connected_at_ms) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, playerId, ROOM_ID, entityId, Date.now());
    return id;
  }

  closeSession(sessionId: string | undefined): void {
    if (sessionId === undefined) return;
    this.database
      .query("UPDATE sessions SET disconnected_at_ms = ? WHERE id = ? AND disconnected_at_ms IS NULL")
      .run(Date.now(), sessionId);
  }

  close(): void {
    this.database.close();
  }

  private findToken(token: string, nowMs: number): StoredIdentity | null {
    if (!isTokenShape(token)) return null;
    const row = this.database
      .query<StoredIdentity, [string, number]>(
        `SELECT players.id AS playerId, players.display_name AS displayName,
                player_resources.wood AS wood, player_resources.stone AS stone
         FROM reconnect_tokens
         JOIN players ON players.id = reconnect_tokens.player_id
         JOIN player_resources ON player_resources.player_id = players.id
         WHERE reconnect_tokens.token_hash = ? AND reconnect_tokens.expires_at_ms > ?`,
      )
      .get(hashToken(token), nowMs);
    return row ?? null;
  }

  private createPlayer(nowMs: number): StoredIdentity {
    const playerId = `player-${randomUUID()}`;
    const displayName = "Guest";
    const inventory = emptyInventory();
    this.database.transaction(() => {
      this.database
        .query("INSERT INTO players (id, display_name, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?)")
        .run(playerId, displayName, nowMs, nowMs);
      this.database
        .query("INSERT INTO player_resources (player_id, wood, stone, updated_at_ms) VALUES (?, ?, ?, ?)")
        .run(playerId, inventory.wood, inventory.stone, nowMs);
    })();
    return { playerId, displayName, ...inventory };
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        seed INTEGER NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS player_resources (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        wood INTEGER NOT NULL DEFAULT 0 CHECK (wood >= 0),
        stone INTEGER NOT NULL DEFAULT 0 CHECK (stone >= 0),
        updated_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reconnect_tokens (
        token_hash TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        expires_at_ms INTEGER NOT NULL,
        created_at_ms INTEGER NOT NULL,
        last_used_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS reconnect_tokens_player_id_idx ON reconnect_tokens(player_id);
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id),
        room_id INTEGER NOT NULL REFERENCES rooms(id),
        entity_id INTEGER NOT NULL,
        connected_at_ms INTEGER NOT NULL,
        disconnected_at_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS sessions_player_id_idx ON sessions(player_id);
    `);
    // Backfill identities created before player_resources was introduced.
    this.database.exec(`
      INSERT OR IGNORE INTO player_resources (player_id, wood, stone, updated_at_ms)
      SELECT id, 0, 0, 0 FROM players;
    `);
  }
}

function isInventory(inventory: Inventory): boolean {
  return Number.isSafeInteger(inventory.wood) && inventory.wood >= 0 &&
    Number.isSafeInteger(inventory.stone) && inventory.stone >= 0;
}

function createToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
