---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0403](0403-surveyors-compass-chooses-between-ability-resolved-formations.md)"
partially_supersedes:
  - "[ADR-0346](0346-run-deployment-is-a-battlefield-state-with-conditional-input.md)'s conditional Deployment entry and flat choice order"
  - "[ADR-0348](0348-discipline-resolves-before-automatic-deployment.md)'s all-Adlected-first grouping"
  - "[ADR-0349](0349-the-final-deployment-choice-commits-and-camera-authority-follows-the-active-scene.md)'s final-choice boundary"
  - "[ADR-0352](0352-final-discipline-arrival-precedes-the-automatic-deployment-wave.md)'s separate automatic wave"
  - "[ADR-0367](0367-a-piece-type-can-be-broken-off-the-deployment-pool.md)'s Pawn-only geometry and non-King ordering"
  - "[ADR-0381](0381-affinity-dependent-agminate-units-deploy-after-the-random-formation.md)'s affinity phase bucket"
  - "[ADR-0396](0396-eutactic-and-agminate-compose-as-best-fit-row-and-station.md)'s Eutactic-plus-Agminate ordinary-unit composition and Pawn-middle station"
  - "[ADR-0398](0398-run-deployment-has-an-owner-operated-studio-lab.md)'s Pawn-region and multi-ability lab matrix"
  - "[ADR-0401](0401-deployment-lab-generates-an-editable-seeded-crew.md)'s independent three-bit ability mask"
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0274](0274-lipsana-grant-unit-owned-deployment-abilities.md)"
  - "[ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)"
  - "[ADR-0395](0395-eutactic-bestows-only-front-or-back-row-arrangement.md)"
  - "[ADR-0396](0396-eutactic-and-agminate-compose-as-best-fit-row-and-station.md)"
  - "[ADR-0399](0399-deployment-lab-launches-the-real-player-flow.md)"
  - "[ADR-0400](0400-deployment-playtests-carry-a-visible-return-to-the-lab.md)"
  - "[ADR-0404](0404-muster-roll-leaves-the-lipsanon-offer-pool.md)"
  - "[ADR-0405](0405-surveyors-compass-leaves-the-lipsanon-offer-pool.md)"
---

# ADR-0406: Klerosis deals cards before one-unit-at-a-time Deployment

## Context

Run Deployment previously began from the complete army and tried to order several independent
choice systems: dedicated piece zones, Muster Roll capacity selection, all Adlected units,
automatic formations, and Surveyor's Compass alternatives. This made card density irrelevant at
Battle start, made multi-ability units choose between phase buckets, and exposed formation rules
before the player had any reason to learn them.

The permanent King and two starting Pawns also existed only as loose army units. They had no cards
in the Chartulary even though purchased units were card-owned. Automatic placement state was not
durable enough to reproduce the exact deal, admission order, revealed information, and formation
after reload.

## Decision

### The starter Chartulary

- Every Run begins with two starter-only royal-purple cards in its Chartulary:
  - **His Grace**, containing only the King. Its **Praecipuus** card property moves it to the top
    of every deployment deal and grants its King the inherent **Primogeniture** unit ability:
    **Is placed before every other unit.** His Grace is not removable.
  - **Front Lines**, containing the two ordinary starting Pawns. Its soldiers are intentionally
    mundane and disposable; it has no card property.
- The two cards share one royal-purple frame treatment. His Grace's royal art carries the visual
  distinction; Front Lines remains the plainer companion.
- Starter cards are never ordinary Adlectio offers. Card-removal pricing and the final Front Lines
  removal interaction remain a separate shop decision.

### Klerosis owns the combat pool

- Every Battle enters Deployment and begins with **Klerosis**. The player sees all dealt cards at
  once, then a simple unordered **Deploying** and **Unavailable** roster beneath them.
- The first Conflict deals at most three held cards. Each later Conflict adds one card to that
  limit. His Grace is always first and consumes one of those slots; every remaining card is drawn
  from a fresh deterministic shuffle for that Battle.
- A dealt card contributes its remaining units individually. A card is divisible: some of its
  units may deploy while others are unavailable when capacity is short. Undrawn cards contribute
  no units to that combat.
- His Grace and its King are protected first. One hidden seeded order then decides both which
  remaining dealt units fit and the order in which admitted units later attempt placement. A unit
  that does not fit is completely unavailable for that combat.
- Muster Roll does not participate in this boundary while it remains outside the offer pool. If
  it returns, its player choice will replace the hidden capacity cut without changing the deal.

### One queue, one unit at a time

- After Klerosis, Primogeniture places the King. The remaining hidden order is **Farrago**: each
  unit is revealed and resolved individually instead of being sorted into ability phase buckets.
- When an Adlected unit reaches the front of the queue, the player chooses one legal open square.
  Adlection takes over that unit's placement; after random placement has revealed information,
  the player cannot undo back across that boundary.
