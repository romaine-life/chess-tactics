---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0455](0455-aftermath-retains-a-reversible-terminal-board-review.md)"
---

# ADR-0457: Aftermath Back uses a mandatory scene handoff

## Context

ADR-0455 made the exact terminal board reviewable from aftermath, but the report rendered Back
only when it could immediately reread that board from best-effort browser match persistence. A
player could therefore win, choose Rewards, and receive a report with only Continue even though
the exact won board had existed in the immediately preceding scene. Disk availability had become
a hidden navigation condition.

The Battle and aftermath use different scene-owned stores. The outgoing store cannot be treated
as the incoming component's lifetime, but the current application session can carry an exact,
identity-checked value across that boundary without changing the durable Run document.

## Decision

- A terminal player-win Run Battle captures its exact resumable match into a current-session
  handoff before any browser-persistence enablement or storage write can decline or fail.
- Aftermath resolves Back from that handoff first. A reload may instead resolve the same exact
  match from browser storage. Both paths require the complete Run Battle activity identity and
  Level identity already required by ADR-0455.
- Entering another started match, Continue, abandonment, or final War victory retires the
  current-session handoff along with the browser copy.
- A missing or mismatched value is never replaced with a reconstructed, fresh, or same-Level
  board. Directly crafted aftermath that never had a preceding terminal board therefore does not
  invent a Back destination.

## Consequences

- The report reached by selecting Rewards from a won board always presents Back in the same app
  session, including when browser storage is blocked, disabled, or fails to write.
- Reload review retains the existing best-effort browser-storage behavior.
- RunSaveVersion, account persistence, Battle rules, and report accounting remain unchanged.
