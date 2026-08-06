# Chess Tactics — Game Concept

**Status:** Living concept doc. First draft reconstructed 2026-06-15 from the
design discussion + issue #25 (AI direction). This is the canonical statement of
*what the game is*. It supersedes the ad-hoc framing in the README and the
**gameplay-model** inspirations in `ui-art-direction.md`. Open questions are
flagged inline and collected at the end.

---

## 1. Pitch

Chess Tactics is a browser game of **bite-sized chess variations**. Each board is
a small, recognizable tweak on chess — a smaller grid, a pawn that steps three, an
odd squad, a strange piece, an obstacle — built to challenge a chess player the
way **Chess960 does: without ever invalidating the chess they already know.**

There is **no explained story, named hero, or player-character role.** Like
chess itself, it is an abstract board game; the player is no one. The world
instead follows the project's [**anti-story**](lore-anti-story.md): roles,
material, place, and historical residue imply that something is happening,
while the game refuses to resolve those suggestions into plot, biography, or
exposition ([ADR-0025](adr/0025-world-scene-art-anti-story-lore.md)). The fun is
in the positions.

## 2. The player & the promise

- **Audience:** people who already play chess — up to grandmasters and lifelong
  players.
- **Promise:** every board is solvable with **transferable chess intuition.**
  Forks, pins, tempo, king safety, promotion races — your chess knowledge always
  applies. A variation *re-frames* that knowledge; it never throws it away.
- **Session:** a **short sitting — 5–15 minutes of play time** (not per game).
  Early boards are **rapid**; you clear several quickly.

## 3. Design pillars

These are load-bearing. When a design decision is unclear, resolve it in favor of
these.

1. **It must still feel like chess, tweaked.** Never introduce so much, so fast,
   that the game stops reading as "chess with a twist." One new idea at a time.
2. **Restraint over novelty.** The possibility space is enormous; the discipline
   is *not* using all of it at once. Concise variations beat kitchen-sink ones.
3. **A clear path from A→Z.** Difficulty and strangeness ramp legibly. The player
   is always oriented.
4. **Recognizable first, strange later.** The game starts as near-ordinary chess
   and *gradually* gets stranger / more "tainted" (see §7).
5. **Wacky is the exception, not the loop.** Most boards are concise near-chess.
   Cursed/whacky boards are spice, not the meal.

## 4. The core loop

- The player sits down and plays a **board**: a chess position on an authored grid
  with a set of rules and a win condition.
- A board sits somewhere on a spectrum (§5): from a **directed puzzle** to a
  **full game against an AI**, with **PvP** against a human also supported.
- Ordinary boards remain **self-contained**. **Run** adds the deliberate continuity
  layer: a persistent chess army, Sectio visits, and lipsana move through an authored War while
  every Battle still obeys recognizable chess-piece behavior (ADR-0193).
- In an active Run Battle, **Undo** spends one gold to return to the checkpoint before
  the latest player move. Its deterministic enemy reply and move-owned casualty,
  Reservist, or Pawn cash-out effects rewind with it; the one-level checkpoint survives
  an ordinary reload and never changes chess-piece behavior (ADR-0394).
- Restarting or retrying an active Run Battle spends three gold. The paid reset is
  unavailable below that balance, keeps the deterministic deployment, and replaces the
  mutable Battle attempt without remounting its battlefield; retries outside Run remain
  free. Restart stays disabled during the live first turn, when it would only replace the
  untouched opening position; a terminal defeat or draw retains Retry. Run Battles do not
  expose Resign: Retry already discards the attempt, while Abandon Run owns ending the
  persistent Run (ADR-0424, ADR-0425, ADR-0426).
- **Reroll deployment** spends one gold at any point during Deployment or five gold after
  the formation has promoted into Battle. The existing live formation first turns and withdraws
  through each side's home edge; only after every visible unit clears the mounted battlefield does
  the price commit and the complete placement sequence restart with a new position seed. The
  current combat deal remains fixed, and three-gold Retry remains the cheaper way to replay the
  exact formation (ADR-0449, ADR-0450).
- A defeated Run Battle no longer offers Undo. Its viewport-scoped, non-modal result keeps
  the right Controls panel available for inspection and offers the canonical paid **Retry**
  beside explicit **New Run** and **Main Menu** exits. New Run enters the existing preparation
  and replacement-confirmation flow rather than replacing the Run immediately (ADR-0428).
