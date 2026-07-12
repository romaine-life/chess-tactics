---
status: accepted
date: 2026-07-11
deciders: owner (Nelson) + Codex
---

# ADR-0077: Multiplayer is one game projected through seat-local clients

## Context

Lobby play put two humans on one authored board, but its first implementation mixed
three different concerns: the canonical `player` / `enemy` faction ids in the game
state, the side controlled by the person looking at a particular client, and the
transport used to sequence their moves. That made client-local features such as
premoves conditional on transport, rendered several guest controls from the host's
perspective, and created parallel settlement and lifecycle paths that could disagree
with solo play or survive into another match.

The rules engine already has the right shared object: both clients deterministically
replay one `(level, seed, ordered moves)` game. The missing decision is how a client
projects that game for its seat and how asynchronous work is prevented from escaping
the match that created it.

## Decision

Multiplayer is **one canonical simulation with one seat-local interface per
participant**. Lobby mode does not own a second gameplay model.

### Canonical factions are not interface perspective

`player` and `enemy` remain stable serialized simulation identities. Each interactive
client instead owns a `localSide`; its `opponentSide` is derived once from that value.
Player-facing ownership, pronouns, controls, overlays, roster behavior, objective
briefings, event copy and result copy are projected through those two values. A UI
comparison against literal `player` or `enemy` is valid only when it describes authored
simulation content, never when it means "you" or "opponent."

Objective instructions come from the same ordered `VictoryRule[]` that adjudicates the
match. Each seat sees its ways to win and the conditions it must prevent; lobby copy is
not produced by handing both clients the preset's historical player-facing string.

Client-local interaction features are transport-independent. Selection, focus,
inspection, overlays, promotion choice and premoves work for either seat. A premove is
queued locally while the opponent owns the turn, revalidated after the authoritative
opponent relay, and submitted as the next normal move intent. Promotion is selected
when the premove is queued and travels with that queued step.

### The server sequences; clients commit only relays

A local lobby gesture creates one pending move intent for the current expected relay
index. While it is pending, that client cannot submit a second intent. The board is not
optimistically mutated: only the server echo/backfill commits the move. A matching echo
clears the pending intent; a rejection or authoritative backfill clears it with a
recoverable error and restores input from the authoritative position. Stale or duplicate
intents never choose a turn by request-arrival race.

Selection and focus remain client-local context. A relay invalidates them only when the
referenced piece no longer exists or is no longer owned; it does not select an arbitrary
first piece merely because a network event arrived.

### Asynchronous work belongs to one match session

Every new, resumed or network match gets a distinct session generation. Delayed AI
replies, worker callbacks, premove-fire beats, clock callbacks and relay handlers capture
that generation and must be cancelled or rejected when it is no longer current. Starting,
resuming, concluding or leaving a match clears mode-specific state. A same-level route
transition is still a new match when its authority mode changes.

### One committed-position adjudicator serves every consumer

`applyMove` owns chess movement/capture mechanics and move-derived history; it does not
silently award a product victory ahead of authored rules. Last-side-standing behavior is
expressed by the preset/authored victory rules like any other win condition.

After the initial position and after every committed move, one pure settlement operation
is used by solo play, lobby play, live AI, self-play, replay and search. It returns the
winner, terminal kind and fired authored rule. The order is:

1. ordered authored/preset victory rules (ADR-0064);
2. checkmate or stalemate for a side with no legal move;
3. enabled chess draw rules, whose internal mate precedence remains ADR-0072 exact.

The exact resolved `VictoryRule[]` is part of AI and self-play input. The headline
objective enum is presentation/content metadata, not permission for a consumer to rebuild
a parallel ruleset. Every result surface retains the fired rule name or exact draw reason
and then renders winner-relative copy through the local perspective.

### Lobby lifecycle is explicit

- An explicit participant Leave during a live match is a resignation. The server publishes
  the terminal result before any seat cleanup or closure can remove the opponent's result.
- A transport disconnect is not itself a resignation; the existing reconnect/backfill path
  remains authoritative.
- The interactive play route requires a seat. Until a dedicated spectator interface is
  accepted, observers are explicitly redirected/rejected rather than defaulted to `player`.
- Authored time control is never silently discarded. Until a server-authoritative
  multiplayer clock exists, timed levels are ineligible to start in a lobby with a visible
  explanation.
- Retry, restart and rematch remain coordinated server operations; fixed board orientation
  remains governed by the board-render contract.

## Consequences

- Host and guest can share gameplay code without sharing presentation perspective.
- Network latency can delay a move but cannot select between multiple same-turn intents.
- Work created by a solo match cannot mutate a later lobby match.
- A single move sequence has one outcome across live, netplay, training and search, as
  already required by ADR-0072.
- The implementation must add mirrored-seat UI tests, mode-transition/session tests,
  authoritative-relay tests and a real two-client lobby exercise; pure `applyMove`
  determinism alone is insufficient coverage.
- Multiplayer clocks and a spectator surface remain separate features. Their absence is
  explicit and cannot change an authored match silently.

## Related decisions

Refines ADR-0064 (ordered victory rules) and ADR-0072 (cross-consumer settlement parity).
Applies ADR-0059 by requiring shared perspective, session and settlement primitives rather
than lobby-only parallels. The consolidated current-state rules live in
`docs/multiplayer-contract.md`.
