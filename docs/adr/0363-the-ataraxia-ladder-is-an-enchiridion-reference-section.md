---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Claude
refines:
  - ADR-0231
  - ADR-0266
  - ADR-0268
  - ADR-0291
  - ADR-0355
---

# ADR-0363: The Ataraxia ladder is an Enchiridion reference section

## Context and Problem Statement

Ataraxia is the only Run-wide rule system with no reference record. Units, Terrain,
Cards, Card Types, Relics and Abilities each have an Enchiridion section; the difficulty
ladder existed solely inside the Run-preparation selector, which shows one tier at a
time and only to a player already committed to starting a Run.

That leaves three things unreadable outside preparation:

- What a tier does. ADR-0291 gave every tier the same anatomy — numbered label,
  subtitle, literal impact — but the selector shows the impact only for the tier
  currently chosen.
- That the ladder is linear and cumulative (ADR-0268). The selector's disabled options
  imply gating without stating the rule.
- What the account has actually reached. The selector disables a locked option; nothing
  says how far the ladder goes or which rung is next.

The Strategikon presents the same reference sections mid-Battle, where a player deciding
how to handle a Pestiferous card cannot open the Run-preparation screen at all.

## Decision Drivers

- A rule that governs the whole Run belongs in the Run-wide reference, beside the card
  properties it switches on.
- The reference must not become a second authoring site for tier copy. ADR-0291's
  anatomy is authored once, in the Run model.
- ADR-0266 keeps historical exposition optional; a mechanical reference must be complete
  without it.
- ADR-0355 made a section of a rail a registry entry, so adding one must be a
  declaration rather than a new branch.

## Decision Outcome

Chosen: **Ataraxia is the seventh Enchiridion section**, addressed
`/enchiridion/ataraxia` on the main menu and `/{play,run}/strategikon/enchiridion/ataraxia`
in the Strategikon, registered in `sectionedShells.ts` like every other section.

- The section enumerates `ATARAXIA_TIERS` and prints each tier's authored anatomy from
  `ATARAXIA_BY_TIER`. It states no tier copy of its own, so a tier installed in the model
  cannot be described here in words the Run does not apply. Tier zero is a member of the
  list with no rendering branch (ADR-0291).
- **The numeral IS the row's mark.** Every other reference section opens a row with a
  glyph; here that seat holds the rung, and the heading is the descriptive name alone —
  `0` beside `The Untroubled Mind`. The ladder's own name is the section heading, so
  repeating "Ataraxia" once per row says nothing the row is not already under.
  `ATARAXIA_BY_TIER` therefore carries `numeral` beside `label`: the numeral is the rung,
  the label is the rung qualified by the ladder's name, for the Run-preparation selector
  and the unlock sentence, which name a tier away from that heading.
- **The baseline keeps `0`.** Roman numbering has no zero, and the antiquarian stand-ins
  for one (`N` for *nulla*) have to be explained to be read, which a reference row cannot
  afford. A plain `0` at the head of a Roman sequence is the smaller cost, and it is the
  label ADR-0291 already authored.
- **No row carries a glyph at all.** The sections whose rows list unlike things — terrain
  features, unit states — identify each row by its own icon. A numbered rung of one ladder
  has nothing for a repeated section glyph to distinguish, and lock state is stated in
  words by the standing line, so neither the section mark nor a lock icon enters a row.
  The numeral column is `minmax(56px, auto)`: a later `VIII` widens the seat for the whole
  ladder rather than stepping one row out of line.

### The rung mark is forged art, and the whole ladder is forged at once

The typed rung is the game's own display face — correct, but it is type where every
neighbouring section has a crafted mark. The owner selected a **carved-stone** numeral set
(2026-08-02) over a gold-leaf alternative: quieter, closer to the existing chrome.

- `scripts/forge-ataraxia-numerals.mjs` forges the set through the kit's method and gates
  (ADR-0011/0013/0014/0026) — codex txt2img onto a flat chroma plate, verified against the
  session ROLLOUT, despilled to alpha, low-fi downscaled to a 64×64 canvas.
- **It forges `0` through `X` in one pass, not one rung per installed tier.** Ataraxia grows
  by editing `ATARAXIA_BY_TIER` (ADR-0268); an art pass standing between a designed tier and
  a shippable one would turn that edit into a two-day job. Every glyph after the first takes
  its own style's `I` as a `-i` style reference, so the set holds one material, palette,
  bevel and stroke weight instead of eleven independent inventions.
