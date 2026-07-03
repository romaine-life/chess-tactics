---
status: "accepted"
date: 2026-07-02
deciders: Nelson, Claude
---

# ADR-0054: Vertical rhythm — spacing encodes grouping (tight < stack < gutter)

## Context and Problem Statement

The level editor's control rail read as "really thrown together" (owner, reviewing the
Status layer). The audit found no rhythm system — three regimes stacked:

- `--ds-stack` (8px compact) was used both BETWEEN sections (the rail flex gap, the
  scroll-content gap) and WITHIN them — so the eye gets no grouping signal at all.
- Headings hand-picked `margin: 0 0 10px` (`.skirmish-card h2`, off the ADR-0031
  scale), and the Actions dock hand-picked another 6px under its heading. Net effect: a
  section heading sat 8px below the PREVIOUS section's box and 10px above its OWN
  content — proximity attached it to the wrong group (inverted Gestalt).
- `.le-status-card` declared `gap` on a **block** container — dead CSS, silently never
  applied. Its children actually sat flush (0px), spaced only by an accidental
  hand-picked margin on one note element.

ADR-0031 supplies the tokens and their roles (`stack` = vertical gap, `gutter` =
section gaps) but nothing binds *grouping* to them, which is how a rail can be fully
"tokenized" and still have no hierarchy.

## Decision Outcome

**Vertical spacing is a monotone grouping ladder on the ADR-0031 role tokens. Larger
gap = weaker relation, always:**

| Relation | Token | Compact |
|---|---|---|
| Tight pair (label→value inside one box, readout lines) | `--ds-inline-tight` | 4px |
| Rows within a section (incl. heading → its own content) | `--ds-stack` | 8px |
| Between sections (cards, heading-topped groups) | `--ds-gutter` | 12px |

- **Headings bind downward.** The gap above a heading is the between-section gutter;
  the gap below it (to its own content) is the within-section stack — strictly smaller.
  A heading must never sit closer to the previous group than to its own.
- **Hand-picked px on the rhythm axis are banned** (re-affirms ADR-0031): no per-element
  6px/10px margins; pick the RELATION, the token supplies the number.
- **A declared `gap` must be live.** `gap` on a block container is dead CSS and reads as
  intent while doing nothing — containers spacing children this way are `flex`/`grid`.
  (The status card shipped with a dead gap for its whole life.)
- Density stays per-screen via the ADR-0031 compact/comfortable overrides.

Applied now to the skirmish/level-editor rail family (shared `.skirmish-hud` /
`.skirmish-card` chrome — one family, so no LE-only fork): rail + scroll-content gaps
become gutter; `h2` margin becomes stack; the dock's 6px and the note's 10px hand-picks
die; the status card becomes a real flex column so its gap applies. Other screens
migrate as touched (ADR-0024 precedent).

## Considered Options

- **A level-editor-specific rhythm ADR.** Rejected: the rail classes are shared with
  the Skirmish HUD (ADR-0033 precedent); an LE-only rule forks one chrome family.
- **Equal spacing everywhere** (one token for all gaps). Rejected: uniform spacing is
  exactly the audited failure — grouping needs contrast, not consistency alone.
- **Bigger heading margins instead of section gutters** (heading pushes DOWN from the
  previous section). Rejected: the extra space must sit ABOVE the heading; below it the
  heading must hug its content — margin-below can't express that.
