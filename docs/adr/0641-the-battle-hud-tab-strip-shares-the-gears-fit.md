---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0560](0560-main-menu-marks-share-one-ink-box-and-one-centre.md)"
  - "[ADR-0035](0035-semantic-ui-icons-carry-a-private-anti-story-anchor.md)"
  - "[ADR-0637](0637-the-event-log-replaces-its-classifying-words-with-marks.md)"
---

# ADR-0641: The Battle HUD's tab strip shares the gear's fit, and no mark is blue by rule

## Context

The Battle HUD's Controls head is five compartments of one box — Unit, Roster, Log, View, Controls —
each drawing one 20px mark. The owner looked at that strip and said the four marks that are not the
gear should be regenerated.

Two separate faults, and only one of them is the art.

**The fit.** The seat draws with `background-size: contain`, which scales the whole CANVAS, so
transparent margin baked into a 64×64 frame comes straight off the drawn glyph. The gear is
[ADR-0560](0560-main-menu-marks-share-one-ink-box-and-one-centre.md)'s carved cog, fitted to 52px of
ink on that canvas, and it fills its compartment. Its four neighbours were the old codex kit,
unfitted:

| mark | ink on a 64×64 canvas | drawn at a 20px seat |
| --- | --- | --- |
| `unit-studio.png` | 26×40 | ~12px tall |
| `info.png` | 39×40 | ~12px tall |
| `players.png` | untrimmed | small |
| `monitor.png` | untrimmed | small |
| `gear.png` (fitted) | 52×52 | ~16px, edge to edge |

So the strip read as one mark at full size beside four smaller ones, and no amount of redrawing
fixes that — it is geometry. ADR-0560's own list of fitted slots already **names this seat**: the
gear is a member "because the Battle HUD's Controls tab, the Settings General section and
`.icon-gear` all draw it". The four tabs standing in that same strip were simply never added.

**The colour.** `info.png` was a blue disc with a blue `i`; `monitor.png` was a dark blue CRT. They
came from `kit-forge.mjs`, where most of the table opened with the word *blue* — `a blue speaker`,
`a blue floppy disk`, `a blue lowercase letter i inside a circle`, `a blue display screen`. The
settings concept art those specs reference is a dark blue screen, and the first pass read the
SURFACE's colour as the icon set's.

**There has never been a rule that a kit mark is blue.** [ADR-0014](0014-ui-chrome-low-fidelity-aesthetic.md)
owns a palette BUDGET, not a hue. [ADR-0025](0025-world-scene-art-anti-story-lore.md) and
[ADR-0035](0035-semantic-ui-icons-carry-a-private-anti-story-anchor.md) own the subject and say
"material palette **per-image** … never a forced UI-blue". [ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)
makes cool blue stone the material of the structural FIELD — and a mark sitting on that field is the
definition of the thing that is not the field. ADR-0560 retired the last set still wearing it, and
[ADR-0637](0637-the-event-log-replaces-its-classifying-words-with-marks.md) recorded what the
invented rule costs: a handshake drawn in blue steel gauntlets, because armour was assumed more
correct than skin.

## Decision

**The Battle HUD's four other section tabs join the gear's fitted contract, and the generator's
specs name each object's own material instead of a house hue.**

- **One fit for the strip.** `ui/kit/icons/{unit-studio,players,info,monitor}.png` join
  `MAIN_MENU_MARK_FITTED_SLOTS`, so each is 52px of ink on the canonical 64×64 canvas with both ink
  dimensions even and the ink box centred on both axes — the same rule, the same packer
  (`pack-menu-icons.mjs`), the same verification, and the same `mainMenuMarkMediaIssue` typed
  completeness validator. That list was already documented as "every mark drawn into a FITTED RAIL
  SEAT … not confined to the main menu's own five"; this is that sentence applied where it already
  pointed.
- **Trimming was considered and rejected.** ADR-0637's Event Log marks ship trimmed to their own
  ink, which also solves the 20px seat. But `unit-studio` and `info` are ALSO drawn in the
  Strategikon's title rail, whose seat shares a bottom edge and compensates for canvas margin by
  hand in `style.css`. Trimmed bytes would delete those two declarations; fitted bytes make them
  agree with `enchiridion.png`, which is already fitted and already declares `.8125` / `.09375`.
  One rule for three marks in one rail beats two rules and a deletion.
