import type { World } from "./World";
import { isWalkable } from "./Terrain";

export interface Camp { id: "home" | "field-west" | "field-east"; kind: "home" | "field"; x: number; y: number; radius: number; }

/** Deterministic landmarks, deliberately separated from terrain generation. */
export function createCamps(world: World): readonly Camp[] {
  const targets = [
    { id: "home" as const, kind: "home" as const, x: Math.floor(world.width / 2), y: Math.floor(world.height / 2) },
    { id: "field-west" as const, kind: "field" as const, x: Math.floor(world.width * 0.22), y: Math.floor(world.height * 0.28) },
    { id: "field-east" as const, kind: "field" as const, x: Math.floor(world.width * 0.78), y: Math.floor(world.height * 0.72) },
  ];
  return targets.map((target) => ({ ...target, radius: 3, ...nearestWalkable(world, target.x, target.y) }));
}

export function campAt(world: World, x: number, y: number): Camp | undefined {
  return world.camps.find((camp) => distanceSquared(camp, { x, y }) <= camp.radius * camp.radius);
}
export function isSafeAt(world: World, x: number, y: number): boolean { return campAt(world, x, y) !== undefined; }
export function distanceSquared(a: { x: number; y: number }, b: { x: number; y: number }): number { const dx = a.x - b.x; const dy = a.y - b.y; return dx * dx + dy * dy; }

function nearestWalkable(world: World, x: number, y: number): { x: number; y: number } {
  for (let radius = 0; radius < Math.max(world.width, world.height); radius++) {
    for (let yOffset = -radius; yOffset <= radius; yOffset++) for (let xOffset = -radius; xOffset <= radius; xOffset++) {
      if (Math.max(Math.abs(xOffset), Math.abs(yOffset)) !== radius) continue;
      const candidateX = x + xOffset, candidateY = y + yOffset;
      if (world.inBounds(candidateX, candidateY) && isWalkable(world.get(candidateX, candidateY))) return { x: candidateX, y: candidateY };
    }
  }
  throw new Error("World has no walkable camp location");
}
