# Realtime World

An in-progress deterministic, real-time multiplayer tiled-world experiment.

## Current slice: M7 — gathering and inventory

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
SQLite metadata boundary and is never called by the tick loop.

### Gathering

- Hold **E** (or the mobile **Gather** button) while standing on a tree, or while
  facing an adjacent tree/rock, to gather wood/stone every five server ticks.
- Resources are currently inexhaustible and inventory is session-local. Gathering
  is deterministic and server-authoritative; it does not add tick-loop database writes.

### Persistence

- SQLite defaults to `data/realtime-world.sqlite` (override with `DATABASE_PATH`).
- It persists the room seed, player display names, hashes of rotating reconnect
  tokens, and session timestamps—not positions, actions, ticks, or snapshots.
- The browser saves its opaque reconnect token locally after its first join.

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