- Acquired lipsana read as persistent Run state: one frameless native-size icon
  strip stays at the upper-left beneath the title bar in Battles and between-Battle
  screens, independent of the Battle Controls panel; pointing at or focusing an
  icon immediately explains its name and complete effect (ADR-0216, ADR-0217).
- A Conflict whose authored span still contains a loot Battle opens with **Bona
  Vacantia** before its Sectio. The mat presents three lipsana and no unrelated
  unit selector. An ordinary choice commits when it lands in the held strip; a
  choice that needs a named unit lands provisionally and opens the exact Martial
  Prosopography ledger/profile, with the lipsanon and ability explanation in the
  absent tab rail's column. Confirming a unit commits both facts and reveals the
  Sectio. Until then, **Return to the three offers** restores the untouched mat,
  with no pending acquisition in the Run document. The target ledger and each
  unit profile are addressable authored Run scenes rather than local screen state
  (ADR-0368, ADR-0383). The landed lipsanon remains continuously visible while
  scene ownership passes from the flight to the held strip (ADR-0385).
- Run cards use a familiar trading-card anatomy: a
  title at upper left, one compact gold coin with a live positive whole-number cost
  at upper right, a large pane for the card's accepted PixelLab illustration, a narrow card-
  type line, and a Contents Box whose flavor text remains at the bottom. The type
  line is never empty: ordinary and affected unit cards say **Units** at left.
  An affected card uses the strip's right-side symbol seat for its causal
  card-property icon instead of appending a written qualifier. Ordinary cards
  leave that seat empty. The primary label uses one shared optically centered
  scale and baseline rather than per-property positioning.
  Detecting an ability, modifier, or affected card type does not automatically
  synthesize explanatory prose in the Contents Box; those definitions will use a
  later tooltip, reference, or inspection system. The shared face still permits
  separately authored card content.
  Future mechanically different primary families may use
  types such as **Event**. Ordinary costs remain from one through nine;
  Concinnous's two-gold premium may produce a live 10 or 11 and Legatine's
  three-gold premium may produce a live 10 through 12 in the same coin.
  Cost is never decimal, fractional, or zero and never uses separate numbered
  coin art. Each actual unit in the ledger appears as the same
  canonical player-side sprite used on the board. Card Layout, Sectio,
  review, and Enchiridion use the same face rather than parallel card shells
  Each frame declares title, cost, art, type, and contents rectangles in its
  native 1060×1484 coordinate system. Those measurements are bound to the exact
  frame SHA-256, projected through one shared responsive formula, and reviewable
  as an overlay in Card Layout; unmatched pixels use the Standard profile
  (ADR-0219, ADR-0225, ADR-0270, ADR-0275, ADR-0276, ADR-0283, ADR-0285,
  ADR-0305, ADR-0309, ADR-0324, ADR-0325, ADR-0327, ADR-0329, ADR-0330,
  ADR-0339).
  In-place card changes retain the last complete face until the requested card's
  actual image layer is ready, then promote content, art, frame, and frame
  geometry together; rapid newer selections cancel older pending cards
  (ADR-0314, ADR-0324).
- The card deck's 49 unique one-through-nine-point compositions are the
  authored **core cards**. Each keeps one title and flavor text while its
  drawn offer may give particular units more than one modifier. The 49 cores do
  not multiply into variant deck entries: effects are rolled and persisted when
  a Sectio reveals the card, promoted unchanged if adlected, and discarded if
  passed so a later shuffle may affect that core differently. Adlected adds
  3 gold, Eutactic adds 2 (and can raise Concinnous cards to 10 or 11), and
  Pestiferous reduces its offer price according to the marked unit's piece tier—Pawn 0, minor
  1, Rook 2, Queen 3—so Sectio-card prices remain whole gold and a marked Pawn
  still costs 1. Exact public contents and modifier markers belong in the Contents Box
  unit ledger, not generated card-name permutations; an explicitly concealed
  Concinnous target appears there as hidden until Adlectio (ADR-0265, ADR-0271,
  ADR-0272, ADR-0305, ADR-0309).
