import { Terrain } from "../../../packages/simulation/src/Terrain.ts";
import { directionDelta } from "../../../packages/simulation/src/movement.ts";
import { World } from "../../../packages/simulation/src/World.ts";
import { createMovementInput } from "./input.js";
import { createMobileTrackpad } from "./mobile-trackpad.js";
import { createPerformanceMonitor } from "./performance-monitor.js";
import { createWorldView } from "./world-view.js";

const playerStatus = document.querySelector("#player-status");
const respawnNotice = document.querySelector("#respawn-notice");
const respawnCountdown = document.querySelector("#respawn-countdown");
const playerName = document.querySelector("#player-name");
const inventory = document.querySelector("#inventory");
const gatherStatus = document.querySelector("#gather-status");
const mobileGather = document.querySelector("#mobile-gather");
const mobileAttack = document.querySelector("#mobile-attack");
const mobileCraft = document.querySelector("#mobile-craft");
const mobileHeal = document.querySelector("#mobile-heal");
const craftMedkit = document.querySelector("#craft-medkit");
const craftHonedWeapon = document.querySelector("#craft-honed-weapon");
const roster = document.querySelector("#player-roster");
const botSummary = document.querySelector("#bot-summary");
const infoPanel = document.querySelector(".overlay");
const mobileInfoToggle = document.querySelector("#mobile-info-toggle");
const shortcutsDialog = document.querySelector("#shortcuts-dialog");
const shortcutsToggle = document.querySelector("#shortcuts-toggle");
const shortcutsClose = document.querySelector("#shortcuts-close");
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
shortcutsToggle.addEventListener("click", showShortcuts);
shortcutsClose.addEventListener("click", () => shortcutsDialog.close());
shortcutsDialog.addEventListener("click", (event) => {
  if (event.target === shortcutsDialog) shortcutsDialog.close();
});
window.addEventListener("keydown", (event) => {
  if (event.key !== "?" || event.repeat || isTyping(event.target)) return;
  event.preventDefault();
  if (shortcutsDialog.open) shortcutsDialog.close();
  else showShortcuts();
});

window.addEventListener("keydown", (event) => {
  if (isTyping(event.target) || event.repeat) return;
  if (event.code === "KeyQ") { event.preventDefault(); sendOneShotAction({ type: "craft-medkit" }); }
  if (event.code === "KeyC") { event.preventDefault(); sendOneShotAction({ type: "craft-honed-weapon" }); }
  if (event.code === "KeyX") { event.preventDefault(); sendOneShotAction({ type: "use-medkit" }); }
});
craftMedkit.addEventListener("click", () => sendOneShotAction({ type: "craft-medkit" }));
craftHonedWeapon.addEventListener("click", () => sendOneShotAction({ type: "craft-honed-weapon" }));
mobileCraft.addEventListener("click", () => {
  infoPanel.classList.add("is-expanded");
  mobileInfoToggle.setAttribute("aria-expanded", "true");
});
mobileHeal.addEventListener("click", () => sendOneShotAction({ type: "use-medkit" }));

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
for (const [button, setter] of [[mobileGather, "setGathering"], [mobileAttack, "setAttacking"]]) {
  for (const eventName of ["pointerdown", "pointerup", "pointercancel", "pointerleave"]) {
    button.addEventListener(eventName, (event) => { event.preventDefault(); movementInput[setter](eventName === "pointerdown"); });
  }
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
  world.setCamps(message.camps ?? []);
  if (typeof message.reconnectToken === "string" && message.reconnectToken.length > 0) {
    localStorage.setItem("realtime-world.reconnect-token", message.reconnectToken);
  }
  playerId = message.playerId;
  followedPlayerId = playerId;
  nextActionSequence = 0;
  if (playerName.value.trim().length === 0)
    playerName.value = message.player.displayName;
  setStatus("Connected · waiting for first snapshot…");
}