- PixelLab is not an alternative here and was measured, not assumed: its image models
  returned 16/16 non-letterforms for a single-numeral brief, and `create_font` emits 1-bit
  monochrome, so a material description collapses to a flat shape. Codex draws typography;
  the pixel-art generators do not.
- **The set is read by PREFIX, and the typed numeral stays the fallback render path.**
  `liveMediaForSlot` throws on an absent slot, which would take the entire section down on
  any deployment where the candidates have not been accepted. An installed art set is the
  enrichment; the ladder must render its rungs either way. Acceptance turns the art on with
  no second code change.
- Candidate upload is the generator's durable output; review, acceptance and activation
  remain owner operations. The rung marks are the first `ui-kit` slots to leave that
  domain's bridge-only default, which required registering the domain properly rather than
  waving it through:
  - `ataraxiaNumeralMediaIssue` is the typed completeness validator — one native 64x64 PNG
    whose runtime metadata names the rung its own slot names.
  - `ataraxiaNumeralOwnerProofIssue` names the review surface. A rung mark is reviewed
    where it is worn, so the Ataraxia rows of either host are its sanctioned surface. It
    composes the generic `live-media-owner-proof-v1` the accept path requires, and adds the
    reviewed-set record: a rung is judged with its ladder, because a half-carved ladder is
    the defect worth recording against.
  - The alternative was to record `/studio` as the surface and accept there. That would
    have written a place the reviewer never opened into a durable audit record, which is a
    worse outcome than registering the domain.
- `ATARAXIA_TIERS` becomes a model export derived from `INSTALLED_ATARAXIA_MAX_TIER`. The
  preparation selector's hand-written `[0, 1]` is replaced by it, so the two surfaces
  cannot disagree about which tiers exist.
- The one thing the reference adds beyond the selector is **standing**: each tier reads
  Completed, Unlocked, or Locked with the completion that opens it named. It reads the
  same `RunProgression` the selector reads and subscribes to `RUN_PROGRESSION_EVENT`, so
  account sync and a finished Run update it in place.
- A locked tier is stated in full, not hidden or blurred. The ladder is a reference; the
  gate is on selecting a tier, not on reading what it is.
- The section carries no historical exposition. ADR-0266's opt-in, factual, sourced
  explainer remains unbuilt, and this section is where it would land if it is ever built.

## Consequences

- Good: the ladder is legible without committing to a Run, and mid-Battle through the
  Strategikon, which is where a Pestiferous card actually raises the question.
- Good: installing Ataraxia II adds a rung to the model and appears in both the selector
  and this reference with no further edit.
- Good: the registry walk in `sectionedShells.test.ts` covered the new section the moment
  it was declared — the coverage check fails an entry with no address.
- Good: renumbering or renaming a rung is one edit in the model. The selector's unlock
  note now derives the tier below from `ATARAXIA_BY_TIER` instead of hard-coding the
  baseline's label, so it cannot go stale.
- Cost: the reference reads account progression, so it is the first Enchiridion section
  besides Relics whose content varies per account.
- Cost: the baseline's `0` is an Arabic digit at the head of a Roman sequence. Every
  antiquarian alternative needs explaining, which a row of a reference cannot carry.
- Good: the ladder can reach Ataraxia X without another art pass, so installing a tier
  stays a model edit.
- Cost: the section's rail mark reuses the installed objective glyph, whose ink is
  thinner than its neighbours. Swapping it is a media-role change with no code
  consequence.
- Cost: two render paths for one mark. The typed fallback is exercised on every
  deployment whose numeral candidates are unaccepted, so it cannot be treated as dead.
- Cost: a twelfth rung means forging `XI` before it looks like the others; the forge takes
  `--only XI` and anchors to the installed `I`.

## More Information

- [ADR-0266](0266-ataraxia-names-optional-run-difficulty-after-real-history.md),
  [ADR-0268](0268-ataraxia-unlocks-linearly-and-stacks-cumulatively.md), and
  [ADR-0291](0291-ataraxia-zero-is-a-named-tier-with-visible-impact.md) author the ladder.
- [ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)
  makes one section body serve both hosts.
- [ADR-0355](0355-a-rail-of-sections-is-a-registry-entry.md) is why adding a section is a
  registry entry in two families rather than a branch in four places.