- After the opening Bona Vacantia choice, a fresh Run enters the normal Sectio with
  the permanent King, two free Pawns, 8 gold plus any immediate lipsanon payout,
  and three seeded card offers at distinct core values from 1 through 8, or four while
  Quartermaster's Ledger is held.
  Each card may undergo Adlectio once while the player can afford it. Every adlected card
  keeps the Sectio open, flies from its Sectio seat into the title-reachable
  Chartulary, reveals the accepted universal face-down card beneath it in the unchanged
  original pile seat, and uses the same gold transaction cue as Alienatio. That revealed back
  is presentation only—not a replacement offer or a persisted remainder—and the surviving
  piles do not move. Only the explicit
  Continue action enters the first Battle, and it is available without requiring
  an Adlectio. **Card** is the sole current gameplay noun for these deck entries
  and offers (ADR-0321, ADR-0322, ADR-0323, ADR-0344, ADR-0347, ADR-0387, ADR-0481).
- Each of those 49 Units cards owns one native 400×280 PixelLab illustration
  keyed by its canonical composition id. Human unit roles and readable
  equipment control the composition; historical pressure supplies secondary
  setting and anti-story residue. Faces and eyes may appear naturally—the
  rejected global eye-concealment rule is retired. The 49 slots are reviewed
  and accepted atomically, with exact or explicitly reconstructed PixelLab
  prompt provenance and no packaged fallback (ADR-0281, ADR-0282).
- A card's affected **qualifiers** identify causal rules rather than replacing
  its primary type. Pestiferous changes the card lifecycle and publicly marks
  one current unit with the Cacochymic status icon; the card face does not spell
  out **Pestiferous** in the type strip or **Cacochymic** beside that unit. Its
  right-side Pestiferous property icon is distinct from the Cacochymic state icon.
  **Legatine** causes exactly one unit to gain Adlected when the card is
  acquired. Every Sectio-card draw has a seeded one-in-eight Legatine chance,
  including the opening Sectio, at every core value: an opening card whose
  surcharge passes the starting eight gold is offered out of reach rather than
  suppressed, and only a deal with nothing affordable at all repairs its cheapest
  card (ADR-0344). Legatine resolves before
  the other qualifiers and adds three gold even when the resulting price reaches
  ten through twelve. The unit is chosen only at acquisition. Multi-unit offers
  therefore conceal the outcome, while a one-unit offer shows the dedicated
  Adlected icon because the result is forced. The Legatine property icon in
  the type strip is a separate symbol. Legatine uses the dedicated blue-water
  frame.
  **Concinnous** means skillfully and harmoniously arranged and causes exactly
  one contained unit to become Eutactic upon acquisition. The right-side
  Concinnous icon declares the property; detecting it does not automatically restate its
  behavior as Contents Box prose. Before Adlectio, direct unit-property
  presentation marks the target as hidden. The target is seeded and persisted
  with the offer, priced normally, and merely revealed—not rerolled—after
  Adlectio. A card does not become Concinnous just because an external lipsanon
  later modifies one of its units. Concinnous owns its dedicated white frame
  treatment while retaining the shared anatomy. After Legatine and Pestiferous precedence, every remaining Sectio
  offer—regardless of core value—has a seeded one-in-eight Concinnous roll. It
  costs two additional gold, may reach eleven, and cannot carry another
  qualifier. Every frame uses one shared accepted gold-coin source with its live
  price overlaid (ADR-0272, ADR-0276, ADR-0305, ADR-0309, ADR-0310, ADR-0311,
  ADR-0324, ADR-0325, ADR-0327, ADR-0328, ADR-0329, ADR-0339, ADR-0341).
  **Hieratic** is the deliberately formal fourth card-property name paired with
  **Agminate**, and it draws in every Sectio. It resolves last, after Legatine,
  Pestiferous and Concinnous, at the same seeded one-in-eight chance on the draws
  that remain. Exactly one contained unit gains Agminate at acquisition, chosen
  the way a Legatine target is: drawn on Adlectio, concealed by a multi-unit
  offer, and shown as the forced result on a one-unit offer. Agminate seats a
  unit in its piece-specific station during automatic deployment, so it carries
  Adlected's three-gold price. Hieratic owns the
  dedicated steel-armor frame (ADR-0339, ADR-0345).
- Run difficulty is **Ataraxia**. The first Run uses **Ataraxia 0 — The
  Untroubled Mind**, whose displayed impact is **Standard rules.**; later Runs may opt into historically named
  conditions. Completing the highest available tier unlocks exactly the next
  one, and the ladder stacks: selecting tier N applies every condition from 1
  through N. The title-bar tooltip names **Ataraxia** once, then lists every active
  tier as a small carved numeral beside that tier's effect and adds no glossary
  panes of its own (ADR-0266, ADR-0268, ADR-0291, ADR-0390, ADR-0391).
