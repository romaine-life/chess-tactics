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
  layer: a persistent chess army, shops, and relics move through an authored War while
  every Battle still obeys recognizable chess-piece behavior (ADR-0193).
- Acquired relics read as persistent Run state: one frameless native-size icon
  strip stays at the upper-left beneath the title bar in Battles and between-Battle
  screens, independent of the Battle Controls panel; pointing at or focusing an
  icon immediately explains its name and complete effect (ADR-0216, ADR-0217).
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
  Concinnous's two-gold premium may produce a live 10 or 11 and Tactical's
  three-gold premium may produce a live 10 through 12 in the same coin.
  Cost is never decimal, fractional, or zero and never uses separate numbered
  coin art. Each actual unit in the ledger appears as the same
  canonical player-side sprite used on the board. Card Layout, shop,
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
  a shop reveals the card, promoted unchanged if purchased, and discarded if
  passed so a later shuffle may affect that core differently. Disciplined adds
  3 gold, Positioned adds 2 (and can raise Concinnous cards to 10 or 11), and
  Cacochymic discounts by piece tier—Pawn 0, minor
  1, Rook 2, Queen 3—so shop-card prices remain whole gold and a Cacochymic Pawn
  still costs 1. Exact public contents and modifier markers belong in the Contents Box
  unit ledger, not generated card-name permutations; an explicitly concealed
  Concinnous target appears there as hidden until purchase (ADR-0265, ADR-0271,
  ADR-0272, ADR-0305, ADR-0309).
- A fresh Run opens in the normal Shop with the permanent King, two free Pawns,
  8 gold, and three seeded card offers at distinct core values from 1 through 8.
  Each card may be bought once while the player can afford it. Every bought card
  keeps the Shop open, shows a framed **Purchased** state beneath that card, and
  uses the same gold transaction cue as selling. Only the explicit
  Continue action enters the first Battle, and it is available without requiring
  a purchase. **Card** is the sole current gameplay noun for these deck entries
  and offers (ADR-0321, ADR-0322, ADR-0323, ADR-0344, ADR-0347).
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
  **Tactical** causes exactly one unit to gain Discipline when the card is
  acquired. Every shop-card draw has a seeded one-in-eight Tactical chance,
  including the opening Shop, at every core value: an opening card whose
  surcharge passes the starting eight gold is offered out of reach rather than
  suppressed, and only a deal with nothing affordable at all repairs its cheapest
  card (ADR-0344). Tactical resolves before
  the other qualifiers and adds three gold even when the resulting price reaches
  ten through twelve. The unit is chosen only at acquisition. Multi-unit offers
  therefore conceal the outcome, while a one-unit offer shows the dedicated
  Discipline icon because the result is forced. The Tactical property icon in
  the type strip is a separate symbol. Tactical uses the dedicated blue-water
  frame.
  **Concinnous** means skillfully and harmoniously arranged and causes exactly
  one contained unit to become Positioned upon acquisition. The right-side
  Concinnous icon declares the property; detecting it does not automatically restate its
  behavior as Contents Box prose. Before purchase, direct unit-property
  presentation marks the target as hidden. The target is seeded and persisted
  with the offer, priced normally, and merely revealed—not rerolled—after
  purchase. A card does not become Concinnous just because an external relic
  later modifies one of its units. Concinnous owns its dedicated white frame
  treatment while retaining the shared anatomy. After Tactical and Pestiferous precedence, every remaining shop
  offer—regardless of core value—has a seeded one-in-eight Concinnous roll. It
  costs two additional gold, may reach eleven, and cannot carry another
  qualifier. Every frame uses one shared accepted gold-coin source with its live
  price overlaid (ADR-0272, ADR-0276, ADR-0305, ADR-0309, ADR-0310, ADR-0311,
  ADR-0324, ADR-0325, ADR-0327, ADR-0328, ADR-0329, ADR-0339, ADR-0341).
  **Hieratic** is the deliberately formal fourth card-property name paired with
  **Agminate**, and it draws in every Shop. It resolves last, after Tactical,
  Pestiferous and Concinnous, at the same seeded one-in-eight chance on the draws
  that remain. Exactly one contained unit gains Agminate at acquisition, chosen
  the way a Tactical target is: drawn on purchase, concealed by a multi-unit
  offer, and shown as the forced result on a one-unit offer. Agminate seats a
  unit in its role's formation rather than a rank and its King, Rook and Bishop
  rules interlock, so it carries Discipline's three-gold price. Hieratic owns the
  dedicated steel-armor frame (ADR-0339, ADR-0345).
