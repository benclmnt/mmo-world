export type EntityId = number;

/** Dynamic simulation object. Its controller and visual appearance live outside this core shape. */
export interface Entity {
  id: EntityId;
  x: number;
  y: number;
}
