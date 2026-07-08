# Per-Board AI — Plan & Roadmap

_Status: agreed direction, first slice not yet built. Written 2026-07-05. Synthesis of
the issue #25 AI-direction discussions (across several models + the owner). This is the
living plan; specific decisions inside it may later be pinned as ADRs._

---

## TL;DR

Deliver a **complete, robust, per-board AI feature**. Each board gets the **cheapest eval
that plays it well, fit from that board's own self-play games** — and for the smallest
boards that may be *bare search with no tuned eval at all*. We follow **Stockfish's shape**
(search backbone + a fitted/learned evaluation; never a policy net). The near-term work is
to **actually use the self-play data we already generate and currently throw away**, via
**Texel tuning**, with **heavy inspection tooling** so the owner can *see and poke* what the
algorithm derived. First practice slice: derive and inspect an eval for **Break the Line**
(`off-l-break-line`).

---

## 1. The goal

- **Per-board AI.** Lessons of one board don't transfer; a unit's value and importance
  depend on that board's features (size, shape, terrain, objective, roster).
- **Right-sized.** We do **not** want a heavyweight eval engine for a trivial board. A board
  only *earns* a more expressive eval when it is big/long enough to justify one.
- **A delivered feature, judged by playing and inspecting it** — not a lecture, not a
  metrics dashboard for its own sake. The opponent is still "normal game AI": a felt
  presence that visibly understands its board.
- **The owner learns by doing and seeing.** Inspection tools that expose *what the eval
  derived and why* are a first-class part of the deliverable, not a follow-up.

---

## 2. The framing (and the correction that sets the objective)

Follow Stockfish's **shape**: an alpha-beta **search backbone** + a **fitted/learned
evaluation**. No policy/MCTS net — AlphaZero-style learning is rejected at our scales (see
issue #25: per-level policy training is dominated by tuned-eval + search, with no reusable
cross-board knowledge and no knobs).

**But the data economics are inverted from Stockfish's, and that inversion — not the
algorithm — is the binding constraint:**

| | Stockfish | Us |
|---|---|---|
| Problems | **one** game | **many** boards, each its own problem |
| Data per problem | oceans (billions of positions) | a **puddle** (small, short games) |

Consequences that drive every choice below:

- The eval must be **low-capacity** (few parameters) for most boards, or there isn't enough
  data to fit it without overfitting noise.
- A board **earns** expressiveness only when it can **generate the data to fit it**.
  Right-sizing is *forced by data*, not just taste.

---

## 3. Two axes the "ladder" conflates

The rung-1..5 ladder mashes two independent axes together. Keeping them separate is what
makes the path clear:

- **Training method** — *how you get the numbers:* authored → SPSA → **Texel** → TDLeaf.
- **Eval expressiveness** — *how much the eval can say:* one value per piece type →
  **piece-square tables** (value depends on *where*) → **NNUE** (nonlinear interactions).

The per-board goal ("units have unique value/importance per board") lives on the
**expressiveness** axis **plus fitting per board**. **TDLeaf (rung 3) is only a different
way to fit the same ~14 numbers** — it buys *no* extra per-board expressiveness, is noisier,
and is the hardest to *watch*. So it is **off the critical path** (an optional RL learning
detour), and we do **not** "skip to rung 3."

---

## 4. What already exists (reuse, do not rebuild)

- **Rung 1 — authored search + eval** (`frontend/src/core/ai.ts`): iterative-deepening
  alpha-beta over the pure rules engine, **quiescence search** at the leaf, objective-aware
  evaluation. Deterministic (node-bounded). The eval is a **flat 14-number vector**:
  6 piece values (pawn/knight/bishop/rook/queen/king) + 8 objective/safety terms
  (`hangingUndefended`, `hangingDefended`, `advance`, `guard`, `reachProgress`,
  `reachGarrison`, `surviveUrgency`, `surviveClock`). Rocks pinned to 0.
- **Self-play substrate** (`frontend/src/game/selfplay.ts`): plays a level headless with the
  search AI on both sides; every game is a full `GameRecord` (moves + winner + seed);
  `replayStates` rebuilds **every board position** from it. Pure/deterministic.
- **The Training Gym** (`/game-lab` + gym UI, `frontend/src/game/tuning.ts`,
  `frontend/src/lab/*`): **SPSA** eval tuning, honest match scoring, **SPRT** validation,
  opening books, **decisive / UHO books**, train/holdout split, headless cluster training.