- Run difficulty is **Ataraxia**. The first Run uses **Ataraxia 0 — The
  Untroubled Mind**, whose literal impact is standard Run rules and no
  Pestiferous shop cards; later Runs may opt into historically named
  conditions. Completing the highest available tier unlocks exactly the next
  one, and the ladder stacks: selecting tier N applies every condition from 1
  through N (ADR-0266, ADR-0268, ADR-0291).
- **Ataraxia I — The Great Mortality** initially targets Pestiferous status for
  roughly one in eight otherwise eligible shop draws. Pestiferous status is
  rolled with the rest of that affected offer, not added as another deck copy.
  A nonempty Pestiferous card publicly marks exactly one unit Cacochymic. Only that
  unit receives the piece-tier Cacochymic discount. The unit ledger identifies it
  with the dedicated Cacochymic icon rather than a written label. Every owned nonempty
  Pestiferous card loses its marked unit on each victorious-Battle advancement,
  whether or not the card was drawn or deployed, then immediately marks one
  remaining unit for the next advancement. Selling, cashing out, or otherwise
  permanently removing the marked unit retargets the card while it remains
  nonempty. The empty card remains as a possible dead draw until an explicit
  effect removes it. Affected shop offers, their exact public target, purchases,
  card membership, and losses are persisted; the seeded draw-time roll is one in
  eight and is inspectable in Card Layout. Pestiferous cards retain the shared
  face geometry but resolve their dedicated black bubbling-crude frame slot;
  ordinary cards keep the standard frame (ADR-0267, ADR-0269, ADR-0271, ADR-0286,
  ADR-0311, ADR-0312).
- Card ledgers have no assumed row cap before live experimentation. Dense cards
  may step down row spacing, icons, and type within readable bounds, but they
  must continue to show every unit property and retain the core card's flavor
  text in its bottom region. Repeated-unit grouping and a demonstrated maximum
  row count remain open presentation decisions (ADR-0270).
- Deployment modifiers may be contextual rather than linearly valuable. A
  role-aware **Agminate** ability belongs to a particular unit but may inspect
  the surrounding formation. Its Bishop behavior is only to prefer a square
  color opposite another Bishop: an ordinary Bishop can be its reference, one
  Agminate Bishop may have little effect alone, and a second is not owed an
  invented additional benefit. The player weighs that roster-dependent value
  (ADR-0273, ADR-0274).
- Run Deployment is a battlefield state, not a level-summary destination. The
  full board remains primary while Controls owns any Muster Roll, Discipline,
  or Surveyor's Compass decision. Discipline places its named unit directly on
  highlighted legal player-zone squares before ordinary deployment. While any
  Discipline placement remains, the battlefield shows only committed
  Disciplined units. The final required Discipline, Muster Roll, or Surveyor's
  Compass choice is first persisted and shown on that mounted board, then commits
  directly to Battle without a separate confirmation. The same scene, session
  store, board compositor, unit identities, and camera remain mounted: the
  deterministic friendly formation and unresolved opponents join the position.
  Each Disciplined placement and each remaining unit first introduced at Battle
  start uses the canonical entry animation. The final Disciplined unit completes
  its own arrival before automatic deployment begins as a separate wave;
  already-visible units neither move nor replay arrival, and the terrain is not
  reacquired or redrawn. Combat input,
  clocks, and opponent behavior open
  only after the persisted phase becomes Battle. When no meaningful player
  choice exists, Shop Continue commits the deterministic formation directly
  into Battle (ADR-0346, ADR-0348, ADR-0349, ADR-0350, ADR-0351, ADR-0352).
