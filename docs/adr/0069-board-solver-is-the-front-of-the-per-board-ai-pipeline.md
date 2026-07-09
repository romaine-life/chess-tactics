# 0069 — Board solving is the front of the per-board AI pipeline (bounded, anytime, cluster-backed, with an interactive stepper)

_Status: Accepted (design). Author: agent, for the owner. Written 2026-07-05 as provisional 0068; renumbered to 0069 on 2026-07-08 after origin/main's 0068 (link-copy controls) merged first. Companion to [docs/per-board-ai-plan.md](../per-board-ai-plan.md)._

## Context

The per-board AI plan (per-board-ai-plan.md) tried to learn per-board piece values from self-play outcomes, and stalled on the sandbox board (`off-l-break-line`): equal-strength self-play drew 100% of games, so outcome-labeled fitting collapsed. We chased fixes that **changed the environment** (promotion, decisive boards, asymmetric strength) — the wrong instinct for the owner's goal, which is to *solve the environment as given* and learn from doing so.

Two facts reframed the work:

1. **Every board here is a finite, deterministic, perfect-information, zero-sum game, so by Zermelo's theorem it has a definite value under perfect play** (a forced win for one side, or a draw). "What happens with perfect play" is a *fact we can compute*, not an opinion.
2. **We never established that fact for any board.** We called Break the Line "solved by search" without proof; the evidence (a depth-8 search beats a depth-2 one only 2 games in 12, and the owner beats the live AI) is consistent with *either* a forced draw *or* winnable-but-search-insufficient. We do not know which.

This matters because the whole reason a *learned value function* is interesting (and the reason chess is interesting) is that chess's game tree (~10¹²⁰) **cannot be exhausted** — search is fundamentally insufficient, so you are *forced* to evaluate positions you can't see to the end of. The dividing line between a **toy** (solvable exactly → optimal play is a lookup, no value function needed) and a **chess-like problem** (must approximate) is precisely **whether the game tree is small enough to reach optimal play**. So the principled first question for *any* board is: **can we solve it exactly, and if not, how far can we get?** Chess AI is literally built this way — strongly-solved endgame *tablebases* for what's small enough, a learned value function only for the part too big to solve.

The owner also set a hard orientation: **the deliverable is a tool he runs himself** (when out of tokens, on a new board), not a task I perform for him. It must be async on the existing on-demand cluster, bounded (not a 24-hour runaway), give a **feasibility read up front**, let him **click play, watch it work, and wait**, and **produce value even if it doesn't finish**. And it must match how he does "algorithm stepping" (the `bender-world` and `eight-queens` visualizers).

## Decision

**Build a board solver as the front stage of the per-board AI pipeline.** Given any board it (a) estimates feasibility, (b) runs a **bounded, anytime** solve — exact when the board is small enough, best-effort otherwise — and (c) reports the proven game value, a partial/complete tablebase, and (once solved) honest piece values. It is a self-service tool with two faces sharing one pure engine core:

- an **interactive stepper** (browser, `bender-world`/`eight-queens` idiom) for watching the solving algorithm think, phase by phase, on small boards — the learning surface;
- a **cluster-backed bounded run** (reusing the `train-runs` Job lifecycle) for real boards — launch → watch live → keep partial results.

### 1. What "solved" means, and which algorithm (the honest three levels)

