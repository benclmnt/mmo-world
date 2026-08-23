const MOBILE_POINTER_QUERY = "(pointer: coarse) and (hover: none)";

/**
 * Shows a touch movement surface only on devices whose primary input is a
 * coarse, non-hovering pointer (phones and tablets). Dragging away from the
 * center chooses the dominant cardinal direction; releasing stops movement.
 */
export function createMobileTrackpad(element, onDirectionChange) {
  const thumb = element.querySelector(".mobile-trackpad__thumb");
  const mobilePointer = window.matchMedia(MOBILE_POINTER_QUERY);
  let activePointerId;
  let direction;

  function syncVisibility() {
    const isMobile = mobilePointer.matches;
    element.hidden = !isMobile;
    if (!isMobile) reset();
  }

  function setDirection(nextDirection) {
    if (direction === nextDirection) return;
    direction = nextDirection;
    onDirectionChange(direction);
  }

  function reset() {
    activePointerId = undefined;
    thumb.style.transform = "translate(-50%, -50%)";
    setDirection(undefined);
  }

  function updatePosition(event) {
    const bounds = element.getBoundingClientRect();
    const radius = bounds.width / 2;
    const maxDistance = radius * 0.58;
    let deltaX = event.clientX - (bounds.left + radius);
    let deltaY = event.clientY - (bounds.top + radius);
    const distance = Math.hypot(deltaX, deltaY);

    if (distance > maxDistance) {
      deltaX = (deltaX / distance) * maxDistance;
      deltaY = (deltaY / distance) * maxDistance;
    }
    thumb.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;

    if (distance < radius * 0.22) return setDirection(undefined);
    setDirection(
      Math.abs(deltaX) > Math.abs(deltaY)
        ? deltaX > 0 ? "east" : "west"
        : deltaY > 0 ? "south" : "north",
    );
  }

  element.addEventListener("pointerdown", (event) => {
    if (!mobilePointer.matches || activePointerId !== undefined) return;
    activePointerId = event.pointerId;
    element.setPointerCapture(activePointerId);
    updatePosition(event);
  });
  element.addEventListener("pointermove", (event) => {
    if (event.pointerId === activePointerId) updatePosition(event);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    element.addEventListener(eventName, (event) => {
      if (event.pointerId === activePointerId) reset();
    });
  }

  mobilePointer.addEventListener("change", syncVisibility);
  syncVisibility();
}
