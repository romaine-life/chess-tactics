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
### The fit alone did not make the strip match the screen

Installed and measured on the live Battle, every tab mark drew **16.3px of ink in its 20px seat**
while the Strategikon marks two inches above it drew **22px**. The owner said so before the numbers
did: *"the icon size is not matching the other icons on the screen."*

The fit was necessary and not sufficient. `background-size: contain` draws the whole 64px canvas, so
a mark fitted to 52px of ink lands at 81% of its seat by construction — every mark equally, which is
why the strip was internally consistent and still wrong beside its neighbours. The title bar solved
this long ago: its seats grow their box by `1 / ink-fill` and bleed the surplus back with a negative
margin, so the drawn ink lands on the shared seat while the layout footprint does not move.

**The tab seat now uses that same mechanism, not a second one** ([ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)),
and declares ONE fraction for all five marks — which is the fit's payoff: no tab carries a number of
its own. Measured after: every mark 20.0px against the title marks' 22.0px, on seats of 20px and
27px.

**The compensated box must land on WHOLE pixels.** 20 / 0.8125 is 24.6154, and the first pass used
it raw — a fractional box centred by a fractional margin. The compartment tracks are themselves
fractional (measured 58.438, 62.563, 66.109 across window widths), so the mark landed on a different
device-pixel grid at every width, and with `image-rendering: pixelated` its RENDERED SIZE was
measured jumping between 24px and 25px across eight widths. That reads as the glyph shifting inside
its button, intermittently, with nothing having changed — and it is what the owner reported. The
canvas is now `round(…, 2px)`, which keeps both the box and the half taken off each side whole, so
the mark occupies the same pixels wherever its compartment lands. The declared fraction stays the
ART's own; only the box is snapped.

A residual difference survives and is **pre-existing, not introduced here**: because the tracks are
fractional, a `pixelated` 64→24 downscale still resamples very slightly differently at some widths.
Measured across eight widths, the old uncompensated 20px box produced six distinct renderings and
the snapped box produces seven at ONE constant size — the whole-pixel jump is gone, the sub-pixel
resample is not. Removing it means making the head's tracks land on whole pixels, which is shared
chrome (ADR-0569) and a wider change than this decision.

**`verify:icon-seats` had to learn that a seat can pin its HEIGHT.** Its `fill` is the LONG axis over
the canvas, and those are different numbers for a mark wider than it is tall: the pawn pair is 60×52
on a 64px canvas — 94% across, 81% down. Registering the strip against the long axis demanded `.9375`,
which would have drawn the other four a fifth too large. Entries now carry `axis: 'height'`, and the
five tab seats are registered under it, so a mark re-uploaded at another ink height fails loudly
instead of quietly reading a different size than the four beside it.

- **The owner's picks are installed and live**: Bone knight 11, Bone and ebony pawns 11, Brass
  roundel 04, and Slate viewing plate 01 for View. The spyglass was not taken.
- **`verify:icon-seats` failed the moment they were installed, which is the gate working**, and its
  message named the fix: `[data-strategikon-section="prosopography"]` and `…="lipsanotheca"` still
  declared the old `.625` / `.1875` by hand. Fitted bytes measure `.8125` / `.09375` — the same pair
  `enchiridion.png` already declared one rule above them — so **three copies of one fact became one
  rule listing all three selectors.** That is the honest shape: three identical numbers are what go
  stale unevenly, which is the whole thing this gate exists to catch.

  The gate had to learn to read a SELECTOR LIST for that. Its per-rule regex required the selector
  to be followed immediately by `{`, so grouping the three made it report all three as undeclared —
  a gate that silently requires duplication to satisfy it. It now looks forward past the remaining
  members of the list, which finds a selector wherever in that list it sits.
- **Install reloads the page.** The Installed strip reads the drawable catalog the app booted with,
  and the install's `refresh()` only re-fetches the live-media one — so a successful install left
  this page still drawing the marks it had just replaced, and the one thing on screen that answers
  "did it change?" was answering no. The first install shipped with a sentence asking for a reload
  instead, which is not a fix: the owner pressed Install, saw nothing move, and reported it as not
  having worked. It had.
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
