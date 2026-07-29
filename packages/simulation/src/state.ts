import type { Entity, EntityId } from "./Entity";
import type { Terrain } from "./Terrain";

/** A serializable, point-in-time view of dynamic world state. */
export interface SimulationSnapshot {
  tick: number;
  /** Sorted by numeric entity ID for deterministic serialization. */
  entities: readonly Entity[];
}

/** A fixed 9×9 view of the world centered on an entity. */
export interface AgentObservation {
  tick: number;
  self: Entity;
  /** Top-left world coordinate of the row-major terrain window. */
  originX: number;
  originY: number;
  /** Row-major terrain values; null represents a coordinate outside the world. */
  terrain: readonly (Terrain | null)[];
  /** Entities within the observation window, sorted by numeric entity ID. */
  entities: readonly Entity[];
}
