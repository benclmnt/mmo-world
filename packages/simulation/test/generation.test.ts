import { describe, expect, test } from "bun:test";
import { Terrain } from "../src/Terrain";
import { analyzeWalkableConnectivity } from "../src/generation/connectivity";
import { generateWorld } from "../src/generation/generateWorld";

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

  test("contains grass tiles that can later be used as spawn candidates", () => {
    const world = generateWorld({ seed: 12345 });
    const grassTiles = [...world.tiles].filter((tile) => tile === Terrain.Grass);

    expect(grassTiles.length).toBeGreaterThan(0);
  });

  test("accepts only worlds whose walkable terrain is fully connected", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const world = generateWorld({ seed });
      const connectivity = analyzeWalkableConnectivity(world);

      expect(connectivity.totalWalkable).toBeGreaterThan(0);
      expect(connectivity.isFullyConnected).toBe(true);
    }
  });
});
