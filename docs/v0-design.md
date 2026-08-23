# Realtime Procedural Multiplayer World — v0 Design Draft

**Status:** Working draft — decisions remain open and will be made collaboratively.
The PvP extraction direction promoted after this baseline is in
[`pvp-extraction-plan.md`](pvp-extraction-plan.md).

## Product direction

Build a browser-based, real-time, tile-based multiplayer world inspired by the broad shape of NeuralMMO.

**Product North Star:** **Build a real-time shared PvP world that feels alive
because many players inhabit it together and meaningfully affect one another.**

The product succeeds when concurrent human players feel each other's presence
through competition, cooperation, and shared consequences—not merely when many
sockets are connected. Persistence and progression should give players reasons
to return; PvP extraction is the first proposed gameplay loop for doing so.

- Human-controlled players, agent teams, and NPCs inhabit a shared authoritative world.
- The long-term goal is to reuse the simulation for reinforcement-learning training, so simulation boundaries must remain generic and deterministic.
- RL training, teams, and broader persistence are out of the first playable v0 unless explicitly promoted into scope later. PvP extraction has now been promoted as a proposed follow-on direction; see [`pvp-extraction-plan.md`](pvp-extraction-plan.md).
- The initial deployment target is one exe.dev VM and a small single-machine server.
- SQLite is the intended persistence technology when persistence is introduced; it must not become a dependency for the real-time tick loop.

This document records the proposed v0 plan supplied on July 28, 2026. It is a starting point for discussion, not a final architecture.

## v0 objective

Create a minimal playable browser-based real-time multiplayer isometric 3D world:

- Server owns authoritative state.
- Browser clients send movement intentions through WebSockets.
- Three.js renders the shared procedural tile world as a lightweight isometric 3D scene.
- Human players and server-controlled heuristic agents use the same action interface.
- A 64×64 seeded world contains grass, water, trees, and rocks.
- Movement is four-directional, collision-aware, simultaneous, deterministic, and visually interpolated.
- The initial target supports 20+ bots and a basic load test of 50 synthetic clients.

## Proposed milestone sequence

### M0 — Headless deterministic simulation

Implement the simulation before rendering or networking.

- 64×64 grid; seeded procedural terrain.
- Logical terrain: grass, water, tree, rock.
- Walkable: grass and tree. Blocked: water and rock.
- Humans and bots as generic entities.
- `step({ actions })` is the only simulation advancement mechanism; no timers inside simulation.
- Deterministic RNG, spawn selection, collision rules, snapshots, and agent observations.
- Terrain and state determinism tests.

Completion checks:

- Same seed => same terrain.
- Same seed/entities/actions => same state after every step.
- Blocked terrain and shared occupancy are impossible.
- Spawn locations are selected deterministically from unoccupied grass tiles in a sufficiently connected playable region.

### M1 — Local Three.js world

Render one locally controlled test player before networking.

- Three.js instanced terrain meshes and lightweight entity meshes.
- Stylized low-poly materials, deterministic visual variants, simple water surfaces, and clustered trees/rocks.
- Orthographic camera follows player.

### M2 — One server-connected client

Replace local authority with Bun WebSocket server authority.

- One room, one simulation, 10 Hz tick loop.
- Initial terrain definition sent once; entity snapshots sent every tick.
- Keyboard inputs become actions sent to server.
- Three.js renders only authoritative positions, with interpolation.

### M3 — Multiplayer

- Guest identity and display names.
- Join/leave lifecycle, unique entity IDs, shared room state.
- Remote interpolation and connection status.

### M4 — Heuristic agents

- At least 20 bots using ordinary move/idle actions.
- Initial policies: random walker, persistent wanderer, obstacle-aware wanderer.
- Bots must obey exactly the same simulation collision and terrain rules as humans.

### M5 — Hardening and load testing

- Incoming-message validation, rate limits, size limits, backpressure safeguards.
- Health and metrics endpoints; structured logs and tick-overrun monitoring.
- Synthetic WebSocket clients; 50 clients plus 20 bots at 10 Hz.

### M6 — Optional SQLite persistence

SQLite persists only durable metadata in `data/realtime-world.sqlite`: the single room's seed, opaque rotating reconnect-token hashes, stable player IDs/display names, and session start/end timestamps. Tokens are delivered only in a player's `world` message and are not included in snapshots or roster profiles. It does **not** persist every tick, movement, snapshot, socket state, or authoritative entity position.

### M7 — Gathering and session inventory

- Hold-to-gather actions target a tree underfoot or a neighboring tree/rock.
- Server-authoritative, deterministic yields with a simulation-tick cooldown.
- Per-session wood/stone inventory is included in snapshots.
- Crafting and durable inventory remain deferred.

### M8 — Resource-node lifecycle

- Trees yield three wood; rocks yield four stone before depletion.
- Fully depleted nodes regrow after 100 simulation ticks.
- Client visuals darken depleted nodes, using sparse authoritative node snapshots.
- Scarce simultaneous gathers use a deterministic per-tick lottery; clients predict attempts and reconcile state from snapshots.

## Architectural boundaries


```text
Three.js client -- JSON/WebSocket --> Game server -- actions/snapshots --> Simulation
```

