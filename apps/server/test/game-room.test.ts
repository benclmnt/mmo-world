import { describe, expect, test } from "bun:test";
import { GameRoom } from "../src/game-room";

describe("GameRoom player lifecycle", () => {
  test("assigns monotonic guest/entity IDs and removes departed players from snapshots", () => {
    const room = new GameRoom(12345);
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
    const room = new GameRoom(12345);
    const first = room.join();
    const second = room.join();

    room.receive(first, { type: "action", sequence: 4, action: { type: "move", direction: "north" } });
    room.receive(first, { type: "action", sequence: 4, action: { type: "idle" } });
    expect(first.latestAction).toEqual({ type: "move", direction: "north" });

    room.receive(first, { type: "set-display-name", displayName: "Ada" });
    room.receive(second, { type: "set-display-name", displayName: " ada " });
    expect(room.snapshotMessage().players.map((player) => player.displayName)).toEqual(["Ada", "ada 2"]);
  });
});