- **Ataraxia I — The Great Mortality** initially targets Pestiferous status for
  roughly one in eight otherwise eligible Sectio draws. Pestiferous status is
  rolled with the rest of that affected offer, not added as another deck copy.
  A nonempty Pestiferous card publicly marks exactly one unit Cacochymic. The offer's
  price reduction is based on that unit's piece tier. The unit ledger identifies it
  with the dedicated Cacochymic icon rather than a written label. The marked Cacochymic
  unit on every owned nonempty Pestiferous card dies when combat ends, whether or not its card was drawn or deployed.
  Whenever that unit dies, its Pestiferous card immediately marks one remaining unit.
  Alienatio, cashing out, or otherwise permanently removing the marked unit also
  retargets the card while it remains nonempty. The empty card remains as a possible dead draw until an explicit
  effect removes it. Affected Sectio offers, their exact public target, Adlectio state,
  card membership, and losses are persisted; the seeded draw-time roll is one in
  eight and is inspectable in Card Layout. Pestiferous cards retain the shared
  face geometry but resolve their dedicated black bubbling-crude frame slot;
  ordinary cards keep the standard frame (ADR-0267, ADR-0269, ADR-0271, ADR-0286,
  ADR-0311, ADR-0312, ADR-0397).
- Card ledgers have no assumed row cap before live experimentation. Dense cards
  may step down row spacing, icons, and type within readable bounds, but they
  must continue to show every unit property and retain the core card's flavor
  text in its bottom region. Repeated-unit grouping and a demonstrated maximum
  row count remain open presentation decisions (ADR-0270).
- The starter army belongs to two starter-only cards in the Chartulary.
  **His Grace** contains the King and alone uses the royal-purple frame;
  Praecipuus puts that card at the top of every Battle deal. Because cards now
  own deployment order, His Grace's first seat places the King before every
  other unit without a second unit ability. **Front Lines** contains the two ordinary starting Pawns
  and uses the Standard Units frame because it has no card property.
  His Grace is not removable and neither card appears in ordinary Adlectio
  offers (ADR-0406, ADR-0407, ADR-0413).
- Every Battle enters Deployment on the canonical empty battlefield with the complete face-down
  Chartulary deck visible in the center. **Deal** partitions that deck only after the battlefield
  scene is committed; a device-local **Deal automatically** preference may perform the same
  action on later Deployments. The first Conflict deals at most three cards, one at a time, into
  the numbered stack at the top-left of Controls so each landing remains legible. Each later
  Conflict adds one card. His Grace consumes the first slot and the rest come from a fresh seeded
  shuffle. The undrawn remainder moves as one counted face-down stack into the persistent
  Chartulary mark. Dealt cards contribute their remaining units individually, so one card may be
  split by limited board capacity. The top card flips only when it becomes active; later cards
  remain hidden (ADR-0419, ADR-0422).
- Card order, followed by each card's persisted left-to-right unit seats, owns both capacity and
  placement order. A sold or lost unit leaves an empty seat rather than changing the durable
  order. The revealed card retains its authored ledger, density, unit scale, and stack positions;
  a unit that leaves becomes a visibly vacant seat and only the occupied count changes. Units resolve one at a time from
  their own rules; Adlected
  pauses for a highlighted-square choice when that unit reaches the front.
  Deployment transport begins paused, but **Play**, **Next**, and **Full deploy** are available
  before Deal and perform that Deal before continuing their requested pace. The dedicated Deal
  action leaves the pile paused and face down. **Next** reveals and advances exactly one ordinary
  unit before pausing; **Play** advances ordinary units one at a time; **Full deploy** reveals no
  cards and commits every remaining automatic unit across all remaining cards at once as one
  arrival wave. **Pause** finishes the current atomic arrival before stopping.
  Adlected and any later required input always pause transport, and a resolved choice never
  silently resumes it. Under Play or Next, each unit finishes its board arrival before the next
  seat advances and a card discards after its final unit settles. Under Full deploy, remaining
  cards stay motionless and face down while the one unit wave lands. Only after every unit settles
  do those cards fly from their measured Controls pile into the measured Chartulary mark together.
  After the final discard, the already-mounted battlefield promotes directly into Battle. The exact deal,
  seat order, active card, reveal
  state, unit cursor, transport, capacity result, choices, discards, and formation persist across
  reload and Battle retry (ADR-0346, ADR-0350, ADR-0351, ADR-0419, ADR-0422, ADR-0427, ADR-0435,
  ADR-0436).
