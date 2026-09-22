import { describe, expect, test } from "bun:test";
import { Simulation } from "../src/Simulation";
import { Terrain } from "../src/Terrain";
import { World } from "../src/World";

const attack = (direction: "north" | "south" | "east" | "west") => ({ type: "attack" as const, direction });
const gather = (direction: "north" | "south" | "east" | "west") => ({ type: "gather" as const, direction });

describe("combat, knockout, and extraction", () => {
  test("resolves adjacent attacks simultaneously, including mutual knockouts", () => {
    const simulation = new Simulation(new World(1, 4, 3));
    simulation.placeEntity({ id: 1, x: 1, y: 1 }); simulation.placeEntity({ id: 2, x: 2, y: 1 });
    for (let hit = 0; hit < 5; hit++) {
      const result = simulation.step({ actions: new Map([[1, attack("east")], [2, attack("west")]]) });
      if (hit < 4) expect(result.events.filter((event) => event.type === "attacked")).toHaveLength(2);
      for (let tick = 0; tick < 5; tick++) simulation.step({ actions: new Map() });
    }
    const snapshot = simulation.createSnapshot(1);
    expect(snapshot.entities).toEqual(expect.arrayContaining([expect.objectContaining({ id: 1, health: 0, knockedOut: true }), expect.objectContaining({ id: 2, health: 0, knockedOut: true })]));
  });

  test("rejects out-of-range attacks and enforces a six-tick cooldown", () => {
    const simulation = new Simulation(new World(1, 5, 3));
    simulation.placeEntity({ id: 1, x: 0, y: 1 }); simulation.placeEntity({ id: 2, x: 3, y: 1 });
    expect(simulation.step({ actions: new Map([[1, attack("east")]]) }).events).toEqual([]);
    simulation.step({ actions: new Map([[1, { type: "move", direction: "east" }]]) });
    simulation.step({ actions: new Map([[1, { type: "move", direction: "east" }]]) });
    expect(simulation.step({ actions: new Map([[1, attack("east")]]) }).events).toContainEqual({ type: "attacked", entityId: 1, targetId: 2, damage: 20 });
    expect(simulation.step({ actions: new Map([[1, attack("east")]]) }).events).toEqual([]);
  });

  test("drops half of unsecured resources, leaves stash intact, and lets another player collect it", () => {
    const world = new World(1, 5, 3); world.set(1, 1, Terrain.Tree);
    const simulation = new Simulation(world); simulation.placeEntity({ id: 1, x: 1, y: 1 }); simulation.placeEntity({ id: 2, x: 2, y: 1 });
    simulation.setInventory(1, { wood: 5, stone: 3 }); simulation.setSecuredStash(1, { wood: 9, stone: 8 });
    for (let hit = 0; hit < 5; hit++) { simulation.step({ actions: new Map([[2, attack("west")]]) }); for (let tick = 0; tick < 5; tick++) simulation.step({ actions: new Map() }); }
    expect(simulation.getInventory(1)).toEqual({ wood: 3, stone: 2 }); expect(simulation.getSecuredStash(1)).toEqual({ wood: 9, stone: 8 });
    const pile = simulation.createSnapshot().lootPiles[0]!; expect(pile).toMatchObject({ wood: 2, stone: 1, x: 1, y: 1 });
    simulation.step({ actions: new Map([[2, { type: "move", direction: "west" }]]) });
    expect(simulation.getInventory(2)).toEqual({ wood: 2, stone: 1 }); expect(simulation.createSnapshot().lootPiles).toEqual([]);
  });

  test("deposits anywhere in a camp's safe ring and never exposes another player's balances", () => {
    const world = new World(1, 5, 5); world.setCamps([{ id: "home", kind: "home", x: 2, y: 2, radius: 1 }]);
    const simulation = new Simulation(world); simulation.placeEntity({ id: 1, x: 1, y: 2 }); simulation.placeEntity({ id: 2, x: 0, y: 0 }); simulation.setInventory(1, { wood: 4, stone: 2 });
    expect(simulation.step({ actions: new Map([[1, gather("north")]]) }).events).toContainEqual({ type: "deposited", entityId: 1, campId: "home", wood: 4, stone: 2 });
    expect(simulation.getInventory(1)).toEqual({ wood: 0, stone: 0 }); expect(simulation.getSecuredStash(1)).toEqual({ wood: 4, stone: 2 });
    const other = simulation.createSnapshot(2).entities.find((entity) => entity.id === 1)!; expect(other.inventory).toBeUndefined();
  });
});
