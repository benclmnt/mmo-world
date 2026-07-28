import { terrainGlyph } from "./Terrain";
import { generateWorld } from "./generation/generateWorld";

const rawSeed = Bun.argv[2] ?? "12345";
const seed = Number(rawSeed);
if (!Number.isSafeInteger(seed)) {
  throw new Error(`Seed must be a safe integer, received: ${rawSeed}`);
}

const world = generateWorld({ seed });
console.log(`World seed: ${world.seed} (${world.width}x${world.height})`);
console.log("Legend: . grass, ~ water, T tree, # rock\n");

for (let y = 0; y < world.height; y++) {
  let row = "";
  for (let x = 0; x < world.width; x++) {
    row += terrainGlyph(world.get(x, y));
  }
  console.log(row);
}
