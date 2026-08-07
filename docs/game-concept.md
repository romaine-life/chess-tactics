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
  screens, independent of the Battle Controls panel. Pointing at or focusing an
  icon explains its name and complete effect. Bona Vacantia presents three active
  lipsana and every choice commits directly; unit-targeting relic branches are
  retired (ADR-0216, ADR-0217, ADR-0368).
- Run cards keep the familiar trading-card anatomy: title, one live whole-number
  gold cost, illustration, the **Units** type line, a positional unit diagram, and
  flavor text. Rarity is independent from frame type. In the active Standard family,
  every rarity keeps the original outer frame. Uncommon colors only the illustration bezel
  light blue, and Rare colors it gold. The shared live-content openings and geometry remain
  unchanged.
  Unit abilities, modifier icons, and acquisition targeting are
  outside the active ruleset. Existing accepted composition illustrations, names, and
  flavor may be reused while dedicated formation identities are authored; the diagram
  is always the rules authority (ADR-0497).
- The active offer deck contains a deterministic 720-card generated core plus six
  retained authored exceptions. The core assigns Pawn, Knight, Bishop, Rook, and Queen
  rosters worth at most nine material to every edge-connected one-to-four-cell footprint
  in a two-row, four-column band, with Queen + Pawn admitted as the one ten-material
  roster so it receives all six connected arrangements. Horizontal translation is
  normalized, front/back is preserved, and left/right mirrors remain distinct. The retained
  exceptions preserve useful existing triangles, a diagonal Bishop pair, and the vertical
  Rook pair outside that grammar. His Grace remains the separate starter.
- Rarity describes desirability rather than material price. Queens, two Rooks, three
  non-Pawns, and every formation containing Bishops on opposite-colored squares are
  Rare. A Rook or two non-Pawns is ordinarily Uncommon; same-color Bishop pairs remain
  Common. Each Run derives a hidden 180-card pile containing exactly 135 Common, 36
  Uncommon, and 9 Rare cards. Per-rarity queues consume every unseen identity before
  recycling, then the selected cards are shuffled together without smoothing streaks.
- A Sectio reveals three seeded formation-card offers, or four while
  Quartermaster's Ledger is held. Each offer costs exactly its printed material
  value. Adlectio adds the card and its units without rolling, assigning, or
  revealing another property. The Run persists only its cursor through the hidden
  pile; its seed reproduces membership and order across reload. The revealed backs
  in consumed offer seats still provide no replacement draw during that Sectio.
- Run difficulty currently exposes only **Ataraxia 0 — The Untroubled Mind**,
  displayed as **Standard rules.** Higher difficulty tiers remain tabled until the
  baseline economy has supported a completed Run.
- A fresh Run starts with one non-removable card, **His Grace**: the King behind
  two protecting Pawns in a three-cell triangle. The earlier separate Front Lines
  card is retired. The starter's units, order, and formation are the same facts
  shown on its face and used in Deployment. There is no opening Sectio: opening
  Bona Vacantia, when present, leads directly to Battle 1; otherwise Deployment
  begins immediately. The first card offers arrive after Battle 1.
- Every Battle enters Deployment on the canonical empty battlefield with the
  face-down Chartulary in the center. Deal order is seeded per combat, with His
  Grace first and up to three cards in the first Conflict; later Conflicts add one
  card. The undrawn remainder returns to the persistent Chartulary mark.
- When a card is played, all of its remaining units deploy as one atomic authored
  formation. Its front and back rows enter the two-row Deployment band from the right
  and advance left until the next translation would collide. Deployment persists the
  complete hidden destination plan before the visible arrival. Each unit first summons
  onto its off-board formation seat; once the final unit lands, the complete rigid shape
  begins its sideways slide.
  Revealing a card and committing its formation are distinct animation boundaries,
  but there is no per-unit placement choice.
- The card face prints that formation on a miniature crop of the player-side
  isometric battlefield, using the same projected axes and north-facing unit art as
  combat. Its complete two-row footprint is solid while one ring of neighboring
  diamonds fades away; empty front or back seats remain visible rules information.
- If no legal translation fits the whole shape, Deployment makes a deterministic
  seeded best effort by placing individual units on legal squares. Board capacity
  may cut off units only after those whole-shape and fallback attempts. Blocked
  units remain recorded for Reservist mechanics. This recovery rule is provisional
  and favors completing a Run over adding a new placement dialogue.
