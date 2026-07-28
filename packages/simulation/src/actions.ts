export type Direction = "north" | "south" | "east" | "west";

export type Action =
  | { type: "idle" }
  | { type: "move"; direction: Direction };

export interface StepInput {
  actions: ReadonlyMap<string, Action>;
}

export interface MovementEvent {
  type: "moved";
  entityId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface StepResult {
  tick: number;
  events: readonly MovementEvent[];
}
