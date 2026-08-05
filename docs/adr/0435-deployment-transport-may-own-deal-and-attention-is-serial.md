---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0422](0422-deployment-deals-a-visible-deck-before-transport-begins.md)'s unavailable transport before Deal"
refines:
  - "[ADR-0421](0421-a-preparing-scene-has-no-permission-to-perform.md)"
  - "[ADR-0434](0434-full-deploy-is-one-placement-wave-and-one-discard.md)"
---

# ADR-0435: Deployment transport may own Deal and attention is serial

## Context

Deployment initially disabled Play, Next, and Full deploy until the dedicated Deal action had
settled. After Deal it also flipped His Grace automatically even while paused, so pressing Full
deploy could overlap an unsolicited card reveal with the unit wave. The batch then ended with a
local fade that did not visibly return the cards to their deck.

## Decision

- Play, Next, and Full deploy are available at the awaiting-Deal boundary. Pressing one first
  performs the canonical Deal, then continues with that exact intent: Play starts the ordinary
  sequence, Next reveals and places one ordinary unit before pausing, and Full deploy performs its
  one automatic placement wave.
- The dedicated Deal action and automatic-Deal preference still Deal into a paused face-down pile.
  A paused pile never reveals its top card merely because Deal completed. Play or Next explicitly
  owns a reveal; Full deploy bypasses card reveals.
- Full deploy has two non-overlapping attention beats after Deal. First, every remaining automatic
  unit arrives while every card stays motionless and face down. Only after the compositor reports
  the complete unit wave settled may the card beat begin.
- The card beat moves every completed card as a real scene-owned flight from its measured Controls
  seat into the measured Chartulary mark. The source cards remain present until those flights are
  constructed, Battle waits for every flight to finish, and a missing measurable target is the
  only immediate-completion fallback.
- Play and Next retain face reveal, unit arrival, and card discard as separate serial beats. A
  transport change during an existing atomic beat affects what happens after that beat; it does
  not overlap a second action with it.
- Existing Deployment state already persists the pre-Deal transport, settlement boundary, and
  discard boundary. This changes neither the RunSaveVersion nor the database schema.

## Consequences

- A player may express the intended pace immediately instead of performing a ceremonial Deal first.
- Full deploy never asks the eye to track a card flip and a battlefield arrival simultaneously.
- Cards visibly go somewhere after their units resolve instead of vanishing from Controls.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0422](0422-deployment-deals-a-visible-deck-before-transport-begins.md)
- [ADR-0434](0434-full-deploy-is-one-placement-wave-and-one-discard.md)
