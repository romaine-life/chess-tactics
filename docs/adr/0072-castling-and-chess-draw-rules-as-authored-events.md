---
status: "accepted"
date: 2026-07-08
deciders: Nelson
---

# ADR-0072: Castling and the chess draw rules are authored level events

## Context and Problem Statement

The game is being lined up as an AI-training substrate with chess as the control group: the
rules on the chess board must match chess EXACTLY, or rule divergence contaminates the
piece-value signal the training is supposed to measure. Full chess parity is six items —
castling, en passant, promotion with underpromotion choice, stalemate = draw, threefold
repetition, and the 50-move rule. Three already existed engine-wide (en passant from
`lastMove`, promotion with the full four-piece picker, stalemate as a draw in
`terminalIfStuck` and its mirrors). This ADR adds the other three.

None of the three can be globally hard-coded. Boards here are arbitrary (1×1..48×48, authored
positions, terrain, fences, multiple kings), so chess castling squares cannot be inferred from
geometry at play time. And an always-on 50-move/threefold rule would corrupt existing modes —
on a survive level, holding position for 50 quiet moves is the WINNING strategy, not a draw.

## Decision

All three are **authored, per-level, through the events editor's "Other events" tab**, riding
the existing `LevelEvent` model with a `setup` trigger (like spawn): configuration installed
once at build, resolved into GameState fields the way promotion events already resolve into
`promotionRules`.

### Castling (`castle` event action, one per king-rook pair)

- Action data: `{ kind: 'castle', side, king, rook, kingTo, rookTo }` — explicit squares
  (`core/level.ts`), owner's model: "if king on this square and rook on this square, and
  neither has moved, allow castle." Resolved by `castleRulesForLevel` (`core/levelEvents.ts`)
  into `GameState.castleRules`, threaded to move generation via `MoveEnv.castleRules`
  (sourced in `rules.gameEnv`, so every consumer — store, premoves, self-play, AI — gets it;
  the AI's cached env in `core/ai.ts` mirrors it explicitly).
- The **Castling template** (`ui/castlingTemplate.ts` + `addCastlingTemplate` in
  `LevelEditor.tsx`) scans the painted board and appends one named event per pair with
  chess-standard geometry: shared rank/file, distance ≥ 3, king slides two toward the rook,
  rook lands on the crossed square. Distance 3 names "kingside", 4 "queenside".
- Play-time legality is chess-exact in `rules.castleMoves`: both pieces alive, on their
  authored squares, `hasMoved` false on both (a NEW per-piece flag set by `applyMove` —
  history-exact, unlike the positional `startX/startY` proxy); every square strictly between
  them empty; destinations clear; king not in check, crossing no attacked square (landing
  safety comes from the standard king filter via `boardAfterMove`, which mirrors the rook
  hop); and both pieces' straight-line travel respects terrain/water/fences like any slide.
- Encoding: a castle is ONE `Move` — the king's two-square destination plus
  `castle: { rookId, rookTo }`. `applyMove` relocates both pieces in one action (one turn
  flip — netplay parity, tick seeding, and round detection all assume one action per move)
  and emits `moved` for both plus a `castled` event for the log. Because the destination is
  unique, every destination-keyed consumer works UNCHANGED: click/drag input, premoves, the
  netplay relay (`{pieceId, x, y}` on the wire, re-derived by `legalMoves` on each board —
  zero wire/backend change), replay, and search. The mouse gesture is simply the king's
  two-square move-dot.

### Chess draws (`chess-draws` event action)

- Action data: `{ kind: 'chess-draws', fiftyMove?, threefold? }`, resolved by
  `drawRulesForLevel` into `GameState.drawRules`. The **Chess draws template** adds one
  event with both flags on; the detail pane exposes two toggles.
- **50-move rule**: `GameState.halfmoveClock`, maintained inside `applyMove` (reset on
  capture or pawn move, else +1). Because `applyMove` is the single apply path, the clock is
  correct in live play, netplay, persistence, self-play, replay, and INSIDE search nodes for
  free.
- **Threefold repetition**: `GameState.positionCounts`, a `positionKey → count` table
  maintained by `rules.recordPosition` at COMMITTED-move sites only (store's
  `commitPlayerMove`/`commitNet`, `resolveEnemyReply`, self-play loop + book plies +
  `replayStates`, and the initial position in `createFromLevel`). It is deliberately NOT
  maintained in `applyMove`: search calls `applyMove` at up to 200k nodes per decision, and
  an immutable table copy per node is real cost, while a shared untouched reference is free.
  The table resets whenever the clock resets (earlier positions can never recur), so it stays
  small and persists cheaply.
- `positionKey` is FIDE-9.2 exact: combat-piece placement + side to move + per-rule castle
  rights (both pieces unmoved on their squares) + the en-passant square ONLY when a capture
  is actually legal (pins included, via `legalMoves`). Neutral rocks never move and are
  omitted.
- Draw resolution: `rules.ruleDraw` — threefold at count ≥ 3 (key computed only past clock 8,
  the provable minimum), 50-move at clock ≥ 100 **unless the position is checkmate** (FIDE:
  mate on the clock-filling move wins; the check is self-contained so call sites need no
  ordering discipline). Consumed by the store's `terminalIfStuck` (now returning a
  `kind: checkmate | stalemate | fifty-move | threefold`, feeding log copy + `resultDetail`;
  the result surfaces say "Draw" with the specific reason), by the self-play loop, and by
  `negamax` — which also tracks repetition along its own search path (`SearchState.path`,
  push/pop per node) on top of the committed counts, so the engine steers into or away from
  draws instead of stumbling into them, which is exactly what the control group needs.

### Validation

Frontend `validateLevel` checks castle squares are integer, on-board, on one shared rank/file,
with a real king displacement; `chess-draws` flags must be booleans; both require the `setup`
trigger. The backend workspace PUT mirrors the new action kinds structurally
(`validateWorkspaceCastleAction` / `validateWorkspaceChessDrawsAction` in `backend/server.js`)
— without the mirror, saving any workspace containing the new events would be rejected
server-side. Playability gates are untouched: an unmet castle rule is simply inert.

## Consequences

- Levels without the new events are byte-identical in behavior and serialized state
  (all new GameState fields are optional; `recordPosition` no-ops without threefold).
- Old saved matches resume fine: missing `hasMoved`/clock/table default safely (and no old
  save can carry castle rules, so no rights can be wrongly granted).
- Trainer ply budgets matter: Gym SPSA runs cap at ~70–80 plies, BELOW the 100-halfmove
  threshold — at those budgets the 50-move rule can't fire and the ply-cap draw still
  adjudicates. Full-length self-play (300) and live games exercise it.
- The netplay determinism suite asserts the full new state (rights, clock, table) stays
  byte-identical across the relay; a castle travels as its plain destination.
- `quiesce` needs no draw logic: its entry node is draw-checked by `negamax`, and every
  q-move is a capture, which resets the clock and can never repeat a position.
