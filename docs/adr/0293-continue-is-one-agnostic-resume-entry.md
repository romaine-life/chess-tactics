---
status: superseded by ADR-0294
date: 2026-08-01
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0292](0292-play-hub-continue-uses-the-complete-choice-frame.md)"
partially_supersedes:
  - "[ADR-0260](0260-play-always-presents-the-picker-continue-is-an-offer.md)'s duplicate hub Continue card"
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)'s Continue Run row label and unselected Continue destination"
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0232](0232-continue-run-selects-run-before-play.md)"
superseded_by:
  - "[ADR-0294](0294-play-defaults-to-a-multi-mode-continue-surface.md)"
---

# ADR-0293: Continue is one agnostic resume entry

## Context

The Play root resolves the most recently updated unfinished activity from an
active Run or a persisted Campaign/Skirmish Battle. ADR-0260 nevertheless
rendered that one result twice: as the leading Continue rail entry and as a
large Continue card in the neutral hub. The hub therefore looked like a
Continue destination even while its heading claimed that no mode was selected.

For an active Run, activating either duplicate opened Run preparation, where
ADR-0290 presented another row named Continue Run before revealing the Current
Run facts and final Play action. One underlying activity consequently appeared
as a fake Continue screen followed by a second Continue choice. ADR-0292
improved the duplicate hub card's hit target but preserved the duplication.

## Decision

- Play owns one activity-agnostic **Continue** entry. The resolver still chooses
  the most recently updated unfinished active Run or persisted Battle, but the
  entry's title is always Continue. Its detail identifies the resolved kind and
  state: Run, Campaign, or Skirmish plus the relevant progress/name.
- Continue appears only as the first Play rail entry. The neutral `/play/select`
  hub contains only its Choose a mode guidance and never renders a second
  Continue card, row, action, or default-looking destination.
- Continue Campaign and Continue Skirmish retain their direct live-Battle
  destinations.
- Continue for an active Run opens `/play/select/run/current`. That address
  selects **Current Run**, reveals its standard right detail column, and leaves
  the final **Play** action as the only control that enters `/run`.
- The ordinary **Run** rail entry remains `/play/select/run` and selects neither
  Run choice. Run preparation names its records **Current Run** and **Start New
  Run**; their detail addresses are `/play/select/run/current` and
  `/play/select/run/new` so reload and Back preserve the chosen record.
- The master-detail geometry, Ataraxia selector, replacement confirmation, and
  no-automatic-launch rules of ADR-0290 remain in force.

## Consequences

- Play presents one honest neutral hub and one global resume shortcut instead
  of two surfaces claiming to be Continue.
- Continue is consistent across activity types while its detail still tells the
  player exactly what will resume.
- A Run remains inspectable before launch without asking the player to choose
  Continue Run twice.
- Ordinary Run browsing and global resume intent have distinct, durable
  addresses without creating a second Run preparation implementation.
