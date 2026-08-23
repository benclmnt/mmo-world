import { describe, expect, test } from "bun:test";
import { Simulation } from "../src/Simulation";
import { Terrain } from "../src/Terrain";
import { World } from "../src/World";

describe("simulation snapshots", () => {
  test("contains the current tick and entities ordered by numeric ID", () => {
    const simulation = new Simulation(new World(7, 4, 4));
    simulation.placeEntity({ id: 9, x: 3, y: 3 });
    simulation.placeEntity({ id: 2, x: 1, y: 1 });
    simulation.step({ actions: new Map([[2, { type: "move", direction: "east" }]]) });

    const snapshot = simulation.createSnapshot();

    expect(snapshot).toEqual({
      tick: 1,
      resourceNodes: [],
      entities: [
        { id: 2, x: 2, y: 1, inventory: { wood: 0, stone: 0 } },
        { id: 9, x: 3, y: 3, inventory: { wood: 0, stone: 0 } },
      ],
    });
  });

  test("does not expose mutable entity state", () => {
    const simulation = new Simulation(new World(7, 4, 4));
    simulation.placeEntity({ id: 2, x: 1, y: 1 });

    const snapshot = simulation.createSnapshot();
    snapshot.entities[0]!.x = 3;
    snapshot.entities[0]!.inventory.wood = 99;

    expect(simulation.getEntity(2)).toEqual({ id: 2, x: 1, y: 1 });
    expect(simulation.getInventory(2)).toEqual({ wood: 0, stone: 0 });
  });
});

describe("agent observations", () => {
  test("provides a centered 9 by 9 terrain window and nearby sorted entities", () => {
    const world = new World(7, 12, 12);
    world.set(6, 4, Terrain.Water);
    const simulation = new Simulation(world);
    simulation.placeEntity({ id: 9, x: 8, y: 8 });
    simulation.placeEntity({ id: 2, x: 4, y: 4 });
    simulation.placeEntity({ id: 1, x: 5, y: 4 });

    const observation = simulation.observeAgent(2);

    expect(observation.tick).toBe(0);
    expect(observation.self).toEqual({ id: 2, x: 4, y: 4 });
    expect(observation.originX).toBe(0);
    expect(observation.originY).toBe(0);
    expect(observation.terrain).toHaveLength(81);
    expect(observation.terrain[4 * 9 + 4]).toBe(Terrain.Grass);
    expect(observation.terrain[4 * 9 + 6]).toBe(Terrain.Water);
    expect(observation.entities).toEqual([{ id: 1, x: 5, y: 4 }, { id: 2, x: 4, y: 4 }, { id: 9, x: 8, y: 8 }]);
  });

  test("uses null for terrain outside the world and rejects unknown entities", () => {
    const simulation = new Simulation(new World(7, 5, 5));
    simulation.placeEntity({ id: 2, x: 0, y: 0 });

    const observation = simulation.observeAgent(2);

    expect(observation.originX).toBe(-4);
    expect(observation.originY).toBe(-4);
    expect(observation.terrain[0]).toBeNull();
    expect(observation.terrain[4 * 9 + 4]).toBe(Terrain.Grass);
    expect(() => simulation.observeAgent(99)).toThrow("Entity '99' does not exist");
  });
});
