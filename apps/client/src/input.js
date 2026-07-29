const directionForKey = {
  ArrowUp: "north",
  w: "north",
  W: "north",
  ArrowDown: "south",
  s: "south",
  S: "south",
  ArrowLeft: "west",
  a: "west",
  A: "west",
  ArrowRight: "east",
  d: "east",
  D: "east",
};

/** Calls onMove once for each supported, non-repeated keyboard press. */
export function bindMovementInput(onMove) {
  window.addEventListener("keydown", (event) => {
    const direction = directionForKey[event.key];
    if (direction === undefined || event.repeat) return;

    event.preventDefault();
    onMove(direction);
  });
}
