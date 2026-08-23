# Realtime World

An in-progress deterministic, real-time multiplayer tiled-world experiment.

## Current slice: M8 — resource node lifecycle

The Bun server owns one generated world, an independent entity for every
WebSocket guest, and 20 deterministic server-controlled bots. Bots cycle through
random-walker, persistent-wanderer, and obstacle-aware-wanderer policies; every
policy emits the same move/idle actions used by people. It advances the simulation at 10 Hz, resolves all player
movement simultaneously, and broadcasts authoritative snapshots to every
connected browser. Guests receive a monotonic entity ID, an editable display
name, and a roster that includes bots; leaving immediately removes their entity from the shared
room. The browser renders and interpolates both local and remote players.

The server is split deliberately: `server.ts` owns Bun/WebSocket transport and
the tick scheduler, while `game-room.ts` owns room membership, input sequencing,
identity/profile state, and simulation-facing state. `persistence.ts` owns the
SQLite identity/inventory boundary; completed gathers checkpoint the affected
player inventory without persisting world simulation state.

### Gathering

- Hold **E** (or the mobile **Gather** button) while standing on a tree, or while
  facing an adjacent tree/rock, to gather wood/stone every five server ticks.
- Trees hold 3 wood and rocks hold 4 stone. A depleted node regrows after 100 server ticks.
- Snapshots transmit only nodes below full capacity; the client restores omitted nodes as full.
- Depletion state remains in-memory and is not written by the tick loop.
- When players contest fewer remaining charges, the server uses a deterministic per-tick lottery rather than entity-ID priority.
- The client immediately predicts a gathering attempt, then corrects inventory/node state from the next authoritative snapshot.

### Persistence

- SQLite defaults to `data/realtime-world.sqlite` (override with `DATABASE_PATH`).
- It persists the room seed, player display names, per-player wood/stone
  inventory, hashes of rotating reconnect tokens, and session timestamps—not
  positions, actions, ticks, or resource-node state.
- The browser saves its opaque reconnect token locally after its first join.
  That token is the stable browser identity binding; a separate client-supplied
  UUID is not trusted. On reconnect/refresh the server restores the inventory
  for that identity into the new session entity.

### Operations

- Per-connection input uses a 20-message/sec token bucket with a burst of 30.
- WebSocket payloads are capped at 4 KiB. Slow consumers are paused after Bun
  reports backpressure and disconnected at a 256 KiB queued-output limit.
- `GET /health` returns liveness; `GET /metrics` returns JSON counters, tick
  timing, snapshot-construction, and broadcast timing.
- To distinguish client frame pacing from snapshot/server delays on a device,
  open the client with `?perf=1`. The on-screen panel is local only and reports
  frame/snapshot percentiles plus current server tick metrics.
- Run the M5 synthetic acceptance check (50 clients plus the 20 resident bots) with:

```bash
bun run load --url ws://127.0.0.1:3001/ws --clients 50 --duration 300
```

The command exits non-zero if clients fail to connect/close cleanly, a socket
errors or drops before teardown, or fewer than 80% of the expected 10 Hz
snapshots arrive. Its final JSON record includes server counter deltas for the
run (overruns, backpressure, skipped/sent snapshots).

### Run locally

In one terminal, start the game server (port 3001 by default):

```bash
bun run server
```

In another, start the Vite client (port 8000):

```bash
bun run dev
```

The Vite development server proxies browser WebSocket requests from `/ws` to the
Bun game server. Open the client at port 8000 and move with WASD or arrow keys.

## Checks

```bash
bun test
bun run typecheck
bun run build
bun run world:print 12345
```

See [`docs/v0-design.md`](docs/v0-design.md).
