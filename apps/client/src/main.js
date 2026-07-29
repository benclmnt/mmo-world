import { generateWorld } from "../../../packages/simulation/src/generation/generateWorld.ts";
import { Simulation } from "../../../packages/simulation/src/Simulation.ts";
import { createMovementInput } from "./input.js";
import { createWorldView } from "./world-view.js";

const WORLD_SEED = 20260729;
const PLAYER_ID = 1;
const TICKS_PER_SECOND = 10;
const TICK_DURATION_MS = 1_000 / TICKS_PER_SECOND;
const world = generateWorld({ seed: WORLD_SEED });
const simulation = new Simulation(world);
const player = simulation.spawnEntity(PLAYER_ID, { minSeparation: 0 });
const view = createWorldView(document.querySelector("#world"), world, player);
const movementInput = createMovementInput();
const playerStatus = document.querySelector("#player-status");
let previousFrameTime = performance.now();
let accumulatedTickTime = 0;

document.querySelector("#world-seed").textContent = String(WORLD_SEED);

function tickSimulation() {
  // This runs even with no key held; currentAction() is then an idle action.
  const action = movementInput.currentAction();
  simulation.step({ actions: new Map([[PLAYER_ID, action]]) });

  const updatedPlayer = simulation.getEntity(PLAYER_ID);
  view.movePlayerTo(updatedPlayer);
  playerStatus.textContent = `Tile ${updatedPlayer.x}, ${updatedPlayer.y} · tick ${simulation.tick}`;
}

function render(currentFrameTime) {
  // The simulation advances at a fixed 10 Hz; rendering remains as fast as it can.
  const elapsed = Math.min(currentFrameTime - previousFrameTime, 250);
  previousFrameTime = currentFrameTime;
  accumulatedTickTime += elapsed;

  while (accumulatedTickTime >= TICK_DURATION_MS) {
    tickSimulation();
    accumulatedTickTime -= TICK_DURATION_MS;
  }

  view.renderFrame();
  requestAnimationFrame(render);
}

requestAnimationFrame(render);
