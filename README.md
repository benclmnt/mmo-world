# Realtime World

An in-progress deterministic, real-time multiplayer tiled-world experiment.

## Current slice: M3 — multiplayer guests

The Bun server owns one generated world and an independent entity for every
WebSocket guest. It advances the simulation at 10 Hz, resolves all player
movement simultaneously, and broadcasts authoritative snapshots to every
connected browser. Guests receive a monotonic entity ID, an editable display
name, and a roster; leaving immediately removes their entity from the shared
room. The browser renders and interpolates both local and remote players.

The server is split deliberately: `server.ts` owns Bun/WebSocket transport and
the tick scheduler, while `game-room.ts` owns room membership, input sequencing,
identity/profile state, and simulation-facing state.

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