- Deployment modifiers may be contextual rather than linearly valuable. An
  Agminate Pawn inspects prior Pawns for adjacency or an open file, and an
  Agminate Bishop prefers the nearest opposite-color square relative to a prior
  Bishop. They receive no late phase: whether a reference already exists is a
  consequence of the card and seat order (ADR-0273, ADR-0274, ADR-0419).
- Muster Roll and Surveyor's Compass are registered only for existing Runs that
  already reference them and explicit playtests. New reveals omit both from the
  seeded lipsanon offer surfaces until the developing Deployment choices and
  information locks are settled; no RunSaveVersion or database migration is
  introduced by that availability change. Surveyor's Compass's former
  two-formation behavior is superseded by one-unit-at-a-time card order (ADR-0404,
  ADR-0405, ADR-0419).
- Placement lipsana grant shared unit abilities rather than owning bespoke
  placement rules. Field Linens grants Eutactic to Pawns; Royal Decree to the
  King; Crenellated Rampart to Rooks; and Pope's Staff to Bishops. Ghibelline
  Rampart grants Agminate to Rooks; Pope's Robes to Bishops; and Royal Sceptre
  to the King. Their rules text names only the grant, while the unit-ability
  reference owns the piece-specific behavior. Permanent and lipsanon-granted
  copies do not stack. Ordinary units carry at most one deployment ability;
  unit-type lipsana skip units that already have an inherent ability. Every unit carries at most
  one deployment ability; the King begins without one and may receive one from a lipsanon.
  Eutactic is a closest-available best-fit row preference:
  Pawns prefer the front row; Knights and Bishops the row immediately behind
  it; and Rooks, Queens, and the King the back row. Agminate separately gives
  Pawns a preference for adjacency to another Pawn or an open file, Queens a
  pull toward the middle, Knights a preference one square in from an edge,
  the King to an edge, Rooks into their King-flank/corner formation, and
  Bishops onto the nearest opposite square color from a prior Bishop
  (ADR-0274, ADR-0395, ADR-0396, ADR-0419).
- Every persistent Run unit receives a seeded, stored historical identity when
  it joins the army. Piece type chooses the register: recorded archers for
  Pawns, documented knights, religious leaders, real castles for Rooks, queens
  or regents, and kings or emperors. Names remain stable through Battles,
  retries, and cross-device resume while the chess-piece type stays visible
  beside that identity (ADR-0228).
- A non-final Run victory funds its Sectio from the authored enemy force: each
  King is worth 1 gold and every other enemy chess piece pays 50% of its
  standard value (ADR-0220).
- Sectio visits separate Adlectio, upcoming-Battle reconnaissance, detailed army
  inspection, a compact decision-complete Alienatio list, and **Expunctio** into explicit
  main-pane destinations. **View Battle** shows the next canonical Level in a
  pannable read-only board beside its rules, zones, time control, and forces.
  Fixed opponents appear on the map; known setup-event rosters appear in the
  ledger without resolving their exact squares, and the persistent Run army
  still waits for Deployment. The persistent Controls panel navigates these
  destinations, resets the complete same-offer Sectio visit, and continues the
  Run; Army inspection remains available in every Run phase without pausing an
  active Battle. Within the Expunctio workspace, the player **athetizes** one held card at most
  once per visit; the card and every unit still attached to it leave the Chartulary. Its fee is
  the card's full printed value plus the standard value of those
  remaining units; His Grace is unavailable. Alienatio still sells individual units without
  removing their cards, so it discounts a later Expunctio without ever paying the complete
  fee. The operation names remain nouns while their unit/card commands are the obscure English
  verbs **Adlect**, **Aliene**, and **Athetize**; completed Alienatio and Expunctio records are
  **Aliened** and **Athetized this visit**, respectively
  (ADR-0230, ADR-0386, ADR-0393, ADR-0407, ADR-0432, ADR-0443).
