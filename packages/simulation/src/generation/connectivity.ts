import { isWalkable, Terrain } from "../Terrain";
import { World } from "../World";

export interface ConnectivityReport {
  totalWalkable: number;
  reachableWalkable: number;
  isFullyConnected: boolean;
}

/** Flood-fills the first walkable tile and reports whether every walkable tile joins it. */
export function analyzeWalkableConnectivity(world: World): ConnectivityReport {
  let startIndex = -1;
  let totalWalkable = 0;

  for (let index = 0; index < world.tiles.length; index++) {
    if (isWalkable(world.tiles[index] as Terrain)) {
      totalWalkable++;
      if (startIndex === -1) {
        startIndex = index;
      }
    }
  }

  if (startIndex === -1) {
    return { totalWalkable: 0, reachableWalkable: 0, isFullyConnected: false };
  }

  const visited = new Uint8Array(world.tiles.length);
  const queue = new Int32Array(world.tiles.length);
  let head = 0;
  let tail = 0;
  let reachableWalkable = 0;

  queue[tail++] = startIndex;
  visited[startIndex] = 1;

  while (head < tail) {
    const index = queue[head++];
    reachableWalkable++;
    const x = index % world.width;
    const y = Math.floor(index / world.width);

    visit(x, y - 1);
    visit(x + 1, y);
    visit(x, y + 1);
    visit(x - 1, y);
  }

  return {
    totalWalkable,
    reachableWalkable,
    isFullyConnected: reachableWalkable === totalWalkable,
  };

  function visit(x: number, y: number): void {
    if (!world.inBounds(x, y)) {
      return;
    }

    const index = y * world.width + x;
    if (visited[index] || !isWalkable(world.tiles[index] as Terrain)) {
      return;
    }

    visited[index] = 1;
    queue[tail++] = index;
  }
}