Standard terminology, used precisely (owner learns by named concepts):
- **Ultra-weak** — know the start's value (win/draw), not how to achieve it.
- **Weak** — know the value *and* a strategy from the start. (Checkers was weakly solved in 2007 — Schaeffer et al., *Science* — it's a **draw**.)
- **Strong** — know the perfect value of *every* position: a **tablebase**.

The solver picks its method from the feasibility read:

- **Small board → retrograde analysis (strong solve / full tablebase).** Backward induction from terminal positions (king captured = decided), propagating values by the minimax rule (a position is a win if *some* move forces an opponent-loss; a loss if *every* move allows an opponent-win; else drawn/undecided). This yields the perfect value of every position → optimal play everywhere → **honest piece values by ablation against ground truth** (remove a piece, does the perfect-play value change, and by how many win-distance plies). **Loopy-game wrinkle:** this game has **no repetition or 50-move rule** (verified: `core/rules.ts`/`objectives.ts`/`selfplay.ts` have none), so positions can cycle and "draw" means "neither side can force a king-capture in finite moves." Retrograde handles this with **win-distance** ("mate-in-N") labels — exactly how chess DTM tablebases treat it — rather than an artificial ply cap becoming part of the state.
- **Too big to enumerate → iterative-deepening alpha-beta + transposition table + cycle detection**, as an **anytime weak-solver from the start**. Iterative deepening gives progressively deeper *proven* results; the TT accumulates solved positions; a proven mate returns a definite result, otherwise a tightening value bound. **Proof-Number Search (PN/PN²)** is the specialist upgrade when we need to prove a stubborn win/loss faster (its proof/disproof numbers double as a live "how close to a proof" progress signal).
- **Instant read (always, first) → a fast random-playout / shallow-MCTS pass** for a "looks like a draw / looks winning" estimate in seconds. Not a proof — the up-front sense while the real solve spins up.

### 2. Feasibility preview (instant, before you commit)

Before any heavy work, compute cheaply and show:
- **reachable state-space upper bound** (combinatorial: piece types × squares, discounting illegal/duplicate/pawn-rank constraints, ×2 for side-to-move, × promotion expansion),
- **root + sampled branching factor**,
- **estimated memory** for a full tablebase (states × bytes/entry) vs. the Job's memory limit,
- a **verdict**: `solvable-exactly (secs/mins) · hard (weak-solve, bounded) · infeasible (heuristic territory)` + a rough ETA.

This is the number that answers last turn's toy-vs-chess question *by computation, not assertion*, and tells the owner whether to click play and with what budget. (It is also the natural gate for the whole per-board pipeline: solvable → no learned eval needed; infeasible → this is where a value function earns its keep.)

### 3. Anytime + partial value (yes, value even if it doesn't finish)

The solve is anytime by construction. At **any** stop (budget hit, memory cap, manual cancel) the run yields:
- every position it **proved** won/lost/drawn — a **partial tablebase**,
- **tightening upper/lower bounds** on the root value,
- the **strongest line found so far**, immediately usable as a strong player for this board,
- coverage stats (states seen / estimated total).

Iterative deepening + the accumulating TT is what makes an early stop useful rather than wasted.

### 4. Bounding (configurable, never a runaway)

Every run carries hard caps: **wall-clock**, **nodes/states**, and **memory**. Defaults are sane; the owner dials the time up when he feels like it. The cluster Job also has `activeDeadlineSeconds` as a backstop. The solver checks budgets on a fixed cadence and exits cleanly with its partial result persisted.

### 5. Async on the existing cluster (reuse `train-runs`, do not reinvent)

Mirror the trainer's Job lifecycle exactly (see the map below), as a sibling `solve-runs` surface:
- **`POST /api/solve-runs`** `{ spec: SolveSpec }` → `{ id, status }`; inserts a DB row and spawns a k8s Job (`createSolverJob(runId)`, cloned from `backend/train/k8s.mjs`) running `node backend/solve-worker.mjs` on the `trainer` node pool.
- **worker** loads the spec, runs the bounded anytime solve from the shared engine bundle, and **streams progress by patching the DB row** (`UPDATE solve_runs SET body = body || patch::jsonb`) on a cadence — `{ phase, statesEnumerated, statesSolved, proven:{win,loss,draw}, rootBounds, coverage, secs }`.
- **`GET /api/solve-runs/:id`** returns `{ status, body }`; the UI polls every ~6s (the `ClusterRuns` pattern).
- **`DELETE`** cancels (delete Job + keep the partial body).
- **Large artifacts:** progress + value + summary live in the JSONB `body`; a full tablebase, if big, is written to blob storage and referenced by URL (not stuffed in the row). Feasibility caps the tablebase to the Job memory limit before it starts.
- **v1 runs the solver single-process in one Job** (bounded). Distributing the search/retrograde across the cluster is a later optimization, explicitly out of scope for v1.

### 6. The engine core (shared, pure, deterministic)

One pure module — `frontend/src/core/solver/` (no DOM, no React) — is the single source of truth, consumed both by the browser stepper and, via the engine bundle (`vite.trainer.config.js` graph, exported alongside the trainer engine), by `solve-worker.mjs`. It builds on the existing pure rules engine (`core/rules.ts`: `legalMoves`/`applyMove`/`attackedSquares`) and objective/terminal logic (`core/objectives.ts`), so the solver plays by *exactly* the live game's rules. It exposes:
- `estimateFeasibility(level) → FeasibilityReport` (§2),
- `runSolve(level, bounds, onProgress) → SolveResult` (§1/§3/§4) — the bounded anytime solve,
- `solveStepWithPhases(...)` — the **phase-decomposed** step for the interactive stepper (§7).

### 7. The interactive stepper (the `bender-world`/`eight-queens` idiom)

Faithful to the owner's established pattern (pure `engine/` + coarse step + **named-phase micro-step** + buffer + animation-clock + hook + PhaseBar + per-phase panels + HelpBar/glossary + Config presets + deterministic replay/undo). The solver's algorithm decomposes into watchable **phases** so you can see it *think*:

- **Retrograde mode phases:** `Enumerate` (reachable positions) → `Seed terminals` (label king-captured positions) → `Propagate` (one backward-induction sweep: which positions flip to win/loss this pass) → `Converge` (repeat until fixpoint) → `Read value` (root + piece-value ablation). The board view highlights the frontier of newly-solved positions each Propagate sweep — the visible "solving spreads outward from the terminals" animation.
- **Search mode phases:** the alpha-beta decision at a node — `Generate` → `Order` → `Descend` (recurse) → `Quiesce` → `Back up` (α/β update, cutoff) — with the current line, bounds, and TT hits shown, mirroring bender's Perceive→Decide→Act→Reward→Learn panels.

Small boards run the stepper fully in-browser (buffered, like the references). For a big cluster run, the stepper **replays the recorded phase trace** the worker emits (same viewer, fed from persisted steps) so the watch experience is identical whether local or clustered.

UI shell (reused, not reinvented — ADR-0059): a Studio/Gym-adjacent route with tabs **Feasibility/Config** (plug in a board, see §2, set bounds, Play) · **Granular Step** (the star — phase-by-phase) · **Run** (launch/watch the cluster solve, live progress, partial results) · **Results** (proven value, partial tablebase, piece values) · **Glossary**. Controls: Play/Pause/Step/Step-N/Back/speed. Deterministic replay throughout.

## Consequences

- **The toy-vs-chess question gets a computed answer per board** (feasibility verdict + whether the solve completes), instead of my assertions. If Break the Line solves exactly, it is a toy in a different class than chess, and we learn that as fact; if it doesn't, it's chess-like and a legitimate value-function testbed.
- **Piece values become honestly defined** for any solved board (ablation against perfect play), fixing the problem the plan stalled on — measured against *perfect* play instead of weak, drawing play.
- **The per-board pipeline gains a principled front gate:** solve what's small enough (no learned eval needed); learn only what's too big, anchored on the solved parts — the chess architecture.
- **The owner can run it without me:** plug in a board, read feasibility, set a budget, click play, watch, keep partial results.
- **New surfaces to build:** `core/solver/*`, `backend/solve-worker.mjs` + `backend/solve/k8s.mjs`, `/api/solve-runs` (+ `solve_runs` table), `net/solveRuns.ts`, and the stepper UI. Reuse maximized against `train-runs` and the two visualizer patterns.
- **Cost/limits:** exact solving is memory-bound; the feasibility gate must refuse boards whose tablebase exceeds the Job memory limit and fall back to weak-solve. v1 is single-process per Job.

## Alternatives considered

- **Pure heuristic search, skip solving.** Rejected as the *front*: it can't tell you the ground truth, can't say whether a board even needs a value function, and can't define honest piece values. Search is the *fallback within* the solver for boards too big to strong-solve.
- **Pure MCTS / learned policy.** Gives a fast estimate (kept as the instant read) but proves nothing and needs the environment-changing tricks we're moving away from.
- **Impose a repetition/50-move rule to make the game finite.** A real option for *game design* (ADR-worthy separately — endless shuffles are a design smell), but the solver should compute the *true* loopy-game value via win-distance rather than depend on an artificial cap. Noted, not adopted here.

## Build phases (each independently shippable)

1. **`core/solver` engine + feasibility estimator + retrograde solver** with unit tests on tiny hand-checkable boards (e.g. K+P vs K), plus a Break-the-Line feasibility number.
2. **Interactive stepper** (retrograde phases first) on a Studio route — the learning surface, in-browser, `eight-queens` idiom.
3. **Cluster `solve-runs`** (worker + k8s + API + client + Run tab), bounded/anytime, streaming progress — clone of `train-runs`.
4. **Search mode** (iterative-deepening αβ+TT+cycle detection; PN search optional) for boards too big to strong-solve, same stepper phases.

## Appendix — reused surfaces (verified)

**Cluster (`train-runs`) to clone:** `backend/server.js` (`/api/train-runs` handlers, `dbInsertTrainRun`/`dbSetTrainRunJob`/`dbGetTrainRun`), `backend/train/k8s.mjs` (`createTrainerJob`/`deleteTrainerJob`; Job = `node backend/train-worker.mjs`, node pool `workload=trainer`, 6–8 CPU / 3–6Gi, `ttlSecondsAfterFinished:3600`, `activeDeadlineSeconds:10800`), `backend/train-worker.mjs` (spec-from-env, body-patch progress, `process.exit`), `backend/train/db.mjs` (`getTrainerPool`), `frontend/vite.trainer.config.js` (pure engine bundle `src/trainer/engine.ts → trainer-bundle/engine.mjs`), `frontend/src/net/trainRuns.ts`, `frontend/src/ui/ClusterRuns.tsx` (launch + poll-6s + open-detail).

**Stepper idiom (`bender-world` @ `D:\repos\bender-world`, `eight-queens` @ `D:\repos\eight-queens`) to mirror:** `engine/algorithm-runner.ts` (coarse `runStep()` + `runStepWithPhases()`), `engine/*-buffer.ts` (async producer buffer), `engine/animation-clock.ts` (rAF fractional playhead, sweep on step), `hooks/use-buffered-algorithm.ts` (refs for high-freq, React state on boundary, undo/redo via lightweight seeded snapshots), `components/{Controls,PhaseBar,TabBar,HelpBar,HelpGlossary,ConfigPanel,GettingStartedTab}.tsx`, per-phase panels, inline `colors.ts` styling. Philosophy: educational, transparent at every granularity, deterministic replay.