function applySnapshot(message) {
  const startedAt = performance.now();
  if (world === undefined || playerId === undefined) return;

  const player = message.entities.find((entity) => entity.id === playerId);
  if (player === undefined) return;
  const pack = player.inventory?.unsecuredPack ?? { wood: 0, stone: 0 };
  const stash = player.inventory?.securedStash ?? { wood: 0, stone: 0 };
  const medkits = player.inventory?.medkits ?? 0;
  const honedWeaponCharges = player.inventory?.honedWeaponCharges ?? 0;
  inventory.textContent = `Pack: W ${pack.wood} · S ${pack.stone}  |  Stash: W ${stash.wood} · S ${stash.stone}  |  Medkits: ${medkits} · Honed hits: ${honedWeaponCharges}`;
  const atCamp = isAtCamp(player);
  craftMedkit.disabled = player.knockedOut || !atCamp || stash.wood < 3 || stash.stone < 2;
  craftHonedWeapon.disabled = player.knockedOut || !atCamp || stash.wood < 4 || stash.stone < 4;
  mobileCraft.disabled = player.knockedOut || !atCamp;
  updateGatherStatus(player, message.resourceNodes ?? [], message.tick);

  if (!message.entities.some((entity) => entity.id === followedPlayerId))
    followedPlayerId = playerId;

  if (view === undefined) {
    view = createWorldView(
      document.querySelector("#world"),
      world,
      playerId,
      message.entities,
      message.actors,
      { predictionEnabled: new URLSearchParams(location.search).get("prediction") !== "0" },
    );
    sendAction();
  }

  const acknowledgement = message.actionAcknowledgements?.find(
    (candidate) => candidate.entityId === playerId,
  );
  view.applySnapshot(message.entities, message.resourceNodes ?? [], acknowledgement, message.actors);
  view.setFollowEntity(followedPlayerId);
  renderRoster(message.actors, message.entities);
  const botCount = message.actors.filter(
    (actor) => actor.kind === "bot",
  ).length;
  const playerCount = message.actors.length - botCount;
  if (player.knockedOut) {
    const remainingTicks = Math.max(0, (player.respawnsAtTick ?? message.tick) - message.tick);
    const remainingSeconds = Math.ceil(remainingTicks / 10);
    respawnNotice.hidden = false;
    respawnCountdown.textContent = `Respawning in ${remainingSeconds} second${remainingSeconds === 1 ? "" : "s"}`;
    setStatus(`KO · respawn in ${remainingTicks} ticks`);
  } else {
    respawnNotice.hidden = true;
    setStatus(`${player.x}, ${player.y} · ${player.health}/100 HP · ${player.protected ? "Protected" : "Vulnerable"} · ${playerCount} player${playerCount === 1 ? "" : "s"} · ${botCount} bots`);
  }
  performanceMonitor.recordSnapshot(
    message.tick,
    performance.now() - startedAt,
    message.serverSentAtMs,
  );
}

function updateGatherStatus(player, resourceNodes, tick) {
  if (latestAction.type !== "gather") {
    gatherStatus.textContent = "";
    return;
  }
  let x = player.x;
  let y = player.y;
  if (world.get(x, y) !== Terrain.Tree) {
    const delta = directionDelta(latestAction.direction);
    x += delta.x;
    y += delta.y;
  }
  if (!world.inBounds(x, y) || ![Terrain.Tree, Terrain.Rock].includes(world.get(x, y))) {
    gatherStatus.textContent = "No resource node in range";
    return;
  }
  const node = resourceNodes.find((candidate) => candidate.x === x && candidate.y === y);
  if (node === undefined) {
    gatherStatus.textContent = "Resource node full";
  } else if (node.remaining === 0) {
    gatherStatus.textContent = `${node.resource} depleted · regrows in ${Math.max(0, node.regrowsAtTick - tick)} ticks`;
  } else {
    gatherStatus.textContent = `${node.resource} node: ${node.remaining}/${node.capacity}`;
  }
}

function renderRoster(actors, entities) {
  const positions = new Map(entities.map((entity) => [entity.id, entity]));
  const humans = actors.filter((actor) => actor.kind !== "bot");
  const botCount = actors.length - humans.length;

  if (!humans.some((human) => human.entityId === followedPlayerId)) {
    followedPlayerId = playerId;
    view?.setFollowEntity(playerId);
  }

  botSummary.textContent = `${botCount} bot${botCount === 1 ? "" : "s"}`;
  roster.replaceChildren(
    ...humans.map((player) => {
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

function showShortcuts() {
  if (!shortcutsDialog.open) shortcutsDialog.showModal();
}

function isTyping(target) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target?.isContentEditable;
}

function sendOneShotAction(action) {
  const sequence = nextActionSequence++;
  send({ type: "action", sequence, action });
  if (action.type === "craft-medkit") gatherStatus.textContent = "Crafting medkit…";
  if (action.type === "craft-honed-weapon") gatherStatus.textContent = "Honing weapon…";
  if (action.type === "use-medkit") gatherStatus.textContent = "Using medkit…";
}

function isAtCamp(player) {
  return world.camps.some((camp) => (player.x - camp.x) ** 2 + (player.y - camp.y) ** 2 <= camp.radius ** 2);
}

function sendAction() {
  const sequence = nextActionSequence++;
  send({
    type: "action",
    sequence,
    action: latestAction,
  });
  view?.setLocalAction(latestAction, sequence);
  if (latestAction.type === "attack") {
    gatherStatus.textContent = "Attacking…";
    view?.setLocalAction(latestAction, sequence);
    return;
  }
  if (latestAction.type === "gather") {
    // Predict the attempt immediately; inventory/node state stays server-authoritative.
    gatherStatus.textContent = "Gathering…";
  }
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
