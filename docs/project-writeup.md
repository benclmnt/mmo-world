# Realtime World — Project Writeup

## The experience

Realtime World is a shared browser world that you can enter in seconds. You see
other people and autonomous characters moving through the same landscape, explore
it together, and gather basic resources. The point of the current demo is the
feeling that the world is alive and shared—not a menu, a lobby, or a solo map.

## Product North Star — working draft

**Make a shared world that is instantly legible, meaningfully affected by its
inhabitants, and compelling enough to revisit.**

A promising first measure is **meaningful return**: the share of players who come
back and take a social or world-changing action, rather than only opening the
demo again. We should refine this together before treating it as a commitment.

To choose the final North Star, we need to decide:

1. Is the core promise **shared presence**, an **agent-populated world**, or
   **long-term player progress**?
2. What action should make a first visit feel meaningful: exploring, cooperating,
   gathering, building, or competing?
3. What must persist or evolve so a return visit has a clear reason to exist?

## What exists today

Players join one small, procedurally generated world from a browser. They move
around a tile-based landscape with other connected players and 20 server-run
bots. They can gather wood from trees and stone from rocks; inventory lasts for
the session. The demo is intentionally small: it proves shared presence,
responsive movement, and simple interaction before expanding into a larger game.

## How it works

The server is the source of truth. It advances the world ten times per second,
resolves every movement action together, and sends the resulting state to each
browser. The browser renders the scene and smooths the motion between updates;
it never decides whether an action succeeded.

The world is seeded and deterministic, so the same starting conditions and
actions produce the same result. People and bots use the same action rules.
SQLite stores lightweight room and reconnect metadata outside the real-time loop.
The project includes health/metrics endpoints and a synthetic load check for 50
connected clients alongside the resident bots.

## Deliberately not in scope yet

Combat, crafting, progression, accounts, teams, durable inventories, resource
depletion, matchmaking, and reinforcement-learning training are future choices,
not promises of this demo.