- Every other unit is placed automatically from the rules it owns and only the units already on
  the board. Agminate Pawns and Bishops therefore naturally inspect prior pieces without being
  grouped into a special late phase.
- **Deploy all** resolves the same queue in one committed transition, pausing only when player
  input is required. **Step through** exposes one unit at a time as separate Draw and Place
  actions; its destination remains hidden until Place. The player may switch between the modes
  before the next information-bearing placement. Final placement automatically promotes the same
  mounted battlefield into Battle.
- The exact deal, hidden queue, capacity result, mode, revealed unit, cursor, and committed squares
  persist in the Run. Reload and Battle retry preserve the formation rather than rerolling it.

### Ability cardinality and best fit

- An ordinary unit owns at most one deployment ability. A unit-type lipsanon does not grant its
  ability to an ordinary unit that already has an inherent one. Stable held-lipsanon order chooses
  the effective grant if several could target the same otherwise-unmodified unit.
- The King uniquely owns Primogeniture plus at most one additional deployment ability. A King
  unit-type lipsanon may supply that one additional rule.
- Eutactic is a best-fit row preference: Pawn front; Knight and Bishop one row behind the front
  when at least three rows exist; Rook, Queen, and King back. If the preferred row is unavailable,
  the closest available row wins.
- Agminate scores legal open squares: Pawns prefer adjacency to another Pawn or an open file,
  with equal matches seed-tied; Knights
  prefer the one-square-inset ring; Bishops prefer the nearest square of opposite color from a
  prior Bishop; Rooks prefer their King/corner formation; Queens prefer the middle; Kings prefer
  the board edge. Seeded randomness breaks equal best fits.
- Dawn Register resolves after capacity admission, marks one Deploying unit Adlected for this
  combat (preferring a unit not already Adlected), and remains hidden until that unit is drawn.
- Cacochymic is independent of placement and has one effect: **Dies when combat ends.**

### Information, reference, and authoring surfaces

- Before choosing a mode, Klerosis reveals all dealt cards and the complete simple combat roster.
  The same cards are available under the Chartulary's **This Combat** filter; that filter disappears
  when combat ends and has no separate shortcut.
- The Deployment Lab remains the owner-operable instrument. **Generate** chooses a fresh seed,
  creates His Grace, Front Lines, and a random editable set of ordinary card-owned units, and can
  launch the real Klerosis-to-Battle flow with its visible return to the same Lab case.
- Manual Lab editing remains available, but ordinary ability controls are mutually exclusive and
  the King alone may combine Primogeniture with one additional ability.
- The beta uses the accepted Hieratic emblem for Praecipuus, the accepted Eutactic marker for
  Primogeniture, and the existing sovereign illustration for His Grace. Dedicated live-media
  roles and a King-specific illustration remain named visual debt; no packaged fallback is added.
- Pawn-only deployment zones and Pawn exclusions from the general player zone are retired end to
  end. Their squares fold into the general player zone. Existing King-only geometry remains
  readable but is outside this beta's authored flow.
- Surveyor's Compass remains registered for old references but its two-formation choice is
  superseded by the single persisted queue and stays unavailable from new offers. Waiting Cart's
  reservist behavior is named debt to retire after this beta rather than another dependency of the
  new Deployment interaction.

### Persistence transition

- `RunSaveVersion` advances from 18 to 19. Account and browser migrations add the two starter
  cards, grant the King Primogeniture, and preserve all unrelated Run progress.
- A version-18 Run already in Deployment or Battle returns to the pre-information Klerosis
  boundary, because version 18 did not persist the exact automatic destinations needed to resume
  truthfully. Its deck, roster, economy, seed, Conflict, and War progress remain intact.
- Append-only database migration 56 performs that Run transform and removes Pawn-only deployment
  geometry from every durable playable Level representation, including encoded `boardCode`,
  canonical Levels, campaigns, editor working state/history/recovery, public maps, active Runs,
  and lab/train/solve records.

## Consequences

- Cards determine which units matter in each combat, so unit density per card has immediate value.
- The player can learn Deployment as one visible sequence without first understanding every
  formation rule, while the stepper and trace still expose exact order and reasoning for debugging.
- Multi-effect conflict handling disappears for ordinary units; the King keeps the one deliberate
  exception needed for Primogeniture plus royal placement lipsana.
- Existing version-18 in-progress Battles replay Deployment once after rollout instead of silently
  accepting a formation the new save cannot prove.
- Pawn-only authored geometry is not preserved as a dormant compatibility path; Git history and
  migration tests are its record.

## More Information

- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
- [ADR-0380](0380-run-save-versions-always-migrate.md)
- [ADR-0396](0396-eutactic-and-agminate-compose-as-best-fit-row-and-station.md)
- [ADR-0399](0399-deployment-lab-launches-the-real-player-flow.md)
