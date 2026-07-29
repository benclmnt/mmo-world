import { World } from "../../../packages/simulation/src/World.ts";
import { createMovementInput } from "./input.js";
import { createWorldView } from "./world-view.js";

const playerStatus = document.querySelector("#player-status");
const worldSeed = document.querySelector("#world-seed");
const playerName = document.querySelector("#player-name");
const roster = document.querySelector("#player-roster");
let socket;
let playerId;
let world;
let view;
let nextActionSequence = 0;
let latestAction = { type: "idle" };
let followedPlayerId;

// The roster is rebuilt with each 10 Hz snapshot. Handle selection on this
// stable parent at pointer-down time, before a snapshot can replace a button
// between its pointer-down and click events.
roster.addEventListener("pointerdown", selectFollowTarget);
roster.addEventListener("click", selectFollowTarget);

playerName.value = localStorage.getItem("realtime-world.display-name") ?? "";
playerName.addEventListener("change", () => {
  const displayName = playerName.value.trim();
  if (displayName.length === 0) return;

  localStorage.setItem("realtime-world.display-name", displayName);
  send({ type: "set-display-name", displayName });
});

createMovementInput((action) => {
  latestAction = action;
  sendAction();
});

connect();
requestAnimationFrame(render);

function render() {
  view?.renderFrame();
  requestAnimationFrame(render);
}

function connect() {
  setStatus("Connecting to game server…");
  socket = new WebSocket(webSocketUrl());

  socket.addEventListener("open", () => {
    setStatus("Connected · waiting for world…");
    if (playerName.value.trim().length > 0) {
      send({ type: "set-display-name", displayName: playerName.value });
    }
  });
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
  followedPlayerId = playerId;
  nextActionSequence = 0;
  worldSeed.textContent = String(world.seed);
  if (playerName.value.trim().length === 0) playerName.value = message.player.displayName;
  setStatus("Connected · waiting for first snapshot…");
}

function applySnapshot(message) {
  if (world === undefined || playerId === undefined) return;

  const player = message.entities.find((entity) => entity.id === playerId);
  if (player === undefined) return;

  if (!message.entities.some((entity) => entity.id === followedPlayerId)) followedPlayerId = playerId;

  if (view === undefined) {
    view = createWorldView(document.querySelector("#world"), world, playerId, message.entities);
    sendAction();
  }

  view.applySnapshot(message.entities);
  view.setFollowEntity(followedPlayerId);
  renderRoster(message.players, message.entities);
  setStatus(`Tile ${player.x}, ${player.y} · ${message.players.length} player${message.players.length === 1 ? "" : "s"} · server tick ${message.tick}`);
}

function renderRoster(players, entities) {
  const positions = new Map(entities.map((entity) => [entity.id, entity]));
  roster.replaceChildren(...players.map((player) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const position = positions.get(player.entityId);
    const isFollowed = player.entityId === followedPlayerId;
    button.type = "button";
    button.dataset.entityId = String(player.entityId);
    button.className = "roster-player";
    button.classList.toggle("is-followed", isFollowed);
    button.setAttribute("aria-pressed", String(isFollowed));
    button.textContent = `${player.entityId === playerId ? "You · " : ""}${player.displayName}${position ? ` · ${position.x}, ${position.y}` : ""}`;
    item.append(button);
    return item;
  }));
}

function selectFollowTarget(event) {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest(".roster-player");
  if (button === null) return;

  const entityId = Number(button.dataset.entityId);
  if (!Number.isSafeInteger(entityId)) return;

  followedPlayerId = entityId;
  view?.setFollowEntity(entityId);
  for (const rosterButton of roster.querySelectorAll(".roster-player")) {
    const isFollowed = Number(rosterButton.dataset.entityId) === entityId;
    rosterButton.classList.toggle("is-followed", isFollowed);
    rosterButton.setAttribute("aria-pressed", String(isFollowed));
  }
}

function sendAction() {
  send({ type: "action", sequence: nextActionSequence++, action: latestAction });
}

function send(message) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
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
