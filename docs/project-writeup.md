# Realtime World

## The project

Realtime World is a browser-based PvP MMO in development. Players share one
real-time wilderness: they leave camp, gather resources, decide whether to push
their luck or extract, and encounter other players whose choices affect their
own.

The aim is not a sequence of isolated matches. It is a world that feels alive
when a player enters because many people are there at once—competing,
cooperating, escaping, and creating rivalries.

## Product North Star

**Build a real-time shared PvP world that feels alive because many players
inhabit it together and meaningfully affect one another.**

PvP extraction is the first loop in service of that goal: taking resources from
the wilderness creates risk; other players create uncertainty; banking a haul,
winning a fight, or narrowly escaping makes a session worth returning to.

## Planned player loop

```text
home camp → explore and gather → encounter players → fight or flee → extract or lose loot
```

A home camp is the respawn hub and full stash. Two small field camps offer
nearer deposit points but no respawn. Resources carried in the wilderness are
unsecured and partly dropped on knockout; deposited resources are secured.

## Technical foundation

```text
browser client → WebSocket game server → deterministic simulation
     rendering       connections/ticks       world rules/state
```

The simulation is separate from the game server so game rules stay deterministic,
replayable, and independent of sockets, timers, and database work. The server
owns connection lifecycle, input validation, scheduling, and broadcasts. The
browser renders authoritative state, predicts only local movement over known
terrain, and reconciles it when snapshots acknowledge or reject an input.

Today, the demo already has a seeded 64×64 shared world, authoritative
simultaneous movement at 10 Hz, browser rendering, server-controlled bots,
gathering, resource depletion/regrowth, reconnect metadata, and load hardening.
Combat, camps, loot, and extraction are planned next.

For detail, see [`v0-design.md`](v0-design.md) and
[`pvp-extraction-plan.md`](pvp-extraction-plan.md).