- Deal, reveal, card cursor, transport, complete formation plans, committed
  placements, settling units, capacity result, discards, and blocked units persist
  across reload and Battle retry. **Next** advances one card boundary, **Play**
  advances the sequence, **Full deploy** commits the remaining formations, and
  **Pause** stops after the current atomic card arrival settles (ADR-0346,
  ADR-0419, ADR-0422, ADR-0435, ADR-0492, ADR-0493).
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
  inspection, and card-aware **Expunctio** into explicit main-pane destinations.
  **View Battle** shows the next canonical Level in a
  pannable read-only board beside its rules, zones, time control, and forces.
  Fixed opponents appear on the map; known setup-event rosters appear in the
  ledger without resolving their exact squares, and the persistent Run army
  still waits for Deployment. The persistent Controls panel navigates these
  destinations, resets the complete same-offer Sectio visit, and continues the
  Run; Army inspection remains available in every Run phase without pausing an
  active Battle. Within the Expunctio workspace, each canonical card face begins with no unit
  selected. Clicking an attached figure's visible outline or using the keyboard-and-touch
  cycle control selects and marks that exact stationary unit with the same blue highlight,
  identifies it, and offers its immediate **Aliene**
  command and return. The player may instead **athetize** one held card at most once
  per visit; the card and every unit still attached to it leave the Chartulary. Its fee is the
  card's full printed value plus the standard value of those remaining units; His Grace is
  unavailable. Alienatio sells individual units without removing their cards, so it discounts
  a later Expunctio without ever paying the complete fee. Prosopography remains the detailed
  unit ledger rather than a second Alienatio list. The two opposite gold movements keep their
  visible text and live value but use distinct native marks: a green plus for Alienatio's gain
  and a red minus for the Expunctio fee or Paid state. The card companion reserves those
  controls and its compact detail band before selection, so choosing or cycling a unit changes
  their contents in place without moving the surrounding physical panel. When Aliene commits,
  the sold figure fades from its old card seat while each surviving figure glides into the exact
  compact post-sale frame; the visual settlement never delays the transaction or disables input
  (ADR-0486, ADR-0487, ADR-0489).
  The operation names remain nouns while their unit/card commands are the obscure English
  verbs **Adlect**, **Aliene**, and **Athetize**; completed Alienatio and Expunctio records are
  **Aliened** and **Athetized this visit**, respectively
  (ADR-0230, ADR-0386, ADR-0393, ADR-0407, ADR-0432, ADR-0443, ADR-0482, ADR-0483, ADR-0485, ADR-0486, ADR-0487, ADR-0488, ADR-0489).
- **Enchiridion** is the player-facing reference for unit movement, terrain
  rules, the complete twenty-card catalog (His Grace plus nineteen offer cards),
  all active lipsana, and Ataraxia. Card filters combine exact gold value with
  contained unit type. The retired Abilities and Card Types sections have no
  route or gallery of their own. Cards uses no fourth column: its terminal third
  column fills the remaining canvas with the same real positional card faces used
  everywhere else (ADR-0364, ADR-0492). During Battle,
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
- A player Pawn visibly completes its move onto an authored promotion cell before the
  replacement choices appear. The arrived Pawn's square is highlighted and its blocking picker
  stays attached directly beside it rather than asking through ordinary HUD chrome. The complete
  chosen move still commits atomically, including from a premove or multiplayer seat
  (ADR-0503, ADR-0504).
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
Player armies and Run progression are governed by ADR-0193. ADR-0321 retired the
separate draft phase in favor of Sectio, while ADR-0494 now removes that opening
Sectio so Battle 1 introduces the Run before its card economy. ADR-0322's two-Pawn,
8-gold starter remains. ADR-0323 removes the inherited one-card-per-Sectio cap so
every affordable dealt card can undergo Adlectio once, and ADR-0393 names that
optional card admission **Adlectio** in every post-Battle Sectio.

## 14. Administrator playtesting

Allowlisted administrators can open an in-place **Admin Controls** subview from the
active Battle HUD's Controls panel. Its tools can arm one unrestricted move, kill one
selected unit, award the current Battle, or grant Gold and an unheld Lipsanon to the active
Run without navigating away from the board. These are explicit playtest interventions
around the canonical Battle and Run lifecycles, not new piece rules: the legal-move
generator remains unchanged. The exact access, lifecycle, and excluded-control boundaries
are governed by ADR-0195.