- **Enchiridion** is the player-facing reference for unit movement, terrain
  rules, the filterable card catalog (the two starter cards and 49-card core
  deck), affected card types, all lipsana, and the
  behavior of the current unit abilities: Adlected, Eutactic, Agminate, and
  Cacochymic. Card Types includes the starter-only Praecipuus
  property on canonical His Grace. Card filters combine exact gold value with
  contained unit type. Cards uses no fourth column: its terminal third column
  fills the remaining Enchiridion canvas with real card faces in a vertically
  scrolling gallery, while individual card addresses focus those faces without
  introducing a separate detail (ADR-0364). The Card Types reference uses the
  third column for its five affected-type names and the fourth for one selected
  card face: canonical His Grace for Praecipuus and The Volunteer for the four
  ordinary properties. Praecipuus, Pestiferous, Concinnous, Legatine, and Hieratic
  all state their accepted effects, and none
  remains provisional
  (ADR-0313, ADR-0315, ADR-0329, ADR-0339, ADR-0341, ADR-0345). During Battle,
  the Controls title bar opens **Strategikon** over the board without unmounting
  the fight. Its four section marks sit beside the book and directly open the
  Enchiridion, Martial Prosopography, Chartulary, and Lipsanotheca; the same
  destinations remain in the complete workspace rail. Those Run registers expose the
  persistent army, the cards adlected so far, and held lipsana beside the same
  Enchiridion. The title route retains the covered Run phase and appends the exact
  visible address—`Sectio › Strategikon › Chartulary`, or one further segment for an
  Enchiridion subcategory (ADR-0231, ADR-0387, ADR-0389). The Chartulary is the Cards gallery itself — same
  filters, same gold groups, same faces, no annotation beside them — and the
  only difference is which cards are in it (ADR-0371).
- Play defaults to one activity-agnostic, descriptor-free **Continue** rail
  destination. Its column resumes in place and shows exactly one activity: the
  most recently updated resumable one, with its facts and one final **Continue**
  action. Any other unfinished activity is reached through its own rail
  destination, and an empty Continue says **Nothing to continue** once.
  Ordinary Run remains a
  separate preparation destination between Current Run and **Start New Run**,
  with Ataraxia setup and confirmed replacement (ADR-0232, ADR-0289, ADR-0290,
  ADR-0294, ADR-0356, ADR-0474).
- Army and Lipsana are grouped as player **Self inspection** in Run Controls.
  Either replaces the complete left Play workspace through the shared
  fill-only shell surface while the current phase stays mounted underneath;
  the normal lipsanon strip yields to the readable Lipsana workspace during
  inspection. The exact workspaces are directly reviewable at
  `/run?view=army` and `/run?view=lipsana` (ADR-0240, ADR-0244).
- Selecting one Army unit opens a tile-backed inspection scene, not an enlarged
  portrait. The canonical board renderer draws that unit's real board sprite
  on a stable terrain surface with seeded optional grass. A persistent scene
  seed is assigned in the same transaction that adds the unit to the army, so
  the scene survives Battles, Sectio visits, resets, and cross-device resume
  (ADR-0247).
- **Campaign** strings 5–10 boards into a curated, slowly-evolving sequence, and
  will grow richer over time.

## 5. What a board is — the puzzle ↔ game ↔ PvP spectrum

A single board can lean:

- **Directed / puzzle** — a specific line to reach the win condition (think
  "mate in N" on a tweaked board).
- **Open game vs. AI** — a short, Chess960-style game played out against the
  engine.
- **PvP** — the same board, human-vs-human.

The same authored board can support more than one of these.

## 6. Rules baseline

The **default** ruleset is **real chess**:

- **Check and checkmate work normally** — you may not leave your king in check;
  checkmate wins. **Castling, en passant, promotion, stalemate, and the draw rules
  (50-move and threefold repetition) are all in the v1 baseline** unless a board
  says otherwise.
- **Capture is one-hit, like chess.** There are **no hit points, no action points,
  no command points, and no per-piece "powers."** The stat/RPG layer shown in the
  old `skirmish-concept.png` (HP bars, AP, "CP 8/12", a POWER action) is
  **explicitly out of scope.**

Boards may deviate from this baseline — but deviation is a deliberate, per-board
**variation** (§7), not the norm. One-hit capture and normal check hold ~99% of
the time.

### Edge barriers

Authored fence and wall edges block a direct orthogonal crossing. A diagonal
crossing has two possible routes around the shared corner and is blocked only
when both routes encounter barriers; one open route leaves the diagonal open.
Knights and other non-adjacent jumps hop intervening edges. The same rule governs
movement, captures, attacks, and check, and it reads canonical level geometry
rather than rendered pixels. See [ADR-0119](adr/0119-edge-barriers-close-diagonals-only-when-both-routes-are-blocked.md).

## 7. Variation levers

A board is defined by which dials it turns away from standard chess. The canonical
levers:

