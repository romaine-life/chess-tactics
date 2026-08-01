---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
extends:
  - 0085-runtime-assets-are-live-storage-backed.md
  - 0265-run-cards-keep-core-identities-while-units-carry-modifiers.md
  - 0277-the-card-scene-authoring-instrument-is-removed.md
partially_supersedes:
  - 0262-bundle-cards-are-scene-vignettes-with-authored-names-and-a-codex.md
---

# ADR-0278: Unit-card art uses dedicated database prompt plans

## Context

The Run deck has 49 stable core composition cards. Their title, type line,
rules-area unit ledger, and flavor text now use trading-card anatomy, while the
accepted Parish Militia prototype demonstrates a human historical illustration
in the art pane. Reusing one generic prompt for the remaining cards would make
their scenes, poses, and methods of withholding identity collapse into a
repetitive family of people facing away from the viewer.

ADR-0263's board-scene composer was removed by ADR-0277 because card art is no
longer generated from editable tactical mini-boards. The replacement must not
recreate that Level Editor mode or its retired override document. The shared
live-media catalog already persists semantic illustration slots, prompt
provenance, candidate revisions, immutable bytes, and later acceptance.

## Decision

Every core **Units** card owns one dedicated art prompt plan.

- The plan is keyed by the canonical composition id and preserves the core
  title, exact piece composition, base value, one of the four accepted
  historical pressure anchors, a card-specific scene direction, and a
  card-specific eye-concealment treatment.
- Set-wide direction remains common: a landscape illustration composed for the
  card's roughly 1.43:1 art window, grounded historical material, human
  interpretations of unit roles, historical residue without explained plot,
  and no card chrome, text, literal chess pieces, active battle, magic, gore, or
  heroic poster treatment.
- Human faces may be present and may face front, three-quarter, or profile.
  **Eyes remain unreadable.** Each prompt names how its eye line is lost through
  hats, helmets, hoods, hair, weather, architecture, distance, or painterly
  omission. Turning the entire group away is not the default solution. Clear
  pupils, irises, sclera, catchlights, direct eye contact, empty sockets,
  blindfold motifs, and horror are excluded.

Each prompt plan is a prompt-only candidate in the existing live-media database:

- stable slot: `ui/run/card-art/<canonical-card-id>/illustration-v1.png`;
- domain: `run-card-art`; role: `illustration`;
- the candidate's metadata identifies the Units card and generation state;
- its provenance stores the exact composed prompt, prompt SHA-256, historical
  anchor, scene direction, eye treatment, and initial catalog source;
- generation uploads its exact image bytes to that same candidate, so the
  prompt-to-image relationship is not reconstructed later;
- once bytes exist, the prompt provenance is immutable in the Studio. A changed
  prompt requires a new candidate/version rather than rewriting what generated
  the existing pixels.

The Studio gains a routable **Card Prompts** catalog and Viewer. It reads only
the live database projection, exposes all 49 plans, copies the exact prompt,
and permits revision-CAS editing while a plan still has no generated media. It
does not fall back to the checked-in installation payload.

The initial 49-plan corpus is recorded as text provenance in
`docs/art/run-card-prompts-v1.json` and installed idempotently through the admin
live-media API. That file is an auditable initial payload, not a runtime catalog
or an accepted-art pointer. The database candidate is the live authority after
installation.

Parish Militia is explicitly different: its existing artwork remains untouched
and is linked by exact SHA-256. Its plan records the surviving provenance
description as `reconstructed-description`; it never claims that the original
full ImageGen prompt was retained and is not presented as a regeneration task.

## Consequences

- The next 48 illustrations can be generated sequentially without first
  inventing scene direction during each tool call.
- The set shares one visual thesis while compositions, historical residue, and
  eye concealment remain deliberately varied.
- Prompt review and correction are owner-operable and UI-routable without
  reviving the retired board-scene editor or adding a database migration.
- Every generated candidate can prove exactly which prompt produced it.
- The deterministic battlefield-vignette art direction and live-sprite overlay
  clauses of ADR-0262 no longer govern the card art pane. Its canonical card
  identity, authored names, and Enchiridion address remain in force.

## More Information

- [Lore and anti-story](../lore-anti-story.md)
- [Runtime asset contract](../runtime-asset-contract.md)
- [Initial Units-card prompt corpus](../art/run-card-prompts-v1.json)
