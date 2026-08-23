import { describe, expect, test } from "bun:test";
import { isActionMessage, isClientMessage, isSetDisplayNameMessage, normalizeDisplayName } from "../src/messages";

describe("action protocol validation", () => {
  test("accepts supported action messages", () => {
    expect(isActionMessage({ type: "action", sequence: 0, action: { type: "idle" } })).toBe(true);
    expect(isActionMessage({ type: "action", sequence: 9, action: { type: "move", direction: "west" } })).toBe(true);
    expect(isActionMessage({ type: "action", sequence: 10, action: { type: "gather", direction: "north" } })).toBe(true);
  });

  test("rejects malformed or unsafe action messages", () => {
    expect(isActionMessage({ type: "action", sequence: -1, action: { type: "idle" } })).toBe(false);
    expect(isActionMessage({ type: "action", sequence: 1.5, action: { type: "idle" } })).toBe(false);
    expect(isActionMessage({ type: "action", sequence: 1, action: { type: "move", direction: "up" } })).toBe(false);
    expect(isActionMessage({ type: "action", sequence: 1, action: { type: "gather", direction: "up" } })).toBe(false);
    expect(isActionMessage({ type: "snapshot", tick: 1 })).toBe(false);
    expect(isActionMessage(null)).toBe(false);
  });
});

describe("guest profile protocol validation", () => {
  test("accepts bounded printable display names", () => {
    expect(isSetDisplayNameMessage({ type: "set-display-name", displayName: "  Ada   Lovelace " })).toBe(true);
    expect(normalizeDisplayName("  Ada   Lovelace ")).toBe("Ada Lovelace");
    expect(isClientMessage({ type: "set-display-name", displayName: "Ada" })).toBe(true);
  });

  test("rejects blank, oversized, and control-character display names", () => {
    expect(isSetDisplayNameMessage({ type: "set-display-name", displayName: "   " })).toBe(false);
    expect(isSetDisplayNameMessage({ type: "set-display-name", displayName: "x".repeat(25) })).toBe(false);
    expect(isSetDisplayNameMessage({ type: "set-display-name", displayName: "Ada\nLovelace" })).toBe(false);
  });
});