| Lever | Examples |
|---|---|
| **Board size & shape** | smaller grids, non-rectangular boards, holes |
| **Modified piece moves** | a pawn that moves three; a knight with a longer leap |
| **Custom / "Frankenstein" pieces** | pieces with incomplete or hybrid movesets; a "tortured/cursed bishop" with unusual movement or effects |
| **Obstacles & terrain** | rocks today; later: terrain that blocks movement or lines, gives cover, creates hazards, or mutates |
| **Unique squads** | non-standard armies — which pieces each side fields, and how many *(authored per board)* |
| **Royal & win conditions (fluid)** | default is one king + checkmate, but a board may use: two kings; a queen acting as the king; a king with two lives; a king that can kill its attacker once and only dies if attacked again; or an alternate goal entirely *(v1 ships standard checkmate only; the fluid variants are a later expansion)* |

**Tactical-motif vocabulary.** Variations are judged by the chess tactics they
create and reward — forks, pins, skewers, discovered attacks, deflections,
overloads, traps, promotion races, smothered-mate-like enclosures. This is the
design language for "is this board interesting?"

**The "tainting" progression.** Across the campaign, boards drift from ordinary →
strange. Early: a smaller board, a stretched pawn. Later: cursed pieces, mutating
terrain, fluid kings. The drift is gradual by design (pillars §3).

## 8. Modes

Near-term scope:

- **Campaign** — a curated sequence of 5–10 boards, growing over time.
- **Run** — a seeded persistent army moves through a separately authored War; Battles
  retain normal chess behavior while deployment, economy, information, objectives, and
  rewards create run variety (ADR-0193).
- **Solo Skirmish** — a quick one-off board vs. the AI: **mostly fixed boards, with
  a random-setup option.** Cheap to include, so it is in.
- **Level Editor + sharing** — first-class (§9).
- **PvP** — human-vs-human on a board, supported.

Explicitly **not** in scope: **Daily Challenge** (cut). The accounts / ranks /
roster meta-systems from the old main-menu art are not part of this concept unless
re-introduced deliberately.

## 9. The editor & sharing — a core pillar

The **level editor is a huge part of the fun**, and is a **first-class,
player-facing feature**, not just the author's tool. Players build their own chess
variants and **share them**; collaborating with friends on boards is wanted.

- A board/level is a durable, serializable document (grid, terrain/obstacles,
  squads, win condition, rules).
- Sharing/collaboration is in scope; the heavier collaboration lift is acceptable
  "until it gets too painful."
- **Separate, not part of the game:** the bespoke **asset/design portfolio**
  tooling (the `/design` portfolios) is a content-production and collaboration aid
  for creators, **not** a player-facing game feature. Keep it for now; it does not
  belong on the game's concept surface.

## 10. The AI

The AI is an **open, exploratory design area** — see **issue #25** for the full
discussion. This section records *direction*, not a spec.

- **v1 is intentionally braindead.** Ship a simple, obvious first-pass opponent
  (greedy capture, otherwise legal-move play). Everything below is the
  *longer-term* arc, not the first cut.
- **Leaning adversarial, not puzzle-pressure.** Because the theme *is* chess
  tactics, the AI should aim to be a genuinely **competent opponent**, more than an
  Into-the-Breach-style intent generator.
- **Reuse the *shape* of chess-engine thinking, not Stockfish itself.** Once
  terrain and custom rules diverge from chess, a stock engine stops fitting — but
  legal-move generation, position evaluation, selective alpha-beta/negamax search,
  quiescence on forcing lines, transposition tables, and time management all still
  apply.
- **Abstract tactical-motif detection.** Detect forks / pins / overloads /
  deflections / enclosed-forced-kills *abstractly* (a move that threatens multiple
  targets; a defender pulled off duty; a vital target with no escape) so they
  survive cursed pieces and terrain.
- **Influence / utility maps** for messy, terrain-heavy positions where deep
  search is impractical.
- **Complexity guardrail:** **one unit acting per decision stays tractable; a whole
  squad acting in arbitrary order explodes combinatorially.** Custom movement alone
  is usually fine; mutable terrain + multi-unit combos get hard fast. Unit/board
  design should respect this so the AI stays viable — another reason to keep
  variations concise (pillar §3).

## 11. Non-goals

- **Not** Into the Breach, **not** Advance Wars, **not** Final Fantasy Tactics.
  These were prior framings; the gameplay-model inspirations cited in
  `ui-art-direction.md` are superseded by the chess-variation thesis. (The
  *visual* identity in that doc — moonlit "Dark Strategy Pixel," readable board —
  is not re-litigated here.)