### Simulation owns

- World seed, tile grid, terrain-backed resource nodes, occupancy, entities, spawn selection.
- Movement and gathering validation, simultaneous resolution.
- Tick number, deterministic snapshots, RNG, and agent observation API.

### Game server owns

- Sockets, connection lifecycle, guest identities, input validation, rate limits.
- Latest pending human input, bot-policy invocation, scheduler, broadcasts, metrics/logging/backpressure.

### Three.js client owns

- Tile/entity rendering, keyboard state, outgoing intentions, interpolation, camera, connection UX.
- Mapping logical terrain to deterministic visual frame choices.

The client never decides whether a movement succeeds.

Core simulation entity IDs are non-negative safe integers. Socket/connection IDs, display names, and any future persistent account identifiers remain separate server or presentation concerns.

```ts
export type Direction = "north" | "south" | "east" | "west";

export type Action =
  | { type: "idle" }
  | { type: "move"; direction: Direction }
  | { type: "gather"; direction: Direction };

export interface StepInput {
  actions: ReadonlyMap<EntityId, Action>;
}

export interface Simulation {
  readonly tick: number;
  step(input: StepInput): StepResult;
  /** Places an entity at an explicitly validated position. */
  placeEntity(entity: Entity): void;
  /** Deterministically chooses an unoccupied grass spawn tile. */
  spawnEntity(entityId: EntityId, options: SpawnOptions): Entity;
  removeEntity(entityId: EntityId): boolean;
  getEntity(entityId: EntityId): Entity | undefined;
  observeAgent(entityId: EntityId): AgentObservation;
  createSnapshot(): SimulationSnapshot;
}
```

## Terrain generation (proposed)

Use a deterministic, portable generation implementation. The first terrain model is deliberately minimal:

- `Grass`: walkable open ground.
- `Tree`: walkable forest terrain; may later transition to grass when harvested and back through regrowth.
- `Water`: blocked.
- `Rock`: blocked.

The generator produces broad noise-shaped lakes, clustered traversable forests, and rock regions. Some deterministic candidates also receive a variable-width river that runs from a map edge into an interior lake.

There is no forced central clearing. When entity spawning is implemented, it will select unoccupied `Grass` tiles deterministically from the connected playable region. Spawn selection uses a configurable minimum Manhattan (four-direction movement) separation from existing entities. It never silently violates that policy: if no qualifying tile exists, selection fails explicitly.

A generated candidate is accepted only when **all walkable tiles** (`Grass` and `Tree`) form one four-directionally connected region. If a candidate fails, the generator derives a deterministic attempt seed from the public world seed and retries; therefore the same public seed still always produces the same accepted world.

The simulation stores only logical tile IDs. Visual variants derive deterministically from seed, coordinates, tile type, and optional neighbours.

## Simultaneous movement (proposed)

Per tick:

1. Calculate destinations for all actions.
2. Reject out-of-bounds and blocked destinations.
3. Reject multiple movers targeting one destination.
4. Reject direct swaps.
5. Reject moves into occupied cells unless the occupant has an accepted move away.
6. Apply accepted moves simultaneously.

Resolution must be deterministic and independent of incidental map iteration order.

## Networking (proposed)

- Bun `Bun.serve` with native WebSockets.
- One process, one room, one simulation, initially 10 ticks/sec.
- JSON messages, latest valid human action retained per entity per tick.
- Input sequence numbers are monotonic; stale/duplicate input is ignored.
- World definition sent on join/reconnect; full entity snapshot initially sent every tick.
- Snapshots are replaceable under backpressure: never build an unlimited per-client queue.

## Proposed repository layout

```text
apps/
  client/
  server/
packages/
  protocol/
  simulation/
tests/
  load/
docs/
```

## Explicitly deferred from v0

RL and training pipeline, teams/factions, crafting, progression, chat, accounts/OAuth, multi-room matchmaking, distributed services, Redis/Postgres, client prediction/rollback, pathfinding/navmeshes, advanced graphics, dynamic/destructible worlds, and durable inventories. PvP combat and extraction are covered separately in [`pvp-extraction-plan.md`](pvp-extraction-plan.md).

## First design questions to resolve together

1. What should the **very first playable slice** include: M0 only, or M0 plus a minimal local Three.js viewer?
2. Should v0 use a fixed configured seed, a seed configurable at process startup, or generate one and expose it?
3. What exact abstraction do we want for future agent teams: generic entities plus a `controller` outside simulation, or a first-class team field now?
4. When should SQLite enter the project: scaffolded from the start but unused by the tick loop, or added after multiplayer works?
5. What visual direction and asset licensing constraints do you prefer for the initial tileset?
6. Should the 50-person target mean 50 concurrent real browser users, or 50 connected clients as the initial operational baseline?

## Definition of done for first playable v0

A deterministic, visually coherent 64×64 world runs authoritatively on one server; at least four browsers see the same positions; at least 20 heuristic bots obey normal terrain/entity rules; movement is interpolated between 10 Hz snapshots; clean disconnect handling, deterministic tests, health/metrics, and a 50-client synthetic-load test are present.