- Placement relics grant shared unit abilities rather than owning bespoke
  placement rules. Field Linens grants Positioned to Pawns; Royal Decree to the
  King; Crenellated Rampart to Rooks; and Pope's Staff to Bishops. Ghibelline
  Rampart grants Agminate to Rooks; Pope's Robes to Bishops; and Royal Sceptre
  to the King. Their rules text names only the grant, while the unit-ability
  reference owns the piece-specific behavior. Permanent and relic-granted
  copies do not stack (ADR-0274).
- Every persistent Run unit receives a seeded, stored historical identity when
  it joins the army. Piece type chooses the register: recorded archers for
  Pawns, documented knights, religious leaders, real castles for Rooks, queens
  or regents, and kings or emperors. Names remain stable through Battles,
  retries, and cross-device resume while the chess-piece type stays visible
  beside that identity (ADR-0228).
- A non-final Run victory funds its shop from the authored enemy force: each
  King is worth 1 gold and every other enemy chess piece pays 50% of its
  standard value (ADR-0220).
- Run shops separate buying, detailed army inspection, and a compact
  decision-complete selling list into explicit main-pane destinations. The
  persistent Controls panel navigates those destinations, resets the complete
  same-offer shop visit, and continues the Run; Army inspection remains
  available in every Run phase without pausing an active Battle (ADR-0230).
- **Enchiridion** is the player-facing reference for unit movement, terrain
  rules, the filterable core card deck, affected card types, all relics, and the
  behavior of the current unit abilities: Discipline, Positioned, Agminate,
  and Cacochymic. Card filters combine exact gold value with
  contained unit type. The Card Types reference uses the third column for its
  four affected-type names and the fourth for one selected shared card face,
  temporarily using The Volunteer for each; Pestiferous, Concinnous, Tactical
  and Hieratic all state their accepted effects, and none remains provisional
  (ADR-0313, ADR-0315, ADR-0329, ADR-0339, ADR-0341, ADR-0345). During Battle,
  the Controls title bar opens **Strategikon** over the board without unmounting
  the fight; its Martial Prosopography and Lipsanotheca expose the persistent
  army and held relics beside the same Enchiridion (ADR-0231).
- Play defaults to one activity-agnostic, descriptor-free **Continue** rail
  destination. Its column resumes in place: the most recently updated resumable
  activity is shown there with its facts and one final **Play** action, any
  second unfinished activity is offered below it under **Also unfinished**, and
  an empty Continue says **Nothing to continue** once. Ordinary Run remains a
  separate preparation destination between Current Run and **Start New Run**,
  with Ataraxia setup and confirmed replacement (ADR-0232, ADR-0289, ADR-0290,
  ADR-0294, ADR-0356).
- Army and Relics are grouped as player **Self inspection** in Run Controls.
  Either replaces the complete left Play workspace through the shared
  fill-only shell surface while the current phase stays mounted underneath;
  the normal relic strip yields to the readable Relics workspace during
  inspection. The exact workspaces are directly reviewable at
  `/run?view=army` and `/run?view=relics` (ADR-0240, ADR-0244).
- Selecting one Army unit opens a tile-backed inspection scene, not an enlarged
  portrait. The canonical board renderer draws that unit's real board sprite
  on a stable terrain surface with seeded optional grass. A persistent scene
  seed is assigned in the same transaction that adds the unit to the army, so
  the scene survives Battles, shops, resets, and cross-device resume
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
  relics may reshape its surrounding ecosystem but never a chess piece's behavior.
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
opening the normal Shop transaction and retires the separate draft phase and
screen. ADR-0322 supplies the current two-Pawn, 8-gold opening and card-native
purchase language, feedback, and sound. ADR-0323 removes the inherited
one-card-per-Shop cap so every affordable dealt card can be purchased once.
ADR-0347 removes the remaining mandatory opening purchase, making card commerce
optional in every Shop.

## 14. Administrator playtesting

Allowlisted administrators can open an in-place **Admin Controls** subview from the
active Battle HUD's Controls panel. Its tools can arm one unrestricted move, kill one
selected unit, award the current Battle, or grant Gold and an unheld Relic to the active
Run without navigating away from the board. These are explicit playtest interventions
around the canonical Battle and Run lifecycles, not new piece rules: the legal-move
generator remains unchanged. The exact access, lifecycle, and excluded-control boundaries
are governed by ADR-0195.
