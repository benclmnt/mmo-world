import { describe, expect, test } from "bun:test";
import type { Action } from "../src/actions";
import { Simulation } from "../src/Simulation";
import { Terrain } from "../src/Terrain";
import { World } from "../src/World";

function simulationWith(...entities: { id: string; x: number; y: number }[]): Simulation {
  const simulation = new Simulation(new World(1, 5, 5));
  for (const entity of entities) {
    simulation.placeEntity(entity);
  }
  return simulation;
}

function actions(entries: readonly [string, Action][]): ReadonlyMap<string, Action> {
  return new Map(entries);
}

describe("simultaneous movement", () => {
  test("moves onto an empty walkable tile", () => {
    const simulation = simulationWith({ id: "a", x: 1, y: 1 });

    const result = simulation.step({ actions: actions([["a", { type: "move", direction: "east" }]]) });

    expect(simulation.getEntity("a")).toEqual({ id: "a", x: 2, y: 1 });
    expect(result).toEqual({
      tick: 1,
      events: [{ type: "moved", entityId: "a", fromX: 1, fromY: 1, toX: 2, toY: 1 }],
    });
  });

  test("rejects blocked terrain and world boundaries", () => {
    const world = new World(1, 3, 2);
    world.set(1, 0, Terrain.Water);
    const simulation = new Simulation(world);
    simulation.placeEntity({ id: "a", x: 0, y: 0 });

    expect(simulation.step({ actions: actions([["a", { type: "move", direction: "east" }]]) }).events).toEqual([]);
    expect(simulation.step({ actions: actions([["a", { type: "move", direction: "north" }]]) }).events).toEqual([]);
    expect(simulation.getEntity("a")).toEqual({ id: "a", x: 0, y: 0 });
  });

  test("rejects same-destination conflicts", () => {
    const simulation = simulationWith({ id: "a", x: 1, y: 1 }, { id: "b", x: 3, y: 1 });

    simulation.step({ actions: actions([
      ["a", { type: "move", direction: "east" }],
      ["b", { type: "move", direction: "west" }],
    ]) });

    expect(simulation.getEntities()).toEqual([
      { id: "a", x: 1, y: 1 },
      { id: "b", x: 3, y: 1 },
    ]);
  });

  test("rejects direct swaps", () => {
    const simulation = simulationWith({ id: "a", x: 1, y: 1 }, { id: "b", x: 2, y: 1 });

    expect(simulation.step({ actions: actions([
      ["a", { type: "move", direction: "east" }],
      ["b", { type: "move", direction: "west" }],
    ]) }).events).toEqual([]);
  });

  test("allows following into a tile that is successfully vacated", () => {
    const simulation = simulationWith({ id: "a", x: 1, y: 1 }, { id: "b", x: 2, y: 1 });

    const result = simulation.step({ actions: actions([
      ["a", { type: "move", direction: "east" }],
      ["b", { type: "move", direction: "east" }],
    ]) });

    expect(simulation.getEntities()).toEqual([
      { id: "a", x: 2, y: 1 },
      { id: "b", x: 3, y: 1 },
    ]);
    expect(result.events).toHaveLength(2);
  });

  test("allows a four-entity cycle because every destination is vacated", () => {
    const simulation = simulationWith(
      { id: "a", x: 1, y: 1 },
      { id: "b", x: 2, y: 1 },
      { id: "c", x: 2, y: 2 },
      { id: "d", x: 1, y: 2 },
    );

    simulation.step({ actions: actions([
      ["a", { type: "move", direction: "east" }],
      ["b", { type: "move", direction: "south" }],
      ["c", { type: "move", direction: "west" }],
      ["d", { type: "move", direction: "north" }],
    ]) });

    expect(simulation.getEntities()).toEqual([
      { id: "a", x: 2, y: 1 },
      { id: "b", x: 2, y: 2 },
      { id: "c", x: 1, y: 2 },
      { id: "d", x: 1, y: 1 },
    ]);
  });

  test("does not depend on input Map insertion order", () => {
    const first = simulationWith({ id: "a", x: 1, y: 1 }, { id: "b", x: 2, y: 1 }, { id: "c", x: 3, y: 1 });
    const second = simulationWith({ id: "a", x: 1, y: 1 }, { id: "b", x: 2, y: 1 }, { id: "c", x: 3, y: 1 });
    const forward: [string, Action][] = [
      ["a", { type: "move", direction: "east" }],
      ["b", { type: "move", direction: "east" }],
      ["c", { type: "move", direction: "east" }],
    ];

    expect(first.step({ actions: actions(forward) })).toEqual(second.step({ actions: actions([...forward].reverse()) }));
    expect(first.getEntities()).toEqual(second.getEntities());
  });
});
