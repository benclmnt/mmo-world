# Realtime World

An in-progress deterministic, real-time multiplayer tiled-world experiment.

## Current slice: M5 — hardening and load testing

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
identity/profile state, and simulation-facing state.

### Operations

- Per-connection input uses a 20-message/sec token bucket with a burst of 30.
- WebSocket payloads are capped at 4 KiB. Slow consumers are paused after Bun
  reports backpressure and disconnected at a 256 KiB queued-output limit.
- `GET /health` returns liveness; `GET /metrics` returns JSON counters and tick
  timings.
- Run a local synthetic load check with:

```bash
bun run load --url ws://127.0.0.1:3001/ws --clients 50 --duration 30
```

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
