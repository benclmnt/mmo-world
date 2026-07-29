import { describe, expect, test } from "bun:test";
import { isActionMessage } from "../src/messages";

describe("action protocol validation", () => {
  test("accepts supported action messages", () => {
    expect(isActionMessage({ type: "action", sequence: 0, action: { type: "idle" } })).toBe(true);
    expect(isActionMessage({ type: "action", sequence: 9, action: { type: "move", direction: "west" } })).toBe(true);
  });

  test("rejects malformed or unsafe action messages", () => {
    expect(isActionMessage({ type: "action", sequence: -1, action: { type: "idle" } })).toBe(false);
    expect(isActionMessage({ type: "action", sequence: 1.5, action: { type: "idle" } })).toBe(false);
    expect(isActionMessage({ type: "action", sequence: 1, action: { type: "move", direction: "up" } })).toBe(false);
    expect(isActionMessage({ type: "snapshot", tick: 1 })).toBe(false);
    expect(isActionMessage(null)).toBe(false);
  });
});
