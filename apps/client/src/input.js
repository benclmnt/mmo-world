const directionForCode = {
  ArrowUp: "north",
  KeyW: "north",
  ArrowDown: "south",
  KeyS: "south",
  ArrowLeft: "west",
  KeyA: "west",
  ArrowRight: "east",
  KeyD: "east",
};

/**
 * Tracks held movement keys. The most recently pressed held key wins when
 * several directions are held, which makes changing direction predictable.
 */
export function createMovementInput() {
  const heldKeys = new Map();
  let pressOrder = 0;

  window.addEventListener("keydown", (event) => {
    const direction = directionForCode[event.code];
    if (direction === undefined) return;

    event.preventDefault();
    if (!heldKeys.has(event.code)) {
      heldKeys.set(event.code, { direction, order: pressOrder++ });
    }
  });

  window.addEventListener("keyup", (event) => {
    if (directionForCode[event.code] === undefined) return;

    event.preventDefault();
    heldKeys.delete(event.code);
  });

  return {
    currentAction() {
      let latestHeldKey;
      for (const heldKey of heldKeys.values()) {
        if (latestHeldKey === undefined || heldKey.order > latestHeldKey.order) {
          latestHeldKey = heldKey;
        }
      }

      return latestHeldKey === undefined
        ? { type: "idle" }
        : { type: "move", direction: latestHeldKey.direction };
    },
  };
}
