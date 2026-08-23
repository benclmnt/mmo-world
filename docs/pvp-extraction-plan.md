# PvP Extraction MMO — Gameplay Plan

**Status:** Proposed gameplay direction, August 23, 2026. This promotes PvP
beyond the original v0 design, where combat was explicitly deferred.

## Player promise

This is a shared-world PvP MMO about leaving safety, taking resources from a
contested wilderness, and deciding whether to push farther or make it home.
Players should come away with rivalries, narrow escapes, ambushes, and reasons
to return—not just a higher counter.

**Product North Star:** **Build a real-time shared PvP world that feels alive
because many players inhabit it together and meaningfully affect one another.**

Extraction is the first gameplay loop that makes that promise tangible: players
share routes, compete over risk, and carry the consequences of their encounters
into the next decision.

## The core loop

```text
safe camp → choose a route → gather in the wilderness → encounter players
    ↑                                                        │
    └──── respawn / bank loot ← win, escape, or get knocked out ┘
```

1. **Start safe.** A player enters at the protected home camp where they cannot
   be attacked.
2. **Venture out.** Trees and rocks in the wilderness yield wood and stone.
3. **Carry risk.** Gathered resources are *unsecured*: they are valuable but can
   be lost if the player is knocked out.
4. **Make a decision.** The player can return to camp to secure their haul, or
   travel farther for more resources while becoming a more attractive target.
5. **Fight or flee.** Other players can chase, ambush, cooperate temporarily,
   or avoid one another.
6. **Extract.** At camp, unsecured resources become secured resources. Secured
   resources cannot be lost on knockout.

The first version should make gathering, fighting, escaping, and banking work
before it adds equipment, crafting, guilds, or permanent territory.

## First playable rules

### World and safety

- The map starts with **one central home camp** and **two field camps**. Their
  safe radii are deliberately small and clearly marked.
- The home camp is the only respawn point and provides the full secured stash.
  Field camps are deposit-only extraction points: they do not provide respawns
  or other full services.
- Attacks do no damage within a camp's safety radius. Valuable resource nodes
  must remain outside those radii.
- Leaving a camp's radius enables PvP. The UI clearly shows whether the player
  is protected or vulnerable.
- A newly respawned player receives a short protection period. It ends early if
  they attack, or when they leave camp; it cannot be used to safely gather in
  contested areas.
- The initial world remains one shared 64×64 map. Camps and their exact radius
  are deliberate map-design choices, not simulation accidents.

### Resources and extraction

- Trees yield wood and rocks yield stone using the existing hold-to-gather
  interaction. Nodes deplete and regrow.
- All newly gathered material goes into an **unsecured pack**. It is visible to
  the player and nearby opponents through the gameplay consequences, not by
  exposing exact inventories globally.
- At a camp's deposit point, a player holds the gather/interact control to
  transfer their unsecured pack into a **secured stash**. Field camps make this
  a shorter, lower-risk route home; the home camp remains the respawn hub.
- Secured resources are never dropped on knockout. They are the future input to
  crafting, upgrades, building, or trade; those systems are not part of this
  first combat slice.
- Initially, secured resources can be session-scoped while the loop is tested.
  Durable stashes should be added only with an explicit account/identity design;
  they are not a tick-loop database write.

### Combat

- PvP is directional melee: an attack targets the adjacent north, south, east,
  or west tile. There is no auto-targeting.
- Players have **100 health**. A valid hit deals **20 damage**.
- A player may attack once every **6 server ticks** (0.6 seconds at the current
  10 Hz simulation rate). Five hits knock out an unhealed player.
- Attack direction is explicit, with the last movement direction as the default
  for keyboard and touch controls. Attacking consumes that tick's action, so a
  player cannot both move and attack in the same tick.
- Movement resolves simultaneously first; valid attacks then resolve from the
  resulting positions. Damage is applied simultaneously. Two players can knock
  each other out on the same tick.
- Health starts regenerating only after the player has avoided damage for a
  short out-of-combat delay. The exact delay and rate are tuning values, not
  product rules.
