---
status: accepted
date: 2026-07-30
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md) lipsanon display identities"
  - "[ADR-0198](0198-run-lipsanon-icons-are-installed-live-art-and-persistently-visible.md) installed-art authority for renamed identities"
partially_superseded_by:
  - "[ADR-0332](0332-eight-run-lipsanon-icons-ship-the-approved-resized-pixels.md)"
---

# ADR-0264: Run lipsanon identities carry anti-story residue

## Context and Problem Statement

ADR-0193 approved twenty Run lipsanon mechanics and provisional names before the
project connected card and lipsanon writing to the anti-story. Several names
already imply a larger material world, including the two Ramparts, royal and
liturgical objects, ledgers, scales, rolls, and surveying tools. Eight others
sound modern, generic, overtly supernatural, or like implementation labels.

Lipsanon mechanics, persisted Run documents, account history, URLs, and installed
media all use stable lipsanon ids. The user-facing identity may change without
breaking those authorities, but superseded artwork must not silently illustrate
the renamed object.

## Decision Outcome

Chosen: **keep every lipsanon id and mechanic stable while lipsanon names and flavor
fragments carry the anti-story's material residue.**

The eight user-facing renames are:

| Stable id | Superseded name | Accepted name |
| --- | --- | --- |
| `congressional-approval` | Congressional Approval | Sealed Valuation |
| `inspirational-record` | Inspirational Record | Dawn Register |
| `training-linens` | Training Linens | Field Linens |
| `mercenarys-rifle` | Mercenary's Rifle | Returned Rifle |
| `merchants-shopkey` | Merchant's Shopkey | After-Hours Key |
| `occult-dagger` | Occult Dagger | Unclaimed Dagger |
| `deployment-vehicle` | Deployment Vehicle | The Waiting Cart |
| `mercenary-boat` | Mercenary Boat | The Paid Crossing |

The other twelve names remain accepted. Names may imply institutions,
architecture, religious matter, administration, care, trade, or travel, but
they do not explain a plot. Mechanical descriptions remain literal and
separate from the flavor fragment.

Every lipsanon definition owns one original flavor fragment drawn from the four
accepted historical pressure sources:

| Lipsanon | Flavor fragment |
| --- | --- |
| Conscription Notice | One name was underlined. No reason was entered. |
| Sealed Valuation | The vessels were weighed after the prayers had stopped. |
| Dawn Register | Before each departure, a different name was read. |
| Field Linens | The sheets dried before the road did. |
| Royal Decree | The order arrived after the keys had changed hands. |
| Crenellated Rampart | The stones remembered a roof. The sheep did not. |
| Ghibelline Rampart | One wall faced the road. The other faced what was gone. |
| Pope's Staff | The staff remained wrapped after the chapel doors were opened. |
| Pope's Robes | Pale cloth and dark cloth were packed in separate chests. |
| Royal Tent | Three stones were set where the canvas would not hold. |
| Royal Sceptre | It pointed outward after the gate was closed. |
| Returned Rifle | Only the returned rifles were entered in the final column. |
| After-Hours Key | The small door opened after the courtyard emptied. |
| Unclaimed Dagger | It was counted with the valuables. No hand claimed it. |
| The Waiting Cart | When one cart left, another waited at the siding. |
| The Paid Crossing | The fare was counted once. The passenger was not. |
| Quartermaster's Ledger | The ledger had a column for onward. |
| Fair Scales | That summer, seed was weighed more carefully than silver. |
| Muster Roll | Those left in the margin did not board the train. |
| Surveyor's Compass | The road west grew busy after the second frost. |

The eight renamed visual identities are **replacement-art pending**. Runtime
surfaces show **Art not generated** for them even if the live catalog still
contains pixels accepted for the superseded name. The other twelve continue to
resolve their installed artwork normally. Accepting a new icon for a renamed
identity removes its pending state through an explicit code change after the
normal live-media review and installation workflow.

### Consequences

- Good: lipsana read as one anti-story family rather than a mixture of modern,
  generic-fantasy, and material-historical naming.
- Good: old Runs, account statistics, deep links, server allowlists, and media
  slots remain valid because stable ids do not change.
- Good: superseded art cannot misrepresent a renamed lipsanon.
- Cost: eight lipsana intentionally show a text placeholder until replacement
  PixelLab icons are generated, reviewed, and installed.

## More Information

- Living thematic contract:
  [`docs/lore-anti-story.md`](../lore-anti-story.md)
- Historical pressure sources:
  [`docs/lore/historical-anchors/`](../lore/historical-anchors/)
- Runtime art authority:
  [ADR-0198](0198-run-lipsanon-icons-are-installed-live-art-and-persistently-visible.md)