- **Delivery pipeline** (`frontend/src/game/adoptedWeights.ts`, `net/aiWeights.ts`): a tuned
  vector can be **adopted per-level** (personal) or **shipped per-level** (admin →
  everyone), resolved by the live enemy AI before each reply, with `DEFAULT_EVAL_WEIGHTS`
  fallback. **Adopt-to-live is already wired.**

**The gap (the whole reason for this plan):** every path above reduces a self-play game to a
**scalar** (win/draw/loss → match score). SPSA is a *black-box optimizer* — it never looks
inside a game. The **position corpus is generated and discarded** (retained only, and
ephemerally, for the inspection replay UI). **Nothing consumes position-level data as
training data.** That is the "we get data from lots of runs but do nothing with it."

---

## 5. The delivery path (phases)

**Phase 1 — Texel-fit the existing eval, per board (USE THE DATA).**
Take the self-play games we already generate. Extract quiet positions (post-quiescence),
label each with its game's final result `z ∈ {1, ½, 0}`, and fit the weights θ to minimize
`Σ (z − σ(K·eval_θ(pos)))²` (logistic regression; σ = sigmoid, K = scaling constant). The
eval is **linear in the weights**, so the gradient is cheap and the fit converges fast.
Output shape is identical to SPSA's (a readable weight vector) → drops straight into the
existing adopt/ship pipeline. This is the direct fix to "we don't use the data."

**Phase 2 — Piece-square tables (PST), same fitter.**
Make value **position-dependent**: a per-(piece-type, square) value, still linear, still
Texel-fit — just more numbers, and only on boards with enough data to earn them. This is the
step that literally makes "importance depends on board features" true.

**Phase 3 — Right-size gate (runs alongside 1–2).**
Measure each board: does search alone already play it well? → ship **bare search, no eval**,
and prove it. Values only, or values + PST? The gate decides **per board** and **shows the
verdict**. This is the owner's "don't over-build Level 1" instinct, made explicit and
visible.

**Phase 4 — NNUE (reserved).**
A small learned eval net, trained on the position corpus (labeled by result + deep eval —
Stockfish's recipe), still **inside search**. Reserved for the giant boards (≈20×20,
~40 units/side) where handcrafted + PST caps out and there is finally enough data. **Not
before.**

**Optional detour — TDLeaf(λ) / TD-learning.** Real RL, watchable in the Gym, valuable as a
hands-on learning project — but **off the delivery path** (see §3).

---

## 6. Data / corpus (why draws are not a blocker)

- **Source:** self-play (both sides search), **quiet** positions (post-quiescence), each
  labeled with its game's result `{win 1, draw ½, loss 0}`.
- **Draws are usable signal.** A ½ label says "this position is balanced." Texel fits `{1,
  ½, 0}` natively. The **only** degenerate case is **zero outcome variance** (literally every
  game draws).
- **The fix is imbalanced opening books — already built.** This is exactly what Stockfish /
  Fishtest did: as engines drew more, they moved to **UHO (Unbalanced Human Openings)**
  books so games come out decisive. A tilted start → decisive result → more signal per game.
  Prefer imbalanced **openings** (decisive *from the position*, clean labels) over a
  deliberately **weakened AI** (decisive *from blunders*, noisier labels). Both work.
- **Label-split readout.** The first thing every fit shows is the corpus win/draw/loss split,
  live. If too drawish, turn up the opening imbalance. It is a **readout, not a gate**.
- **Bonus — draws are evidence for per-board values.** A drawn game where a side was up a
  bishop is *direct evidence the bishop does not convert on this board*. That ½ label is
  literally the data teaching "a boxed bishop here is worth less than 3."

---

## 7. The inspection workflow (three lenses — all extend the Gym)

Everything below extends the **Training Gym's existing game-inspection / replay board**
(reuse; no bespoke tools):

- **Lens 1 — "How does it value pieces?"** The **derived piece-value table**, fitted vs.
  authored side-by-side, plus the corpus label split. The first artifact of the loop.
- **Lens 2 — "Does it think this move/position is better?"** A **per-move eval breakdown**
  on the replay board: at any decision, every legal move annotated with the derived score
  *and* a term-by-term breakdown (material vs. safety vs. objective-pull) — the *why*, not
  just the *which*.
