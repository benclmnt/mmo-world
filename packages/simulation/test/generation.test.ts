import { describe, expect, test } from "bun:test";
import { Terrain } from "../src/Terrain";
import { generateWorld, SPAWN_CLEARING_RADIUS } from "../src/generation/generateWorld";

describe("world generation", () => {
  test("is deterministic for the same seed", () => {
    const first = generateWorld({ seed: 12345 });
    const second = generateWorld({ seed: 12345 });

    expect([...first.tiles]).toEqual([...second.tiles]);
  });

  test("usually differs for a different seed", () => {
    const first = generateWorld({ seed: 12345 });
    const second = generateWorld({ seed: 54321 });

    expect([...first.tiles]).not.toEqual([...second.tiles]);
  });

  test("clears a grass spawn region in the map centre", () => {
    const world = generateWorld({ seed: 12345 });
    const centerX = Math.floor(world.width / 2);
    const centerY = Math.floor(world.height / 2);

    for (let y = centerY - SPAWN_CLEARING_RADIUS; y <= centerY + SPAWN_CLEARING_RADIUS; y++) {
      for (let x = centerX - SPAWN_CLEARING_RADIUS; x <= centerX + SPAWN_CLEARING_RADIUS; x++) {
        expect(world.get(x, y)).toBe(Terrain.Grass);
      }
    }
  });
});
