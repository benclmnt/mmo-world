const gatherCode = "KeyE";

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
  let gathering = false;
  let lastDirection = "north";

  function setHeldInput(inputId, direction) {
    const existing = heldKeys.get(inputId);
    if (direction === undefined) {
      if (!heldKeys.delete(inputId)) return;
    } else if (existing?.direction === direction) {
      return;
    } else {
      heldKeys.set(inputId, { direction, order: pressOrder++ });
      lastDirection = direction;
    }
    onActionChange?.(currentAction());
  }

  window.addEventListener("keydown", (event) => {
    if (event.code === gatherCode) {
      event.preventDefault();
      if (!gathering) {
        gathering = true;
        onActionChange?.(currentAction());
      }
      return;
    }
    const direction = directionForCode[event.code];
    if (direction === undefined) return;

    event.preventDefault();
    if (!heldKeys.has(event.code)) {
      setHeldInput(event.code, direction);
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === gatherCode) {
      event.preventDefault();
      if (gathering) {
        gathering = false;
        onActionChange?.(currentAction());
      }
      return;
    }
    if (directionForCode[event.code] === undefined) return;

    event.preventDefault();
    setHeldInput(event.code, undefined);
  });

  window.addEventListener("blur", () => {
    if (heldKeys.size === 0 && !gathering) return;
    heldKeys.clear();
    gathering = false;
    onActionChange?.(currentAction());
  });

  function currentAction() {
    if (gathering) return { type: "gather", direction: lastDirection };
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
    setGathering(value) {
      if (gathering === value) return;
      gathering = value;
      onActionChange?.(currentAction());
    },
    setTouchDirection(direction) {
      setHeldInput("touch-trackpad", direction);
    },
  };
}