- **Lens 3 — "Does it find key positions?"** A **critical-position finder** layered on top:
  scan the board's self-play/reachable positions for where the derived eval **swings
  hardest** or where one move is **decisively best** ("only-move" moments); surface them as a
  gallery opened on the real board. (The weight vector has no opinion about "key positions";
  this lens *extracts* them by querying eval + search — the honest way to answer it.)

---

## 8. First slice — the practice sandbox: Break the Line

- **Board:** `off-l-break-line` (campaign `off-c-crown-valoria`). **3 wide × 8 deep**,
  grassland, **no gameplay terrain** (the "central road" is decorative).
- **Objective:** `rival-kings` (both sides have a king; race to capture the other's).
- **Roster:** Player (marching north) = **King + 3 pawns**; Enemy (marching south) =
  **King + bishop + 1 pawn**. 7 units total.
- **Live eval terms for `rival-kings`:** piece values (pawn / bishop / king),
  `hangingUndefended`, and `advance` (march-toward-enemy-king pull). `guard`, `reach*`,
  `survive*` are inert here → the meaningful surface is **~4–5 numbers**. Legible.
- **Hypothesis to watch:** a **bishop boxed on a 3-wide board** (its diagonals die at the
  walls) likely **prices below the chess "3"** — the first concrete instance of "a unit's
  value depends on the board's features."
- **Why it's a good sandbox, not a trivial one:** small enough to eyeball, but `rival-kings`
  is *not* solved by shallow search (kings are hard to corner in a narrow corridor — an
  earlier probe drew out at depth 3, converted better deeper), so the derived eval genuinely
  changes play. The owner will see the eval *do work*.
- **Deliverable:** Texel fit on this board, in the Gym → **Lens 1** (piece-value table +
  label split) as the first visible artifact. Then Lens 2, then Lens 3.
- **The honest first lesson:** watch the label split. If self-play is too drawish, apply an
  imbalanced/UHO start (§6). Whether the board can even produce a learnable signal *is* the
  first real step of the workflow.

---

## 9. Right-sizing & definition of "done"

- **The feature** = a per-board pipeline (fit → validate → adopt/ship) + a **right-size
  gate** + the **inspection tools**, applied across the official levels.
- **"This board needs only search" is an acceptable — even desired — per-board result.** The
  tools *show* that verdict rather than forcing every board to carry an eval it doesn't need.
- **Default posture:** each board is fit **independently** (its own eval), matching "lessons
  don't transfer." Right-sizing handles data-starved tiny boards by **not fitting them**
  (bare search), so the cold-start problem never bites.
- **Done** = each targeted official level either ships tuned per-board weights (through the
  existing adopt/ship pipeline) **or** is proven to need none, and the owner can **watch and
  poke** the derivation for any board.

---

## 10. Named techniques + primary sources (the learning syllabus)

- **Texel's Tuning Method** — Chess Programming Wiki; Peter Österlund (~2014, CCC thread).
- **Unbalanced opening books / UHO** — Fishtest practice; signal-per-game vs. draw rate.
- **SPSA** (Simultaneous Perturbation Stochastic Approximation) — Spall; Stockfish Fishtest.
- **Piece-square tables (PST)** — Chess Programming Wiki.
- **NNUE** (Efficiently Updatable Neural Network) — Chess Programming Wiki; Stockfish.
- **TD / TDLeaf(λ)** — Sutton (TD); Tesauro, TD-Gammon (1995); Baxter/Tridgell/Weaver,
  KnightCap/TDLeaf (1999).

---

## 11. One decision still owner's to confirm

- **Scope of "complete":** which boards define the finished feature? Working default =
  **Crown of Valoria's official levels first**, then extend to the rest. (Break the Line is
  the practice slice regardless.)

---

## Appendix — key files

| Area | File |
|---|---|
| Search + eval (rung 1) | `frontend/src/core/ai.ts` |
| Self-play substrate | `frontend/src/game/selfplay.ts` |
| SPSA / match scoring / weight encode-decode | `frontend/src/game/tuning.ts` |
| Gym step / runner | `frontend/src/lab/*` |
| Live weight resolution (adopt/ship) | `frontend/src/game/adoptedWeights.ts`, `frontend/src/net/aiWeights.ts` |
| Gym UI | `frontend/src/ui/GameLab.tsx` (+ gym components) |
| **New (Phase 1):** Texel fitter | _to add, e.g._ `frontend/src/game/texel.ts` |
