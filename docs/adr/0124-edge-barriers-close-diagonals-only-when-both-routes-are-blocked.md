---
status: "accepted"
date: 2026-07-14
deciders: Nelson
---

# ADR-0124: Edge barriers close a diagonal only when both routes are blocked

## Context

The current board model stores a fence or wall as a blocker on one shared edge
between two orthogonally adjacent cells. That model makes a direct orthogonal
crossing unambiguous, but the previous rules treated every diagonal as if it
crossed no edge at all. A bishop or queen could therefore attack through the
corner where two blocking edges met, even though the two barriers visibly and
logically closed that corner.

A future wall system may own richer geometry. The current edge model still
needs one deterministic movement and line-of-sight rule that works without
inferring collision from rendered pixels.

## Decision Drivers

- A lone edge must not seal a diagonal when the piece can pass around its end.
- Two barriers that meet around a corner must close that diagonal.
- Direct movement through a flat barrier must remain blocked.
- Movement, capture, attack, check, AI, and solver legality must agree.
- Collision must come from canonical level geometry, including for pre-drawn
  scenes, rather than from image interpretation.

## Considered Options

- Let every diagonal ignore edge barriers.
- Let any one neighboring barrier block a diagonal.
- Block a diagonal only when both orthogonal routes around its corner are
  blocked.

## Decision Outcome

Chosen: **block a diagonal only when both orthogonal routes around its corner
are blocked**.

For a diagonal step from one cell to another, there are two routes through the
two side-adjacent cells: horizontal then vertical, or vertical then horizontal.
A route is closed when either edge along that route is blocked. The diagonal is
closed only when both routes are closed; if either complete route remains open,
the diagonal remains open.

An orthogonal step has one direct shared edge. A barrier on that edge blocks the
step completely; this is the flat-wall case and does not require a second
parallel edge. Non-adjacent jumps, including normal knight movement, do not
traverse intermediate edges and continue to hop barriers.

This is one shared legality rule. Sliding movement and attack rays, king steps,
pawn movement and captures, check detection, castling paths, AI search, replay,
multiplayer, and the solver must all consume the same result where their move
geometry crosses these edges. Rendered fence or wall pixels never participate
in the decision. A future richer wall geometry requires a new decision rather
than an exception hidden in one consumer.

### Consequences

- Good: a joined corner stops bishop and queen movement and line of sight.
- Good: a lone wall end still allows diagonal movement around it.
- Good: pre-drawn and composited boards retain identical collision because the
  canonical level edge set remains authoritative.
- Cost: every move and attack path must use the shared crossing predicate;
  hand-written exceptions can make check disagree with legal movement.
- Cost: this rule describes the current edge-barrier model, not the richer wall
  geometry that may replace it later.

## Pros and Cons of the Options

### Let every diagonal ignore edge barriers

- Good: preserves the former simple orthogonal-only check.
- Bad: leaks movement and attacks through a corner closed by two barriers.

### Let any one neighboring barrier block a diagonal

- Good: makes barriers maximally restrictive.
- Bad: turns the open end of one barrier into an invisible full-corner blocker.

### Require both routes to be blocked

- Good: expresses the owner's open-versus-closed model directly.
- Good: distinguishes going around one wall end from passing through a sealed
  corner.
- Bad: requires checking two short routes for each adjacent diagonal crossing.

## More Information

The current product rule is summarized in the edge-barrier subsection of
[`game-concept.md`](../game-concept.md). Pre-drawn scenes remain subordinate to
canonical gameplay geometry under [ADR-0133](0133-pre-drawn-boards-use-one-registered-live-media-plate.md)
and [ADR-0123](0123-accepted-predrawn-scenes-keep-their-pixels-and-saved-alignment.md).
