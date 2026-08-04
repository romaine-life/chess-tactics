---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0216](0216-run-lipsana-live-in-a-playfield-overlay-beneath-the-title-bar.md)"
  - "[ADR-0264](0264-run-lipsanon-identities-carry-anti-story-residue.md)"
  - "[ADR-0332](0332-eight-run-lipsanon-icons-ship-the-approved-resized-pixels.md)"
---

# ADR-0198: Run lipsanon icons are installed live art and persistently visible

## Context

ADR-0193 introduced twenty persistent Run lipsana, but the first implementation
stored only their gameplay definitions and names. The owner had already reviewed
and approved a sixteen-icon 64×64 PixelLab family for the original lipsanon set.
Those exact pixels were never installed in live storage, no drawable records
bound them to lipsanon identities, shop offers rendered only text, and acquired
lipsana had no persistent visual home.

Lipsanon art is runtime media. It cannot be committed to Git, loaded from temporary
generation URLs, inferred from filenames, or replaced by a generic fallback.
The four later-approved gameplay lipsana (Quartermaster's Ledger, Fair Scales,
Muster Roll, and Surveyor's Compass) do not yet have owner-approved icon pixels.

## Decision

- A Run lipsanon icon is a native 64×64 PNG in the `ui-kit` media domain with the
  `icon` role and typed `run-lipsanon-icon` runtime metadata. Its stable slot follows
  `ui/run/lipsana/<lipsanon-id>.png`, and its runtime variant must equal that lipsanon id.
- The database-owned drawable catalog owns installation. One active
  `kind='run-lipsanon'` drawable record maps `behavior.lipsanonId` to its named `icon`
  media role. Runtime code queries those records; a semantic-slot filename alone
  never declares an icon installed.
- The sixteen previously approved icons are reviewed and accepted as one exact
  live-media group before their drawable records are installed. Their generated
  source bytes remain outside Git.
- Every lipsanon offer renders its installed icon. Once acquired, the lipsanon appears
  immediately in a compact, labelled held-lipsanon tray. The tray remains visible
  on every between-Battle Run screen and in the Battle HUD.
- An approved gameplay lipsanon without installed art renders an explicit
  unavailable-art state with its normal text label. The UI does not fabricate,
  duplicate, or silently substitute another lipsanon's icon.

## Consequences

- Acquiring a lipsanon now has immediate and persistent visual feedback without
  changing any chess-piece behavior.
- Runtime rendering stays pinned to the immutable media hash in the hydrated
  drawable catalog.
- The four newer lipsana remain mechanically usable and honestly identified by
  text until their own art is generated, reviewed in a game-owned surface, and
  installed through the same contract.
