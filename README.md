# Realtime World

An in-progress deterministic, real-time multiplayer tiled-world experiment.

## Current slice: M2 — authoritative WebSocket movement

A Bun game server owns one generated world and one player entity. It advances the
simulation at 10 Hz, accepts sequenced movement actions through WebSocket, and
sends an authoritative entity snapshot every tick. The browser receives terrain
once and only renders server-confirmed positions with visual interpolation.

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
