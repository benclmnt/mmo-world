import { World } from "../../../packages/simulation/src/World.ts";
import { createMovementInput } from "./input.js";
import { createWorldView } from "./world-view.js";

const playerStatus = document.querySelector("#player-status");
const worldSeed = document.querySelector("#world-seed");
let socket;
let playerId;
let world;
let view;
let nextActionSequence = 0;
let latestAction = { type: "idle" };

const movementInput = createMovementInput((action) => {
  latestAction = action;
  sendAction();
});

connect();

function connect() {
  setStatus("Connecting to game server…");
  socket = new WebSocket(webSocketUrl());

  socket.addEventListener("open", () => setStatus("Connected · waiting for world…"));
  socket.addEventListener("message", (event) => {
    const message = parseMessage(event.data);
    if (message === undefined) return;

    if (message.type === "world") initializeWorld(message);
    if (message.type === "snapshot") applySnapshot(message);
  });
  socket.addEventListener("close", () => setStatus("Disconnected · reload to reconnect"));
  socket.addEventListener("error", () => setStatus("Unable to reach game server"));
}

function initializeWorld(message) {
  world = new World(message.seed, message.width, message.height, new Uint8Array(message.tiles));
  playerId = message.playerId;
  worldSeed.textContent = String(world.seed);
  setStatus("Connected · waiting for first snapshot…");
}

function applySnapshot(message) {
  if (world === undefined || playerId === undefined) return;

  const player = message.entities.find((entity) => entity.id === playerId);
  if (player === undefined) return;

  if (view === undefined) {
    view = createWorldView(document.querySelector("#world"), world, player);
    sendAction();
  }

  view.applyPlayerSnapshot(player);
  setStatus(`Tile ${player.x}, ${player.y} · server tick ${message.tick}`);
}

function sendAction() {
  if (socket?.readyState !== WebSocket.OPEN || playerId === undefined) return;

  socket.send(JSON.stringify({
    type: "action",
    sequence: nextActionSequence++,
    action: latestAction,
  }));
}

function webSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function parseMessage(rawMessage) {
  try {
    const message = JSON.parse(rawMessage);
    return message !== null && typeof message === "object" ? message : undefined;
  } catch {
    return undefined;
  }
}

function setStatus(text) {
  playerStatus.textContent = text;
}
