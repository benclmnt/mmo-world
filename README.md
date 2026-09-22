# Realtime World — PvP Extraction MMO

## The project

Realtime World is a real-time PvP MMO for web browsers.

Many players share one wilderness at the same time.
Players leave a safe camp, gather resources, and meet other players.
Each player can fight, run away, or work with others.

This is not a set of separate matches.
The goal is one active world with competition, teamwork, escape, and rivalries.

## Product goal

Build a shared PvP world where players have real effects on other players.

The project succeeds when players notice each other through shared risks and results.
A high number of connected clients is not enough.

Long-term progress gives players a reason to return.
The first gameplay loop is PvP extraction.

## Player loop

```text
home camp → choose a route → gather in the wilderness → meet players
    ↑                                                        │
    └──── respawn / bank loot ← win, escape, or get knocked out ┘
```

1. Start at the protected home camp.
2. Go into the wilderness to gather wood and stone.
3. Carry these resources as unsecured loot.
4. Choose to continue, fight, escape, or extract at a camp.
5. Deposit resources to make them secured.
6. Return with progress, a close escape, an ally, or a rival.

## Secured and unsecured resources

Unsecured resources are resources carried in the wilderness.
A knockout drops some unsecured resources as loot.

Secured resources are resources deposited at a camp.
A knockout does not remove secured resources.

```text
Gather 10 wood → carry 10 unsecured wood → get knocked out → lose some wood
Gather 10 wood → deposit at camp → own 10 secured wood → lose no wood
```

Secured resources can later support crafting, upgrades, trade, and building.

## Camps and map

The first 64 × 64 world will have these camps:

- One central home camp. It is the only respawn point and has the full secured stash.
- Two field camps. They accept deposits, but do not provide respawns or full services.

Each camp has a small, visible safe area.
PvP starts outside the safe area.
High-value resource nodes are outside the safe areas.

Field camps give players more route choices.
They must not make most of the map safe.

## First combat rules

Combat must be clear, server-controlled, and important.
The first version does not need gear, classes, or special abilities.

- Attack one adjacent tile: north, south, east, or west.
- The game does not choose a target automatically.
- Each player has 100 health.
- A valid hit deals 20 damage.
- A player can attack once every six server ticks.
- The server runs at 10 ticks each second.
- An attack uses the player action for that tick.
- A player cannot move and attack in the same tick.
- Movement resolves first for all players.
- Attacks then use the new positions.
- Damage applies at the same time for all valid attacks.
- Two players can knock out each other at the same time.
- Health regenerates only after time outside combat.

## Knockout and loot

At zero health, a player is knocked out. The player is not permanently killed.

A knocked-out player drops 50% of each unsecured resource type, rounded down.
The dropped resources form a visible loot pile.
Other players can collect this loot.

After a short delay, the player respawns at the home camp with full health.
Secured resources are never lost.
The loot expiry rule is still open.

New players have short protection after respawn.
This protection ends when they attack or leave camp.
It must not allow safe gathering in contested areas.

## Why extraction PvP

```text
Arena game:     fight → respawn → fight again
Extraction MMO: gather → risk a haul → fight or escape → bank or lose part of it
```

Combat supports the world loop.
It can protect routes, stop an extraction, enable theft, and create stories.

Partial loss makes danger real without resetting a player completely.

The project should create stories like these:

- “I took one more node and got caught while I returned.”
- “We protected each other, then split the resources.”
- “I lost my stone, followed them, and took it back.”
- “The north forest has good resources, but it is dangerous.”

## Architecture

```text
                        ┌──────────────────────┐
                        │ Browser client       │
                        │ controls, prediction │
                        │ Three.js rendering   │
                        └──────────┬───────────┘
                                   │ WebSocket actions
                                   ▼
                        ┌──────────────────────┐
                        │ Game server          │
                        │ connections, inputs, │
                        │ scheduling, metrics  │
                        └──────────┬───────────┘
                                   │ actions / snapshots
                                   ▼
                        ┌──────────────────────┐
                        │ Simulation engine    │
                        │ world, movement,     │
                        │ combat, loot, rules  │
                        └──────────────────────┘
                                   ▲
                                   │ observations / actions
                        ┌──────────┴───────────┐
                        │ Bot controllers      │
                        └──────────────────────┘
```

SQLite stores the room seed, player reconnect data, and session records.
SQLite does not run the real-time simulation loop.

## Why the simulation is separate

The simulation owns the game rules.
It owns world state, entities, movement, combat, health, cooldowns, gathering, loot, and respawns.

The simulation does not use WebSockets, timers, or the database.

The game server owns connections, identity, input checks, input order, rate limits, scheduling, backpressure, and broadcasts.

This design makes each result repeatable.
A world seed and an action list can replay the result.

Humans, bots, and future training agents can use the same action interface.

## Client movement prediction

The browser predicts only its own movement on known walkable terrain.
It does not predict other player positions, hits, or loot results.

```text
player presses W
  → browser moves at once and sends action #42
  → server runs the next shared tick
  → snapshot confirms action #42
```

If the server accepts the move, the browser keeps the movement smooth.
If the server rejects the move, the browser returns to the server position.

Each action has a sequence number.
The server snapshot confirms the latest processed sequence and the move result.

The browser smooths other players between snapshots.
The server controls combat and all contested results.