- **No** stat / RPG layer (HP / AP / CP / powers).
- **No explained plot, named-character narrative, or lore exposition.**
  Anti-story may imply events through roles and material residue, but it must
  not resolve those implications into an authored narrative for the player
  ([ADR-0025](adr/0025-world-scene-art-anti-story-lore.md)).
- **No** daily challenge.
- **No permanent account power progression.** Run continuity lasts for one active War;
  lipsana may reshape its surrounding ecosystem but never a chess piece's behavior.
- The asset / design portfolio is **not** a game feature.

## 12. Relationship to the current codebase

The game is considered **un-prototyped**; existing code and art are scaffolding —
useful raw material, not canon. For future contributors:

- **Aligned with this concept:** the pure, deterministic chess **rules engine**
  (movement, capture, promotion) under `frontend/src/core`; the **terrain /
  elevation** and **objective** scaffolding; the **level/campaign schema**, the
  **editors**, and **Postgres persistence**.
- **Rejected by this concept:** the **HP / AP** code paths and the **CP / POWER**
  economy implied by `skirmish-concept.png`; the **enemy-telegraph / forecast**
  mechanic *as a core identity* (that was the Into-the-Breach framing — it may
  survive only as optional, occasional board flavor, never the spine); the
  README's "anchors / telegraphs / six breaches" flavor line.
- **Shipped (ADR-0072/0077):** live play now has check, checkmate, stalemate,
  authored 50-move/threefold draws, and one committed-position adjudicator shared
  by solo, lobby, AI, self-play and search. `applyMove` owns mechanics only; ordered
  authored/preset victory rules decide product outcomes before chess terminal rules.
- **Shipped (ADR-0050/0287/0288):** authored **win-rule modes** are now real — the editor
  selects the objective (Last Man Standing / King Assault / Rival Kings / Survive /
  Reach), and the dedicated Deployment workspace authors an optional randomized roster
  per side. Explicit deployment can combine with fixed anchors; a nonzero roster needs
  enough usable tiles in its one automatically used starting zone, while a fixed-only
  side needs no deployment zone. A starting zone may contain disconnected painted
  regions, so new authoring does not need a zone selector or several pooled zones.
  War player zones remain the implicit consumer for the active Run army rather than a
  duplicated setup event. Saves gate on those **playability rules** as well as presence
  and King-mode constraints.
  King-capture events remain authored win paths, while checkmate/stalemate are the
  shared chess terminal layer. Board floor dropped to 1×1.

## 13. v1 scope — the first cut

The first prototype stays deliberately minimal (pillars §3). Resolved scope:

1. **Rules:** full standard chess — castling, en passant, promotion, stalemate,
   and the 50-move / threefold-repetition draws.
2. **Win condition:** standard **king checkmate only.** The fluid-royal variants
   (two kings, queen-as-king, king-with-lives, …) are a later expansion.
3. **Squads:** ordinary boards remain authored per board. Run Battles combine authored
   allies with the player's persistent army through authored placement zones.
4. **Tactics:** **not surfaced** to the player and not a near-term concern — no
   motif hints or teaching in v1.
5. **Solo Skirmish:** **mostly fixed boards, with a random-setup option.**
6. **AI:** a **simple, braindead first pass** (greedy / legal-move play). The richer
   engine directions live in issue #25 and §10 as the longer-term arc.

**Deferred (post-v1, not precluded):** fluid royal / win conditions; mutating or
cursed terrain and pieces; named-tactic surfacing; a competent search-based AI.
Player armies and Run progression are governed by ADR-0193. ADR-0321 makes the
opening the normal Sectio transaction and retires the separate draft phase and
screen. ADR-0322 supplies the current two-Pawn, 8-gold opening and card-native
transaction feedback and sound. ADR-0323 removes the inherited one-card-per-Sectio
cap so every affordable dealt card can undergo Adlectio once. ADR-0347 removes the
remaining mandatory opening transaction, and ADR-0393 names the optional card
admission **Adlectio** in every Sectio.

## 14. Administrator playtesting

Allowlisted administrators can open an in-place **Admin Controls** subview from the
active Battle HUD's Controls panel. Its tools can arm one unrestricted move, kill one
selected unit, award the current Battle, or grant Gold and an unheld Lipsanon to the active
Run without navigating away from the board. These are explicit playtest interventions
around the canonical Battle and Run lifecycles, not new piece rules: the legal-move
generator remains unchanged. The exact access, lifecycle, and excluded-control boundaries
are governed by ADR-0195.
