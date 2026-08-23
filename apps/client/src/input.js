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
export function createMovementInput(onActionChange) {
  const heldKeys = new Map();
  let pressOrder = 0;

  function setHeldInput(inputId, direction) {
    const existing = heldKeys.get(inputId);
    if (direction === undefined) {
      if (!heldKeys.delete(inputId)) return;
    } else if (existing?.direction === direction) {
      return;
    } else {
      heldKeys.set(inputId, { direction, order: pressOrder++ });
    }
    onActionChange?.(currentAction());
  }

  window.addEventListener("keydown", (event) => {
    const direction = directionForCode[event.code];
    if (direction === undefined) return;

    event.preventDefault();
    if (!heldKeys.has(event.code)) {
      setHeldInput(event.code, direction);
    }
  });

  window.addEventListener("keyup", (event) => {
    if (directionForCode[event.code] === undefined) return;

    event.preventDefault();
    setHeldInput(event.code, undefined);
  });

  function currentAction() {
    let latestHeldKey;
    for (const heldKey of heldKeys.values()) {
      if (latestHeldKey === undefined || heldKey.order > latestHeldKey.order) {
        latestHeldKey = heldKey;
      }
    }

    return latestHeldKey === undefined
      ? { type: "idle" }
      : { type: "move", direction: latestHeldKey.direction };
  }

  return {
    currentAction,
    setTouchDirection(direction) {
      setHeldInput("touch-trackpad", direction);
    },
  };
}
