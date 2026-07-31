---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0265](0265-ataraxia-unlocks-linearly-and-stacks-cumulatively.md)"
---

# ADR-0263: Ataraxia names optional Run difficulty after real history

## Context and Problem Statement

Run needs difficulty beyond its baseline, but a generic rank such as Hard or
Ascension would miss the game's antiquarian, over-intellectual register. The
anti-story already draws scene and relic pressure from real history without
turning those references into an explained fictional plot.

## Decision Drivers

- Difficulty naming should belong beside Strategikon, Enchiridion, and the
  historical residue carried by scenes and relics.
- Added difficulty should feel like another condition to observe, not a heroic
  ladder that promises mastery over suffering.
- Real history may deepen the anti-story without identifying a protagonist,
  explaining the game world, or supplying a thesis.
- Interested players may learn more, while historical exposition must never be
  mandatory to understand a literal mechanical effect.

## Considered Options

- A conventional numbered difficulty or Ascension-like label.
- One abstract hardship noun with increasingly ornate descriptors.
- **Ataraxia** as the container, with each condition named after a real
  historical event or historically attested appellation.

## Decision Outcome

Chosen: **optional Run difficulty is Ataraxia, and its individual conditions use
real historical event identities.**

- The baseline is **No Ataraxia**. A player's first Run uses that baseline;
  later Runs may opt into available Ataraxia.
- The first condition is **Ataraxia I — The Great Mortality**. It allows
  Pestiferous cards to enter the Run card pool under
  [ADR-0264](0264-pestiferous-cards-lose-units-and-persist-when-empty.md).
- Future Ataraxias use documented historical names or appellations whose
  conditions resonate with their literal mechanic. They are not invented
  fantasy catastrophes disguised with real-looking dates.
- A primary difficulty presentation gives the Ataraxia identity and a direct
  mechanical statement. A date may accompany the event as compact historical
  metadata.
- A later interface may offer an **opt-in, factual, sourced historical
  explanation** of the event. Reading it is never required, and the game does
  not explain why this chess Run presents that history or what interpretation
  the player should draw from it.
- The reference does not assert that the Run literally occurs during that
  event. It is public historical paratext beside an otherwise unresolved
  anti-story.
- Unlock cadence beyond the first No-Ataraxia Run, whether conditions are
  cumulative or independently selectable, and the distribution curve inside a
  condition remain deferred.

### Consequences

- Good: the historical name supplies both gravity and the deliberately
  overlearned register without bloating recurring gameplay keywords.
- Good: a curious player receives a path toward real knowledge about human
  suffering and persistence while the game withholds narrative explanation.
- Cost: every future Ataraxia identity and optional explainer requires factual
  sourcing and sensitive review; a convenient invented label is not enough.
- Cost: direct historical naming is intentional public paratext, unlike the
  scene-art pressure source that ADR-0025 says should not be visually
  identifiable from an image alone.

## More Information

- [Lore and anti-story](../lore-anti-story.md)
- [ADR-0025](0025-world-scene-art-anti-story-lore.md)
- Cambridge University Press records **Great Mortality**, **Great Pestilence**,
  and **Universal Plague** among contemporary names for the fourteenth-century
  pandemic: <https://www.cambridge.org/core/books/abs/cambridge-world-history-of-human-disease/black-death/16390DE51801A6BFCD9FFC2B18CA00A1>
