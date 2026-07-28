import { describe, expect, test } from "bun:test";
import type { Entity } from "../src/Entity";
import { Terrain } from "../src/Terrain";
import { World } from "../src/World";
import { SeededRandom } from "../src/generation/rng";
import { chooseSpawnPosition } from "../src/spawn";

function grassWorld(width = 8, height = 8): World {
  return new World(1, width, height);
}

function entities(...items: Entity[]): ReadonlyMap<string, Entity> {
  return new Map(items.map((entity) => [entity.id, entity]));
}

describe("spawn selection", () => {
  test("chooses the same position from the same world, entities, and RNG seed", () => {
    const world = grassWorld();
    const occupied = entities({ id: "existing", x: 3, y: 3 });

    const first = chooseSpawnPosition(world, occupied, new SeededRandom(99), { minSeparation: 4 });
    const second = chooseSpawnPosition(world, occupied, new SeededRandom(99), { minSeparation: 4 });

    expect(first).toEqual(second);
  });

  test("spawns only on unoccupied grass and honors Manhattan separation", () => {
    const world = grassWorld();
    world.set(7, 7, Terrain.Tree);
    const occupied = entities({ id: "existing", x: 3, y: 3 });

    const spawn = chooseSpawnPosition(world, occupied, new SeededRandom(12), { minSeparation: 5 });

    expect(spawn).toBeDefined();
    expect(world.get(spawn!.x, spawn!.y)).toBe(Terrain.Grass);
    expect(spawn).not.toEqual({ x: 3, y: 3 });
    expect(Math.abs(spawn!.x - 3) + Math.abs(spawn!.y - 3)).toBeGreaterThanOrEqual(5);
  });

  test("returns undefined rather than silently violating spacing", () => {
    const world = grassWorld(3, 3);
    const occupied = entities({ id: "existing", x: 1, y: 1 });

    const spawn = chooseSpawnPosition(world, occupied, new SeededRandom(12), { minSeparation: 3 });

    expect(spawn).toBeUndefined();
  });

  test("never chooses a tree tile even though trees are walkable", () => {
    const world = new World(1, 2, 1, new Uint8Array([Terrain.Tree, Terrain.Grass]));

    const spawn = chooseSpawnPosition(world, entities(), new SeededRandom(1), { minSeparation: 0 });

    expect(spawn).toEqual({ x: 1, y: 0 });
  });
});