- **Material is per-object, and that is the whole of the rule** (ADR-0560's standing clause). Bone
  and ebony on the pieces, brass on the information mark. A uniform material across the set would be
  the retired blue constraint in a different hue.
- **`kit-forge.mjs`'s specs name materials.** Every "a blue X" becomes what X is made of, with a
  comment stating why and citing the four ADRs that already said so, so the next agent reading that
  table does not re-derive the hue from the concept art. `reset` keeps its red: that is a signal,
  not a material. `brand-shield` keeps its blue rook on a navy field: that is the brand's actual
  heraldry, drawn from the header.
- **The gear is NOT re-decided.** It is the settled ADR-0560 cog, one set of bytes in two slots, and
  three unrelated surfaces draw it. The owner's ask excluded it and so does this.
- **The View seat is offered two subjects.** A "display screen / monitor" is a stock UI symbol, which
  ADR-0035 rule 1 forbids reaching for, and the tab it marks is about how the board is SEEN. So a
  brass spyglass is offered beside a redrawn slate-and-oak plate. One batch is one concept
  (ADR-0637), so either can leave the review page without taking the other with it.

### The pixels are the owner's call

Candidates are judged in **Studio → HUD Tab Marks**, a category reached by clicking its tab
([ADR-0058](0058-every-route-is-click-reachable.md)). The page mounts the **real Controls head**
through `ShellControlsPanel` — the same panel, the same divided block, the same 20px seats, with the
gear standing where a Battle puts it — because a mark this small is decided at 20px against its
neighbours and not from its 64px art. Each seat's candidates were generated independently, so the
strip is COMPOSED: arming is per tab, pressing an armed candidate again disarms it, and an unarmed
tab keeps what it paints. Nothing installs until Install.

The seat is shared with the HUD through `shared/SkirmishTabIcon`, so the review cannot drift into a
lookalike (ADR-0059) — the same reason `SkirmishShortcutIcon` exists for the command card.

### A mark here moves more than this strip

These are long-lived kit slots. Install is stated on the page per seat, because the blast radius is
not obvious from the tab being looked at:

| slot | also drawn as |
| --- | --- |
| `unit-studio.png` | the Strategikon's Prosopography mark; the Enchiridion's *units* bullet |
| `players.png` | the account menu's player glyph; `.icon-players` |
| `info.png` | the Strategikon's Lipsanotheca mark; the Enchiridion's *lipsana* bullet; the editor level row's info control |
| `monitor.png` | nothing else |

That is the intended behaviour — a mark changes everywhere it is drawn, or it has not changed — and
it is why the page says so rather than leaving it to be discovered.

## Consequences

- The strip reads at one size. The four marks arrive at ~16px of ink like the gear instead of ~12px,
  which is the difference between a mark and a smudge at this scale.
- **`verify:icon-seats` will fail the moment `unit-studio` or `info` is installed, and that is the
  gate working.** `[data-strategikon-section="prosopography"]` and `…="lipsanotheca"` declare the
  OLD ink numbers (`.625` / `.1875`) by hand; fitted bytes measure `.8125` / `.09375`, the same pair
  `enchiridion.png` already declares one rule above them. The gate reads the installed bytes and
  prints both numbers, so the edit is named rather than hunted. It is deliberately not made ahead of
  the install: the declaration must describe the bytes that are actually live, and until Install is
  pressed those are the old ones.
- Candidates were generated at the canvas they ship on. ADR-0560's packer header warns that a 128px
  render packed to 52 mushes exactly the art with no hard geometry to survive it; these were
  generated at 64×64, a ~0.9× fit.
- The fit RESAMPLES (ink crop, LANCZOS to a 52px height, 48-colour quantize, re-centre), so every
  candidate declares ADR-0560's `main-menu-mark-fitted-production-exception-v1` rather than claiming
  a native 1× it does not have ([ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md)).
- Additive: four live-media slots gain candidates, and each is recoverable by leaving them
  unaccepted. No migration, no save version, no schema change.
- ADR-0560's fitted-slot list is now doing the job its comment describes, which makes it the place
  to look when a mark reads small in a fixed seat. The failure it prevents is silent.

## More Information

- **Candidates:** PixelLab `create_image_pro` at 64×64, style image
  `ui/main-menu/icons-carved/settings.png` — the carved cog itself — with `style_copy` set to
  `outline, detail, shading` and **deliberately not `color_palette`**, so the set inherits the
  treatment without inheriting one material. 16 candidates per concept, then fitted by
  `frontend/scripts/pack-menu-icons.mjs`.
  Batches: `hud-tab-unit-bone-knight-2026-08-12-v1`, `hud-tab-roster-bone-ebony-pawns-2026-08-12-v1`,
  `hud-tab-log-brass-roundel-2026-08-12-v1`, `hud-tab-view-spyglass-2026-08-12-v1`,
  `hud-tab-view-slate-plate-2026-08-12-v1`.
- **Review surface:** `frontend/src/ui/SkirmishTabMarkCatalog.tsx`, `/studio?cat=hudtabmarks`.
- **Seat:** `frontend/src/ui/shared/SkirmishTabIcon.tsx`, `.skirmish-tab-icon` in `style.css`.
- **Policy:** `MAIN_MENU_MARK_FITTED_SLOTS` in `backend/liveMediaPolicy.js`.
- **Generator specs:** `frontend/scripts/kit-forge.mjs`.
- **Related:** ADR-0560 (the fit and the per-object material rule this extends), ADR-0026 (canvas),
  ADR-0014 (palette budget, not a hue), ADR-0025 / ADR-0035 (subject and material, no forced
  UI-blue), ADR-0433 (leaf vs structural material), ADR-0637 (one batch is one concept; what the
  invented blue rule cost), ADR-0059 (one seat, shared), ADR-0058 (a review surface is a clickable
  category).
