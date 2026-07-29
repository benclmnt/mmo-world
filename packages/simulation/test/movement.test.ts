import { describe, expect, test } from "bun:test";
import type { Action } from "../src/actions";
import type { Entity, EntityId } from "../src/Entity";
import { Simulation } from "../src/Simulation";
import { Terrain } from "../src/Terrain";
import { World } from "../src/World";

function simulationWith(...entities: Entity[]): Simulation {
  const simulation = new Simulation(new World(1, 5, 5));
  for (const entity of entities) {
    simulation.placeEntity(entity);
  }
  return simulation;
}

function actions(entries: readonly [EntityId, Action][]): ReadonlyMap<EntityId, Action> {
  return new Map(entries);
}

describe("simultaneous movement", () => {
  test("moves onto an empty walkable tile", () => {
    const simulation = simulationWith({ id: 1, x: 1, y: 1 });

    const result = simulation.step({ actions: actions([[1, { type: "move", direction: "east" }]]) });

    expect(simulation.getEntity(1)).toEqual({ id: 1, x: 2, y: 1 });
    expect(result).toEqual({
      tick: 1,
      events: [{ type: "moved", entityId: 1, fromX: 1, fromY: 1, toX: 2, toY: 1 }],
    });
  });

  test("rejects blocked terrain and world boundaries", () => {
    const world = new World(1, 3, 2);
    world.set(1, 0, Terrain.Water);
    const simulation = new Simulation(world);
    simulation.placeEntity({ id: 1, x: 0, y: 0 });

    expect(simulation.step({ actions: actions([[1, { type: "move", direction: "east" }]]) }).events).toEqual([]);
    expect(simulation.step({ actions: actions([[1, { type: "move", direction: "north" }]]) }).events).toEqual([]);
    expect(simulation.getEntity(1)).toEqual({ id: 1, x: 0, y: 0 });
  });

  test("rejects same-destination conflicts", () => {
    const simulation = simulationWith({ id: 1, x: 1, y: 1 }, { id: 2, x: 3, y: 1 });

    simulation.step({ actions: actions([
      [1, { type: "move", direction: "east" }],
      [2, { type: "move", direction: "west" }],
    ]) });

    expect(simulation.getEntities()).toEqual([
      { id: 1, x: 1, y: 1 },
      { id: 2, x: 3, y: 1 },
    ]);
  });

  test("rejects direct swaps", () => {
    const simulation = simulationWith({ id: 1, x: 1, y: 1 }, { id: 2, x: 2, y: 1 });

    expect(simulation.step({ actions: actions([
      [1, { type: "move", direction: "east" }],
      [2, { type: "move", direction: "west" }],
    ]) }).events).toEqual([]);
  });

  test("allows following into a tile that is successfully vacated", () => {
    const simulation = simulationWith({ id: 1, x: 1, y: 1 }, { id: 2, x: 2, y: 1 });

    const result = simulation.step({ actions: actions([
      [1, { type: "move", direction: "east" }],
      [2, { type: "move", direction: "east" }],
    ]) });

    expect(simulation.getEntities()).toEqual([
      { id: 1, x: 2, y: 1 },
      { id: 2, x: 3, y: 1 },
    ]);
    expect(result.events).toHaveLength(2);
  });

  test("allows a four-entity cycle because every destination is vacated", () => {
    const simulation = simulationWith(
      { id: 1, x: 1, y: 1 },
      { id: 2, x: 2, y: 1 },
      { id: 3, x: 2, y: 2 },
      { id: 4, x: 1, y: 2 },
    );

    simulation.step({ actions: actions([
      [1, { type: "move", direction: "east" }],
      [2, { type: "move", direction: "south" }],
      [3, { type: "move", direction: "west" }],
      [4, { type: "move", direction: "north" }],
    ]) });

    expect(simulation.getEntities()).toEqual([
      { id: 1, x: 2, y: 1 },
      { id: 2, x: 2, y: 2 },
      { id: 3, x: 1, y: 2 },
      { id: 4, x: 1, y: 1 },
    ]);
  });

  test("does not depend on input Map insertion order", () => {
    const first = simulationWith({ id: 1, x: 1, y: 1 }, { id: 2, x: 2, y: 1 }, { id: 3, x: 3, y: 1 });
    const second = simulationWith({ id: 1, x: 1, y: 1 }, { id: 2, x: 2, y: 1 }, { id: 3, x: 3, y: 1 });
    const forward: [number, Action][] = [
      [1, { type: "move", direction: "east" }],
      [2, { type: "move", direction: "east" }],
      [3, { type: "move", direction: "east" }],
    ];

    expect(first.step({ actions: actions(forward) })).toEqual(second.step({ actions: actions([...forward].reverse()) }));
    expect(first.getEntities()).toEqual(second.getEntities());
  });
});
