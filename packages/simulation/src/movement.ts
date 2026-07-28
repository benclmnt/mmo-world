import type { Direction } from "./actions";

export interface Delta {
  x: number;
  y: number;
}

export function directionDelta(direction: Direction): Delta {
  switch (direction) {
    case "north":
      return { x: 0, y: -1 };
    case "south":
      return { x: 0, y: 1 };
    case "east":
      return { x: 1, y: 0 };
    case "west":
      return { x: -1, y: 0 };
  }
}
