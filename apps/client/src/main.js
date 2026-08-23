import { World } from "../../../packages/simulation/src/World.ts";
import { createMovementInput } from "./input.js";
import { createMobileTrackpad } from "./mobile-trackpad.js";
import { createPerformanceMonitor } from "./performance-monitor.js";
import { createWorldView } from "./world-view.js";

const playerStatus = document.querySelector("#player-status");
const worldSeed = document.querySelector("#world-seed");
const playerName = document.querySelector("#player-name");
const inventory = document.querySelector("#inventory");
const mobileGather = document.querySelector("#mobile-gather");
const roster = document.querySelector("#player-roster");
const infoPanel = document.querySelector(".overlay");
const mobileInfoToggle = document.querySelector("#mobile-info-toggle");
const performanceMonitor = createPerformanceMonitor(
  document.querySelector("#performance-stats"),
);
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
mobileInfoToggle.addEventListener("click", () => {
  const isExpanded = infoPanel.classList.toggle("is-expanded");
  mobileInfoToggle.setAttribute("aria-expanded", String(isExpanded));
});

playerName.value = localStorage.getItem("realtime-world.display-name") ?? "";
playerName.addEventListener("change", () => {
  const displayName = playerName.value.trim();
  if (displayName.length === 0) return;

  localStorage.setItem("realtime-world.display-name", displayName);
  send({ type: "set-display-name", displayName });
});

const movementInput = createMovementInput((action) => {
  latestAction = action;
  sendAction();
});
for (const eventName of ["pointerdown", "pointerup", "pointercancel", "pointerleave"]) {
  mobileGather.addEventListener(eventName, (event) => {
    event.preventDefault();
    movementInput.setGathering(eventName === "pointerdown");
  });
}
createMobileTrackpad(
  document.querySelector("#mobile-trackpad"),
  (direction) => movementInput.setTouchDirection(direction),
);

connect();
requestAnimationFrame(render);

function render() {
  const startedAt = performance.now();
  view?.renderFrame();
  performanceMonitor.recordFrame(performance.now() - startedAt);
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
  socket.addEventListener("close", () =>
    setStatus("Disconnected · reload to reconnect"),
  );
  socket.addEventListener("error", () =>
    setStatus("Unable to reach game server"),
  );
}

function initializeWorld(message) {
  world = new World(
    message.seed,
    message.width,
    message.height,
    new Uint8Array(message.tiles),
  );
  if (typeof message.reconnectToken === "string" && message.reconnectToken.length > 0) {
    localStorage.setItem("realtime-world.reconnect-token", message.reconnectToken);
  }
  playerId = message.playerId;
  followedPlayerId = playerId;
  nextActionSequence = 0;
  worldSeed.textContent = String(world.seed);
  if (playerName.value.trim().length === 0)
    playerName.value = message.player.displayName;
  setStatus("Connected · waiting for first snapshot…");
}

function applySnapshot(message) {
  const startedAt = performance.now();
  if (world === undefined || playerId === undefined) return;

  const player = message.entities.find((entity) => entity.id === playerId);
  if (player === undefined) return;
  inventory.textContent = `Wood ${player.inventory?.wood ?? 0} · Stone ${player.inventory?.stone ?? 0}`;

  if (!message.entities.some((entity) => entity.id === followedPlayerId))
    followedPlayerId = playerId;

  if (view === undefined) {
    view = createWorldView(
      document.querySelector("#world"),
      world,
      playerId,
      message.entities,
      { predictionEnabled: new URLSearchParams(location.search).get("prediction") !== "0" },
    );
    sendAction();
  }

  const acknowledgement = message.actionAcknowledgements?.find(
    (candidate) => candidate.entityId === playerId,
  );
  view.applySnapshot(message.entities, acknowledgement);
  view.setFollowEntity(followedPlayerId);
  renderRoster(message.actors, message.entities);
  const botCount = message.actors.filter(
    (actor) => actor.kind === "bot",
  ).length;
  const playerCount = message.actors.length - botCount;
  setStatus(
    `Tile ${player.x}, ${player.y} · ${playerCount} player${playerCount === 1 ? "" : "s"} · ${botCount} bot${botCount === 1 ? "" : "s"} · server tick ${message.tick}`,
  );
  performanceMonitor.recordSnapshot(
    message.tick,
    performance.now() - startedAt,
    message.serverSentAtMs,
  );
}

function renderRoster(actors, entities) {
  const positions = new Map(entities.map((entity) => [entity.id, entity]));
  roster.replaceChildren(
    ...actors.map((player) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const position = positions.get(player.entityId);
      const isFollowed = player.entityId === followedPlayerId;
      button.type = "button";
      button.dataset.entityId = String(player.entityId);
      button.className = "roster-player";
      button.classList.toggle("is-followed", isFollowed);
      button.setAttribute("aria-pressed", String(isFollowed));
      button.textContent = `${player.entityId === playerId ? "You · " : ""}${player.displayName}${player.kind === "bot" ? " · bot" : ""}${position ? ` · ${position.x}, ${position.y}` : ""}`;
      item.append(button);
      return item;
    }),
  );
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
  const sequence = nextActionSequence++;
  send({
    type: "action",
    sequence,
    action: latestAction,
  });
  view?.setLocalAction(latestAction, sequence);
}

function send(message) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function webSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}/ws`);
  const reconnectToken = localStorage.getItem("realtime-world.reconnect-token");
  if (reconnectToken !== null) url.searchParams.set("reconnectToken", reconnectToken);
  return url.toString();
}

function parseMessage(rawMessage) {
  try {
    const message = JSON.parse(rawMessage);
    return message !== null && typeof message === "object"
      ? message
      : undefined;
  } catch {
    return undefined;
  }
}

function setStatus(text) {
  playerStatus.textContent = text;
}
