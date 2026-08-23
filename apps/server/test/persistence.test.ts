import { afterEach, describe, expect, test } from "bun:test";
import { PersistenceStore } from "../src/persistence";

let store: PersistenceStore | undefined;

afterEach(() => store?.close());

describe("PersistenceStore", () => {
  test("keeps the initial room seed and rotates reconnect credentials", () => {
    store = new PersistenceStore(":memory:");
    expect(store.roomSeed(123)).toBe(123);
    expect(store.roomSeed(999)).toBe(123);

    const first = store.authenticate(null);
    expect(first.resumed).toBe(false);
    expect(first.displayName).toBe("Guest");
    expect(first.reconnectToken).toHaveLength(43);

    store.updateDisplayName(first.playerId, "Persistent Pilot");
    const resumed = store.authenticate(first.reconnectToken);
    expect(resumed).toMatchObject({
      playerId: first.playerId,
      displayName: "Persistent Pilot",
      resumed: true,
    });
    expect(resumed.reconnectToken).not.toBe(first.reconnectToken);

    const staleToken = store.authenticate(first.reconnectToken);
    expect(staleToken.playerId).not.toBe(first.playerId);
  });

  test("records bounded session lifecycles without storing simulation state", () => {
    store = new PersistenceStore(":memory:");
    store.roomSeed(123);
    const identity = store.authenticate(null);
    const sessionId = store.openSession(identity.playerId, 7);
    expect(sessionId).toBeString();
    store.closeSession(sessionId);
    store.closeSession(sessionId);
  });
});
