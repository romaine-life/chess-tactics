---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
partially_supersedes:
  - "[ADR-0420](0420-the-fivefold-gambit-codex-is-the-default-run-card-back.md)'s single universal back and its Fivefold Gambit default"
---

# ADR-0524: The player chooses which back their Run deals

## Context

[ADR-0420](0420-the-fivefold-gambit-codex-is-the-default-run-card-back.md) accepted The Fivefold
Gambit as the one universal Run card back, explicitly "without precluding a later
player-selectable card-back system". The back is on every face-down card in the mode — Deployment's
stack, and the pile under every Sectio offer — so it is the most-seen single picture in a Run, and
it was fixed.

Three card-back studies had already run and left twelve candidates on the review slot, none of them
adopted. Seven are complete, opaque, native 1060x1484 at exactly 5:7. The owner reviewed those seven
side by side and chose The King's Position, keeping six of the seven as offered alternates.

## Decision

- **The back is a player setting.** `runCardBack` sits beside Your color and Grid style in
  Settings → Gameplay and is chosen by sight from one large sample rather than by name, following
  Grid style: six dense illustrations sharing a settings row would each be too small to judge. It
  is cosmetic — a back conceals every card identity equally and changes nothing about play.
- **The King's Position ships as the default.**
- **Six backs are offered**: The King's Position, The Fivefold Gambit, The Closed Position, The
  Arcane Relic, The Crowned Gambit, and The Register. The Sovereign Seal is excluded by the owner.
  All three PixelLab renderings are excluded on measurement — 28%, 52% and 73% of their card FACE
  is transparent, and a back that is not opaque shows what is behind the card through it.
- **The card back becomes a slot family.** `ui/run/card-back/<id>.png`, one slot per offered back,
  each promoted byte-identically from its reviewed candidate. `runtime.variant` must name its own
  slot — the rule the other slot families already use — so a version can never be accepted onto a
  back it does not claim to be.
- **`ui/run/card-back/standard.png` stays as the availability-critical fallback** and is not
  re-pointed. Every render path resolves through the setting, so it has no reader left to mislead.
- **An unresolvable choice falls back to that slot.** The offered set is a code constant and the
  installed set is live media; they may disagree in both directions — a build can reach a catalog
  that predates one of its backs, and a back can be retired while a player still has it stored.
  `liveMediaForSlot` throws on an absent slot, and a throw there is a Run that cannot draw a
  face-down card at all.
- **Every face-down card resolves through one hook**, so Deployment's stack and Sectio's piles
  cannot disagree about what a back looks like.

## Consequences

- Six card-back slots exist where one did. Retiring a design means retiring its slot and dropping it
  from the offered union; no other back's pixels move.
- The acceptance gate's proof surface remains the Card Layout Card Back review, extended to resolve
  any family member from the requested bytes. The address shape is unchanged, because it already
  names exact bytes and those bytes belong to exactly one row.
- A stored back that is later retired silently becomes the default rather than erroring.
- The offered set is player-facing production art. Promoting a further review candidate into it is
  a content decision for the owner, not a mechanical one.
- **The six accepted versions record `provenance.decision: "ADR-0521"`, not ADR-0524.** 0521 was
  free when they were promoted; [ADR-0521](0521-an-unread-artwork-version-list-is-not-a-verdict.md)
  landed on main from another branch in the same hour, so this decision took the next free number
  afterwards. Accepted-version provenance is immutable once bytes exist — the point of it — so the
  stored string stands rather than being laundered by re-promoting six rasters to edit a citation.
  Nothing reads that field programmatically; it is a pointer for a human, and this is the note that
  redirects it.
