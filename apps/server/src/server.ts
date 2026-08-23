import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "../../../packages/protocol/src/messages";
import { GameRoom, type PlayerSession } from "./game-room";

const PORT = Number(process.env.PORT ?? 3001);
const TICKS_PER_SECOND = 10;
const TICK_DURATION_MS = 1_000 / TICKS_PER_SECOND;
const WORLD_SEED = Number(process.env.WORLD_SEED ?? 20260729);
const MAX_PAYLOAD_BYTES = 4 * 1024;
const BACKPRESSURE_LIMIT_BYTES = 256 * 1024;

interface SocketState {
  readonly socket: ServerWebSocket<PlayerSession>;
  backpressured: boolean;
}

const room = new GameRoom(WORLD_SEED);
const sockets = new Map<number, SocketState>();
const startedAtMs = Date.now();
const metrics = {
  acceptedMessages: 0,
  invalidMessages: 0,
  rateLimitedMessages: 0,
  snapshotsSent: 0,
  snapshotsSkipped: 0,
  backpressureEvents: 0,
  tickOverruns: 0,
  lastTickDurationMs: 0,
  maxTickDurationMs: 0,
  lastTickIntervalMs: TICK_DURATION_MS,
  maxTickIntervalMs: 0,
  lastSnapshotBuildDurationMs: 0,
  lastBroadcastDurationMs: 0,
};
let lastTickStartedAt = performance.now();

const server = Bun.serve<PlayerSession>({
  port: PORT,
  fetch(request, server) {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      return Response.json({
        status: "ok",
        tick: room.tick,
        uptimeMs: Date.now() - startedAtMs,
      });
    }
    if (pathname === "/metrics") {
      return Response.json({
        tick: room.tick,
        players: room.playerCount,
        bots: room.botCount,
        connections: sockets.size,
        uptimeMs: Date.now() - startedAtMs,
        ...metrics,
      });
    }
    if (pathname !== "/ws") return new Response("Not found", { status: 404 });

    let player: PlayerSession;
    try {
      player = room.join();
    } catch {
      return new Response("Room is full", { status: 503 });
    }

    if (server.upgrade(request, { data: player })) return;
    room.leave(player.entityId);
    return new Response("WebSocket upgrade failed", { status: 400 });
  },
  websocket: {
    maxPayloadLength: MAX_PAYLOAD_BYTES,
    backpressureLimit: BACKPRESSURE_LIMIT_BYTES,
    closeOnBackpressureLimit: true,
    open(socket) {
      sockets.set(socket.data.entityId, { socket, backpressured: false });
      send(socket.data.entityId, room.worldMessage(socket.data), false);
      send(
        socket.data.entityId,
        { ...room.snapshotMessage(), serverSentAtMs: Date.now() },
        false,
      );
      log("connection_open", {
        entityId: socket.data.entityId,
        guestId: socket.data.guestId,
      });
    },
    message(socket, rawMessage) {
      const result = room.receive(socket.data, parseJson(rawMessage));
      if (result === "accepted") metrics.acceptedMessages++;
      if (result === "invalid") metrics.invalidMessages++;
      if (result === "rate_limited") metrics.rateLimitedMessages++;
    },
    drain(socket) {
      const state = sockets.get(socket.data.entityId);
      if (state?.backpressured) {
        state.backpressured = false;
        log("socket_drain", { entityId: socket.data.entityId });
      }
    },
    close(socket) {
      if (
        !sockets.delete(socket.data.entityId) ||
        !room.leave(socket.data.entityId)
      )
        return;
      broadcastSnapshot();
      log("connection_close", {
        entityId: socket.data.entityId,
        guestId: socket.data.guestId,
      });
    },
  },
});

setInterval(() => {
  const started = performance.now();
  metrics.lastTickIntervalMs = started - lastTickStartedAt;
  metrics.maxTickIntervalMs = Math.max(
    metrics.maxTickIntervalMs,
    metrics.lastTickIntervalMs,
  );
  lastTickStartedAt = started;
  room.step();
  broadcastSnapshot();
  const durationMs = performance.now() - started;
  metrics.lastTickDurationMs = durationMs;
  metrics.maxTickDurationMs = Math.max(metrics.maxTickDurationMs, durationMs);
  if (durationMs > TICK_DURATION_MS) {
    metrics.tickOverruns++;
    log(
      "tick_overrun",
      { tick: room.tick, durationMs: round(durationMs) },
      "warn",
    );
  }
}, TICK_DURATION_MS);

log("server_started", {
  port: server.port,
  seed: WORLD_SEED,
  ticksPerSecond: TICKS_PER_SECOND,
});

function broadcastSnapshot(): void {
  const buildStartedAt = performance.now();
  const payload = JSON.stringify({
    ...room.snapshotMessage(),
    serverSentAtMs: Date.now(),
  });
  metrics.lastSnapshotBuildDurationMs = performance.now() - buildStartedAt;

  const broadcastStartedAt = performance.now();
  for (const entityId of sockets.keys()) sendSerialized(entityId, payload, true);
  metrics.lastBroadcastDurationMs = performance.now() - broadcastStartedAt;
}

function send(
  entityId: number,
  message: ServerMessage,
  disposable: boolean,
): void {
  sendSerialized(entityId, JSON.stringify(message), disposable);
}

function sendSerialized(
  entityId: number,
  payload: string,
  disposable: boolean,
): void {
  const state = sockets.get(entityId);
  if (state === undefined) return;
  if (disposable && state.backpressured) {
    metrics.snapshotsSkipped++;
    return;
  }

  try {
    const result = state.socket.send(payload);
    if (result === -1) {
      state.backpressured = true;
      metrics.backpressureEvents++;
      log("socket_backpressure", { entityId });
    } else if (result > 0 && disposable) {
      metrics.snapshotsSent++;
    }
  } catch {
    // The close callback owns cleanup. Snapshots are intentionally disposable.
  }
}

function parseJson(rawMessage: string | Buffer): unknown {
  try {
    return JSON.parse(rawMessage.toString());
  } catch {
    return undefined;
  }
}

function log(
  event: string,
  fields: Record<string, unknown>,
  level: "info" | "warn" = "info",
): void {
  console[level](
    JSON.stringify({ event, at: new Date().toISOString(), ...fields }),
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
