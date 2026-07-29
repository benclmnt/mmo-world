import { describe, expect, test } from "bun:test";
import { createBot } from "../src/agents";
import { GameRoom } from "../src/game-room";
import { Terrain } from "../../../packages/simulation/src/Terrain";

describe("GameRoom player lifecycle", () => {
  test("assigns monotonic guest/entity IDs and removes departed players from snapshots", () => {
    const room = new GameRoom(12345, { botCount: 0 });
    const first = room.join();
    const second = room.join();

    expect(first).toMatchObject({ entityId: 1, guestId: "guest-1", displayName: "Guest 1" });
    expect(second).toMatchObject({ entityId: 2, guestId: "guest-2", displayName: "Guest 2" });
    expect(room.snapshotMessage().entities.map((entity) => entity.id)).toEqual([1, 2]);

    expect(room.leave(first.entityId)).toBe(true);
    expect(room.snapshotMessage().entities.map((entity) => entity.id)).toEqual([2]);
    expect(room.join().entityId).toBe(3);
  });

  test("retains only newer action sequences and makes display names unique", () => {
    const room = new GameRoom(12345, { botCount: 0 });
    const first = room.join();
    const second = room.join();

    room.receive(first, { type: "action", sequence: 4, action: { type: "move", direction: "north" } });
    room.receive(first, { type: "action", sequence: 4, action: { type: "idle" } });
    expect(first.latestAction).toEqual({ type: "move", direction: "north" });

    room.receive(first, { type: "set-display-name", displayName: "Ada" });
    room.receive(second, { type: "set-display-name", displayName: " ada " });
    expect(room.snapshotMessage().actors.map((actor) => actor.displayName)).toEqual(["Ada", "ada 2"]);
  });
});

describe("GameRoom heuristic agents", () => {
  test("adds twenty visible bots spanning all three policies by default", () => {
    const room = new GameRoom(12345);
    const bots = room.snapshotMessage().actors.filter((actor) => actor.kind === "bot");

    expect(bots).toHaveLength(20);
    expect(new Set(bots.map((bot) => bot.policy))).toEqual(new Set([
      "random-walker",
      "persistent-wanderer",
      "obstacle-aware-wanderer",
    ]));
    expect(room.snapshotMessage().entities).toHaveLength(20);
  });

  test("reconsiders an open heading every tick so scouts cannot hold a collision deadlock", () => {
    const scout = createBot(100, 2, 12345);
    const observation = {
      tick: 0,
      self: { id: 100, x: 10, y: 10 },
      originX: 6,
      originY: 6,
      terrain: Array(81).fill(Terrain.Grass),
      entities: [{ id: 100, x: 10, y: 10 }],
    };
    const directions = Array.from({ length: 8 }, () => {
      const action = scout.controller.nextAction(observation);
      return action.type === "move" ? action.direction : "idle";
    });

    expect(new Set(directions).size).toBeGreaterThan(1);
  });
  test("produces the same authoritative bot state for the same seed", () => {
    const first = new GameRoom(98765);
    const second = new GameRoom(98765);

    for (let tick = 0; tick < 50; tick++) {
      first.step();
      second.step();
      expect(first.snapshotMessage()).toEqual(second.snapshotMessage());
    }
  });
});
