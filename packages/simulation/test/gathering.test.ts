import { describe, expect, test } from "bun:test";
import { Simulation } from "../src/Simulation";
import { Terrain } from "../src/Terrain";
import { World } from "../src/World";

function gather(direction: "north" | "south" | "east" | "west") {
  return { type: "gather" as const, direction };
}

describe("gathering", () => {
  test("gathers inexhaustible tree and rock resources with a tick cooldown", () => {
    const world = new World(1, 5, 5);
    world.set(2, 2, Terrain.Tree);
    world.set(3, 1, Terrain.Rock);
    const simulation = new Simulation(world);
    simulation.placeEntity({ id: 1, x: 2, y: 2 });
    simulation.placeEntity({ id: 2, x: 2, y: 1 });

    expect(simulation.step({ actions: new Map([[1, gather("north")], [2, gather("east")]]) }).events).toEqual([
      { type: "gathered", entityId: 1, resource: "wood", quantity: 1, x: 2, y: 2 },
      { type: "gathered", entityId: 2, resource: "stone", quantity: 1, x: 3, y: 1 },
    ]);
    for (let tick = 0; tick < 4; tick++) simulation.step({ actions: new Map([[1, gather("north")]]) });
    expect(simulation.getInventory(1)).toEqual({ wood: 1, stone: 0 });
    simulation.step({ actions: new Map([[1, gather("north")]]) });
    expect(simulation.getInventory(1)).toEqual({ wood: 2, stone: 0 });
  });

  test("rejects distant, blocked, and out-of-bounds gather attempts deterministically", () => {
    const world = new World(1, 3, 3);
    world.set(2, 1, Terrain.Rock);
    const simulation = new Simulation(world);
    simulation.placeEntity({ id: 1, x: 0, y: 0 });
    simulation.placeEntity({ id: 2, x: 1, y: 1 });

    expect(simulation.step({ actions: new Map([[1, gather("west")], [2, gather("north")]]) }).events).toEqual([]);
    expect(simulation.getInventory(1)).toEqual({ wood: 0, stone: 0 });
    expect(simulation.getInventory(2)).toEqual({ wood: 0, stone: 0 });
  });

  test("clears inventory when an entity is removed", () => {
    const world = new World(1, 3, 3);
    world.set(1, 1, Terrain.Tree);
    const simulation = new Simulation(world);
    simulation.placeEntity({ id: 1, x: 1, y: 1 });
    simulation.step({ actions: new Map([[1, gather("north")]]) });
    simulation.removeEntity(1);
    expect(simulation.getInventory(1)).toBeUndefined();
  });
});
