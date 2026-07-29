import type { ServerWebSocket } from "bun";
import { generateWorld } from "../../../packages/simulation/src/generation/generateWorld";
import { Simulation } from "../../../packages/simulation/src/Simulation";
import type { Action } from "../../../packages/simulation/src/actions";
import { isActionMessage, type ServerMessage, type WorldMessage } from "../../../packages/protocol/src/messages";

const PORT = Number(process.env.PORT ?? 3001);
const TICKS_PER_SECOND = 10;
const TICK_DURATION_MS = 1_000 / TICKS_PER_SECOND;
const PLAYER_ID = 1;
const WORLD_SEED = Number(process.env.WORLD_SEED ?? 20260729);

const world = generateWorld({ seed: WORLD_SEED });
const simulation = new Simulation(world);
simulation.spawnEntity(PLAYER_ID, { minSeparation: 0 });

let controllingSocket: ServerWebSocket<undefined> | undefined;
let latestAction: Action = { type: "idle" };
let latestSequence = -1;

const server = Bun.serve({
  port: PORT,
  fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === "/ws" && server.upgrade(request)) return;

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(socket) {
      // M2 has one human-controlled entity. M3 will replace this with a
      // connection/entity registry and broadcast to every connected player.
      if (controllingSocket !== undefined) {
        socket.close(1008, "M2 supports one controlling client");
        return;
      }

      controllingSocket = socket;
      latestAction = { type: "idle" };
      latestSequence = -1;
      send(socket, createWorldMessage());
      sendSnapshot(socket);
    },
    message(socket, rawMessage) {
      if (socket !== controllingSocket) return;

      const message = parseJson(rawMessage);
      if (!isActionMessage(message) || message.sequence <= latestSequence) return;

      latestSequence = message.sequence;
      latestAction = message.action;
    },
    close(socket) {
      if (socket !== controllingSocket) return;

      controllingSocket = undefined;
      latestAction = { type: "idle" };
      latestSequence = -1;
    },
  },
});

setInterval(() => {
  const actions = controllingSocket === undefined
    ? new Map()
    : new Map([[PLAYER_ID, latestAction]]);
  simulation.step({ actions });

  if (controllingSocket !== undefined) sendSnapshot(controllingSocket);
}, TICK_DURATION_MS);

console.info(`Game server listening on ws://0.0.0.0:${server.port}/ws (seed ${WORLD_SEED})`);

function createWorldMessage(): WorldMessage {
  return {
    type: "world",
    playerId: PLAYER_ID,
    seed: world.seed,
    width: world.width,
    height: world.height,
    tiles: [...world.tiles],
  };
}

function sendSnapshot(socket: ServerWebSocket<undefined>): void {
  send(socket, { type: "snapshot", ...simulation.createSnapshot() });
}

function send(socket: ServerWebSocket<undefined>, message: ServerMessage): void {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // The close callback clears ownership; snapshots are intentionally disposable.
  }
}

function parseJson(rawMessage: string | Buffer): unknown {
  try {
    return JSON.parse(rawMessage.toString());
  } catch {
    return undefined;
  }
}
