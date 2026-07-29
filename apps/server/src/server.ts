import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "../../../packages/protocol/src/messages";
import { GameRoom, type PlayerSession } from "./game-room";

const PORT = Number(process.env.PORT ?? 3001);
const TICKS_PER_SECOND = 10;
const TICK_DURATION_MS = 1_000 / TICKS_PER_SECOND;
const WORLD_SEED = Number(process.env.WORLD_SEED ?? 20260729);

const room = new GameRoom(WORLD_SEED);
const sockets = new Map<number, ServerWebSocket<PlayerSession>>();

const server = Bun.serve<PlayerSession>({
  port: PORT,
  fetch(request, server) {
    if (new URL(request.url).pathname !== "/ws") {
      return new Response("Not found", { status: 404 });
    }

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
    open(socket) {
      sockets.set(socket.data.entityId, socket);
      send(socket, room.worldMessage(socket.data));
      broadcastSnapshot();
      console.info(`${socket.data.guestId} joined as entity ${socket.data.entityId}`);
    },
    message(socket, rawMessage) {
      room.receive(socket.data, parseJson(rawMessage));
    },
    close(socket) {
      if (!sockets.delete(socket.data.entityId) || !room.leave(socket.data.entityId)) return;
      broadcastSnapshot();
      console.info(`${socket.data.guestId} left entity ${socket.data.entityId}`);
    },
  },
});

setInterval(() => {
  room.step();
  broadcastSnapshot();
}, TICK_DURATION_MS);

console.info(`Game server listening on ws://0.0.0.0:${server.port}/ws (seed ${WORLD_SEED})`);

function broadcastSnapshot(): void {
  const snapshot = room.snapshotMessage();
  for (const socket of sockets.values()) send(socket, snapshot);
}

function send(socket: ServerWebSocket<PlayerSession>, message: ServerMessage): void {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // Snapshots are disposable. The close callback performs lifecycle cleanup.
  }
}

function parseJson(rawMessage: string | Buffer): unknown {
  try {
    return JSON.parse(rawMessage.toString());
  } catch {
    return undefined;
  }
}
