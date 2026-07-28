/** Logical terrain only. Rendering chooses the visual representation. */
export enum Terrain {
  Grass = 0,
  Water = 1,
  Tree = 2,
  Rock = 3,
}

export function isWalkable(terrain: Terrain): boolean {
  return terrain === Terrain.Grass || terrain === Terrain.Tree;
}

export function terrainGlyph(terrain: Terrain): string {
  switch (terrain) {
    case Terrain.Grass:
      return ".";
    case Terrain.Water:
      return "~";
    case Terrain.Tree:
      return "T";
    case Terrain.Rock:
      return "#";
  }
}