- Combat is player-versus-player first. Existing bots continue to navigate and
  gather under ordinary world rules; hostile NPC behavior is a later feature.

### Knockout, loot, and recovery

- At zero health, a player is **knocked out**, not permanently killed.
- They drop **50% of their unsecured pack**, rounded down per resource type, as
  a visible loot pile at their final position. Secured resources are untouched.
- The victor—or any nearby player—can collect the pile by standing on it. Loot
  is intentionally contestable; a third party can turn a duel into a theft.
- The knocked-out player respawns at the **home camp** after a short delay with
  full health and an empty unsecured pack. They keep the remaining unsecured
  half.
- The first implementation must clean up loot deterministically: a pile either
  expires after a defined number of ticks or returns to the world as a resource
  source. We should choose one before implementation.

## What makes this extraction rather than an arena

```text
Arena:       fight → respawn → fight again
Extraction:  gather → risk a haul → fight or escape → bank or lose part of it
```

Combat is not the only goal. It protects a route, interrupts another player's
extraction, or creates an opportunity to steal resources. Banking makes a
successful escape meaningful, while partial loss keeps defeat recoverable.

## Player stories we want

- “I took one more node and got caught on the way back.”
- “We escorted each other home, then split the haul.”
- “I lost my stone to that player, tracked them down, and stole it back.”
- “Everyone knows the northern forest is valuable and dangerous.”

## Authority and networking rules

```text
browser input (move / gather / attack, sequence number)
                         │
                         ▼
                game server validates input
                         │
                         ▼
      simulation tick: move → gather/attack → damage → knockout/loot
                         │
                         ▼
         authoritative snapshot: position, health, state, loot, cooldowns
```

The simulation remains independent of sockets, timers, and SQLite. It owns
health, cooldowns, legal targets, simultaneous damage, loot, respawns, and
resource state. The game server owns WebSockets, player identity, input
sequencing, rate limits, scheduling, and broadcasts. This keeps combat replayable
and makes every outcome testable from a seed plus an action sequence.

Client prediction remains deliberately narrow. The client can immediately
animate an attack and continue predicting movement over known walkable terrain,
but it does not decide whether a hit, collision, or loot pickup succeeded. Each
snapshot acknowledges processed input sequences and corrects rejected predicted
movement; combat state always follows the server snapshot.

## Delivery sequence

### P1 — Combat foundation

- Add health, attack actions, facing, cooldowns, and attack events to the
  deterministic simulation.
- Resolve simultaneous movement and attacks; add exhaustive simulation tests for
  range, cooldowns, swaps, mutual knockouts, and deterministic replay.
- Send health and combat state in snapshots; render health and hit feedback.

### P2 — Knockout and loot

- Add knockout state, respawn scheduling, loot-pile entities, collection, and
  deterministic expiry.
- Add one central home camp, two deposit-only field camps, and respawn
  protection. Keep safe radii small and resource nodes outside them.
- Test that dropped/collected loot is conserved and cannot duplicate.

### P3 — Extraction

- Split inventory into unsecured pack and secured stash.
- Add a camp deposit interaction and clear UI for risk versus secured value.
- Instrument the loop: gathers, attacks, knockouts, loot collected, deposits,
  and return visits.

### P4 — Contested-world tuning

- Place worthwhile resource concentrations away from camp.
- Tune respawn, protection, drop percentage, health regeneration, and node
  density using playtests.
- Only then consider weapons, crafting, parties, territory control, or durable
  stashes.

## Decisions still needed

1. **Loss:** is a 50% unsecured-resource drop right, or should the initial test
   use 25% to be more forgiving?
2. **Camp placement:** which routes and resource areas should the two field
   camps support without sitting beside the richest nodes?
3. **Loot expiry:** should abandoned loot disappear after a fixed time, or turn
   back into world resources?
4. **Persistence:** when the loop works, should secured resources survive a
   browser/session reconnect, a server restart, or both?
5. **Combat feel:** should the first version be a readable 3–5 second duel, or
   a slower fight with room for retreat and intervention?
