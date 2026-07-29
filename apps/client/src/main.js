import { generateWorld } from "../../../packages/simulation/src/generation/generateWorld.ts";
import { Simulation } from "../../../packages/simulation/src/Simulation.ts";
import { bindMovementInput } from "./input.js";
import { createWorldView } from "./world-view.js";

const WORLD_SEED = 20260729;
const PLAYER_ID = 1;
const world = generateWorld({ seed: WORLD_SEED });
const simulation = new Simulation(world);
const player = simulation.spawnEntity(PLAYER_ID, { minSeparation: 0 });
const view = createWorldView(document.querySelector("#world"), world, player);
const playerStatus = document.querySelector("#player-status");

document.querySelector("#world-seed").textContent = String(WORLD_SEED);

bindMovementInput((direction) => {
  // The view requests movement; Simulation alone decides whether it succeeds.
  simulation.step({ actions: new Map([[PLAYER_ID, { type: "move", direction }]]) });
  const updatedPlayer = simulation.getEntity(PLAYER_ID);
  view.movePlayerTo(updatedPlayer);
  playerStatus.textContent = `Tile ${updatedPlayer.x}, ${updatedPlayer.y} · tick ${simulation.tick}`;
});

function render() {
  view.renderFrame();
  requestAnimationFrame(render);
}

render();
