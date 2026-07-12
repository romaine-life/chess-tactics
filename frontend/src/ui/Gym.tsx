// Training Gym — a Studio catalog category (ADR-0058): pick a level, and tune the
// AI's eval weights on it with SPSA, stepping at your own pace. Board-grounded,
// with the convergence curve and champion weights around it. Wired to the real
// deterministic engine (game/tuning.ts) via a stateful worker (lab/gymWorker.ts).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useCampaigns } from '../campaign/store';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { MODE_NAME } from '../core/objectives';
import type { Level } from '../core/level';
import { LevelThumbnail } from '../render/LevelThumbnail';
import { levelToEditorBoard, unitsForGamePieces } from '../core/levelBoard';
import { StudioReadOnlyBoard } from '../render/StudioReadOnlyBoard';
import { ViewPane } from './shared/ViewPane';
import { InfoTip } from './shared/InfoTip';
import { SliderRow, ctlReset } from './dressing/SliderRow';
import { createFromLevel } from '../game/setup';
import { PARAM_LABELS, encodeWeights, decodeWeights } from '../game/tuning';
import { replayStates, type GameRecord } from '../game/selfplay';
import { DEFAULT_EVAL_WEIGHTS } from '../core/ai';
import { stateAtPosition, type BookPosition, type OpeningBookSettings } from '../game/openingBook';
import type { GymRequest, GymResponse } from '../lab/gymWorker';
import type { StepProgress } from '../lab/gymStep';
import type { ValState } from '../lab/validate';
import type { TdProbe, TdRequest, TdResponse, TdRunConfig, TdSession } from '../lab/tdWorker';
import { freshTdSession, type TdAdoptionRecord, type TdSessionDoc } from '../lab/tdSession';
import {
  DEFAULT_PROBE_GAMES, DEFAULT_TRAIN_OPTIONS, pawnRelativeValues, previewNextGame, scheduleAt,
  type SeedSummary, type TdGameRecord, type TrainOptions, type ValueWeights,
} from '../game/tdValues';
import { sanForGame, sanFullMoves } from '../game/sanNotation';
import { PLAYABLE_PIECE_TYPES } from '../core/pieces';
import { drawRulesForLevel } from '../core/levelEvents';
import { setAdoptedWeights, readAdoptedVector, readShippedVector } from '../game/adoptedWeights';
import { ClusterRuns } from './ClusterRuns';
import {
  emptyBlob, makeNewBook, deleteBook, updateBook,
  DEFAULT_BOOK_SETTINGS, type BooksBlob, type GymSession,
} from '../lab/openingBooks';
import { loadOpeningBooks, saveOpeningBooks } from '../net/openingBooks';
import { HttpError } from '../net/http';

const GYM_CSS = `
/* Fill the stage like every other Studio viewer (ADR-0059): the board is the item,
   grown via ViewPane — never a bespoke fixed-height box. */
.gym-main { display:flex; flex-direction:column; overflow:hidden; padding:14px 16px; color:#e7ebf0; font:13px/1.45 system-ui,sans-serif; }
.gym-main h3 { font-size:13px; margin:0 0 6px; color:#93a0b0; }
.gym-head { flex:0 0 auto; }
.gym-board { flex:1 1 auto; min-height:220px; display:grid; grid-template-rows:minmax(0,1fr); border:1px solid #29323f; border-radius:8px; overflow:hidden; background:#0b1016; }
.gym-conv canvas { width:100%; height:150px; display:block; background:#0b1016; border:1px solid #29323f; border-radius:8px; }
.gym-scorebig { font:600 24px ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.gym-hint { color:#5c6875; font-size:12px; }
.gym-controls .gl-field { display:flex; flex-direction:column; gap:4px; font-size:12px; color:#93a0b0; margin-bottom:8px; }
.gym-controls input,.gym-controls select { background:#0c1116; color:#e7ebf0; border:1px solid #3a4657; border-radius:4px; padding:5px 8px; font-size:13px; }
.gym-run-row { display:flex; gap:8px; align-items:center; margin:10px 0; }
.gym-run-row .play { background:#46d6b8; color:#06231d; border-color:#46d6b8; font-weight:700; }
.gym-run-row .play.is-pause { background:#e0685f; color:#2a1113; border-color:#e0685f; }
.gym-run-row .play.is-resume { background:#e0b24a; color:#241904; border-color:#e0b24a; }
.gym-error { color:#f0a49d; font-size:12px; margin:4px 0 8px; }
.gym-step-progress { display:flex; flex-direction:column; gap:4px; margin:4px 0 8px; }
.gym-step-progress .bar { height:6px; border-radius:3px; background:#0c1116; border:1px solid #29323f; overflow:hidden; }
.gym-step-progress .bar i { display:block; height:100%; background:#46d6b8; }
.gym-step-progress .label { color:#93a0b0; font:12px ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.gym-live-games-wrap { max-height:170px; overflow:auto; border:1px solid #29323f; border-radius:6px; background:#0b1016; margin:6px 0 10px; }
.gym-live-games { width:100%; border-collapse:collapse; font:11px ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.gym-live-games th { position:sticky; top:0; background:#161d26; color:#93a0b0; text-align:left; font-weight:600; padding:5px 7px; border-bottom:1px solid #29323f; }
.gym-live-games td { padding:4px 7px; border-bottom:1px solid #141b23; color:#c6d0dc; }
.gym-live-games tr.is-current td { background:#122019; }
.gym-live-games .win { color:#5ad19a; } .gym-live-games .draw { color:#e0b24a; } .gym-live-games .loss { color:#e0685f; }
.gym-live-games-empty { text-align:center; color:#5c6875 !important; padding:12px 8px !important; }
.gym-latest-games-wrap { max-height:190px; overflow:auto; border:1px solid #29323f; border-radius:6px; background:#0b1016; margin-bottom:10px; }
.gym-latest-games { width:100%; border-collapse:collapse; font:11px ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.gym-latest-games th { position:sticky; top:0; background:#161d26; color:#93a0b0; text-align:left; font-weight:600; padding:5px 7px; border-bottom:1px solid #29323f; }
.gym-latest-games td { padding:4px 7px; border-bottom:1px solid #141b23; color:#c6d0dc; }
.gym-latest-games tr { cursor:pointer; }
.gym-latest-games tr.is-sel td { background:#212b37; color:#e7ebf0; }
.gym-latest-games tr:hover td { background:#1a222c; }
.gym-latest-games tr:focus-visible { outline:2px solid #46d6b8; outline-offset:-2px; }
.gym-latest-games .win { color:#5ad19a; } .gym-latest-games .draw { color:#e0b24a; } .gym-latest-games .loss { color:#e0685f; }
.gym-estab { display:flex; align-items:center; gap:8px; margin:4px 0 10px; }
.gym-meter { flex:1; height:6px; border-radius:3px; background:#0c1116; border:1px solid #29323f; overflow:hidden; }
.gym-meter i { display:block; height:100%; background:linear-gradient(90deg,#e0b24a,#46d6b8); }
.gym-weights { display:grid; grid-template-columns:1fr auto auto; gap:2px 10px; font:12px ui-monospace,monospace; }
.gym-weights .k { color:#93a0b0; } .gym-weights .v { text-align:right; font-variant-numeric:tabular-nums; }
.gym-weights .d { text-align:right; width:56px; } .gym-weights .d.up { color:#5ad19a; } .gym-weights .d.dn { color:#e0685f; } .gym-weights .d.z { color:#5c6875; }
.gym-num { font-family:ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.gym-modebar { display:flex; align-items:stretch; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
.gym-modebar button { border:1px solid #29323f; background:#161d26; color:#93a0b0; font:600 12px system-ui,sans-serif; cursor:pointer; }
.gym-modebar button:disabled { opacity:.45; cursor:default; }
.gym-modebar button:not(:disabled):hover { border-color:#3a4757; color:#c6d0dc; }
.gym-modebar button.active { background:#212b37; color:#e7ebf0; border-color:#3a4757; }
.gym-book-mode { min-height:40px; padding:0 14px; border-radius:7px; }
.gym-training-mode { min-height:40px; display:flex; align-items:center; gap:8px; border:1px solid #29323f; background:#12181f; border-radius:7px; padding:4px; }
.gym-training-mode.is-active { border-color:#3a4757; background:#151d26; }
.gym-training-label { padding:0 6px 0 8px; color:#7c8a9c; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; }
.gym-training-tabs { display:flex; gap:4px; }
.gym-training-tabs button { min-height:30px; min-width:72px; padding:0 12px; border-radius:5px; }
.cluster-runs { display:flex; flex-direction:column; gap:10px; }
.cluster-runs-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.cluster-runs-note { font-size:11px; color:#7c8a9c; max-width:420px; }
.cluster-runs-err { color:#e2a0a0; font-size:12px; margin:0; }
.cluster-runs-body { display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap; }
.cluster-runs-list { list-style:none; margin:0; padding:0; min-width:220px; max-height:320px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; }
.cluster-runs-empty { color:#7c8a9c; font-size:12px; padding:6px; }
.cluster-run-row { display:flex; gap:8px; align-items:center; width:100%; text-align:left; border:1px solid #29323f; background:#161d26; color:#c3ccd8; padding:6px 8px; border-radius:6px; font-size:12px; cursor:pointer; }
.cluster-run-row.active { background:#212b37; color:#e7ebf0; border-color:#3a4757; }
.cluster-run-id { font-family:monospace; color:#93a0b0; }
.cluster-run-status { margin-left:auto; text-transform:uppercase; font-size:10px; letter-spacing:.04em; }
.cluster-run-status.s-running, .cluster-run-status.s-pending { color:#d9b871; }
.cluster-run-status.s-done { color:#8fce9b; }
.cluster-run-status.s-error, .cluster-run-status.s-cancelled { color:#e2a0a0; }
.cluster-run-time { color:#6b7888; font-size:10px; }
.cluster-run-detail { flex:1; min-width:260px; border:1px solid #29323f; background:#12181f; border-radius:6px; padding:10px; min-height:120px; }
.cluster-run-detail-head { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
.cluster-run-line { font-size:12px; color:#c3ccd8; margin:4px 0; }
.gym-bookhead,.gym-pager { display:flex; align-items:center; gap:14px; margin-bottom:10px; flex-wrap:wrap; font-size:13px; }
.gym-bookhead label,.gym-pager label { display:inline-flex; align-items:center; gap:6px; color:#93a0b0; font-size:12px; }
.gym-bookhead input,.gym-pager input { width:80px; background:#0c1116; color:#e7ebf0; border:1px solid #3a4657; border-radius:4px; padding:4px 7px; font:12px ui-monospace,monospace; }
.gym-pager .gym-num { color:#46d6b8; }
/* Positions table (Stage 1 'book' mode) — a compact, scrollable list above the board. */
.gym-postable-wrap { flex:0 0 auto; max-height:40%; overflow:auto; border:1px solid #29323f; border-radius:8px; margin-bottom:10px; background:#0b1016; }
.gym-postable { width:100%; border-collapse:collapse; font:12px ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.gym-postable th { position:sticky; top:0; background:#161d26; color:#93a0b0; text-align:left; font-weight:600; padding:6px 10px; border-bottom:1px solid #29323f; font-size:11px; }
.gym-postable td { padding:5px 10px; border-bottom:1px solid #1a222c; color:#c6d0dc; vertical-align:middle; }
.gym-postable tr { cursor:pointer; }
.gym-postable tr.is-sel td { background:#212b37; color:#e7ebf0; }
.gym-postable tr:hover td { background:#1a222c; }
.gym-postable td.moves { max-width:340px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#93a0b0; }
.gym-empty-book { color:#5c6875; font-size:12px; padding:16px; text-align:center; }
/* Train-mode data surface — the "watch the numbers stream" view (fills the main pane). */
.gym-run { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; gap:10px; }
.gym-run-head { flex:0 0 auto; display:flex; align-items:center; gap:14px; flex-wrap:wrap; font-size:12px; color:#93a0b0; }
.gym-run-head b { color:#e7ebf0; }
.gym-run-state { font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#5c6875; }
.gym-run-state.live { color:#46d6b8; }
.gym-run-score { margin-left:auto; font:700 20px ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.gym-run-curve { flex:0 0 auto; width:100%; height:190px; display:block; background:#0b1016; border:1px solid #29323f; border-radius:8px; }
.gym-run-stats { flex:0 0 auto; display:flex; align-items:baseline; gap:14px; font-size:12px; color:#93a0b0; flex-wrap:wrap; }
.gym-run-stats .wdl { color:#c6d0dc; font-family:ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.gym-run-stats .wdl .w { color:#5ad19a; } .gym-run-stats .wdl .d { color:#e0b24a; } .gym-run-stats .wdl .l { color:#e0685f; }
.gym-log-wrap { flex:1 1 auto; min-height:60px; overflow:auto; border:1px solid #29323f; border-radius:8px; background:#0b1016; }
.gym-log { width:100%; border-collapse:collapse; font:12px ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.gym-log th { position:sticky; top:0; z-index:1; background:#161d26; color:#93a0b0; text-align:right; font-weight:600; padding:6px 12px; border-bottom:1px solid #29323f; font-size:11px; }
.gym-log th:first-child { text-align:left; }
.gym-log td { text-align:right; padding:4px 12px; border-bottom:1px solid #141b23; color:#c6d0dc; }
.gym-log td:first-child { text-align:left; color:#93a0b0; }
.gym-log td.dim { color:#5c6875; }
.gym-log tr.is-champ td { background:#122019; }
.gym-log tr.is-champ td:first-child { color:#e0b24a; }
.gym-log-empty { text-align:center !important; color:#5c6875; padding:18px !important; }
.gym-run-detail { flex:1 1 auto; min-height:0; display:flex; }
.gym-run-detail > * { min-width:0; }
.gym-run-detail.has-replay { display:grid; grid-template-columns:minmax(260px,.82fr) minmax(340px,1.18fr); gap:10px; }
.gym-replay-stage { min-height:0; display:flex; flex-direction:column; border:1px solid #29323f; border-radius:8px; overflow:hidden; background:#0b1016; }
.gym-replay-head { flex:0 0 auto; display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 10px; border-bottom:1px solid #29323f; color:#93a0b0; font-size:12px; }
.gym-replay-title { flex:1 1 230px; min-width:160px; display:flex; align-items:baseline; gap:8px; overflow:hidden; }
.gym-replay-head h3 { flex:0 0 auto; margin:0; color:#e7ebf0; }
.gym-replay-head .outcome.win { color:#5ad19a; } .gym-replay-head .outcome.draw { color:#e0b24a; } .gym-replay-head .outcome.loss { color:#e0685f; }
.gym-replay-controls { flex:0 0 auto; display:grid; grid-template-columns:auto minmax(80px,1fr) auto auto; gap:8px; align-items:center; padding:8px 10px; border-bottom:1px solid #141b23; }
.gym-replay-controls button { border:1px solid #3a4657; background:#161d26; color:#c6d0dc; border-radius:5px; padding:4px 8px; font-size:12px; cursor:pointer; }
.gym-replay-controls button:disabled { opacity:.45; cursor:default; }
.gym-replay-controls input { min-width:0; }
.gym-replay-controls.is-inline { flex:1 1 240px; min-width:210px; border-bottom:0; padding:0; }
.gym-replay-ply { font:12px ui-monospace,monospace; color:#93a0b0; white-space:nowrap; }
.gym-replay-move { min-width:0; color:#c6d0dc; font:11px ui-monospace,monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gym-replay-board { flex:1 1 auto; min-height:260px; display:grid; grid-template-rows:minmax(0,1fr); border-top:1px solid #141b23; }
.gym-run.is-replay-focus { gap:0; }
.gym-replay-focus-view { flex:1 1 auto; min-height:0; display:grid; grid-template-rows:minmax(0,1fr); }
.gym-replay-stage.is-focused { flex:1 1 auto; }
.gym-replay-stage.is-focused .gym-replay-head { padding:8px 12px; }
.gym-replay-stage.is-focused .gym-replay-board { min-height:0; }
.gym-replay-stage.is-focused .gym-replay-controls { grid-template-columns:auto minmax(160px,1fr) auto auto; }
.gym-replay-stage.is-focused .gym-replay-controls.is-inline { flex-basis:420px; min-width:260px; }
.gym-replay-stage.is-focused .gym-replay-title { flex-basis:320px; }
.gym-replay-stage.is-focused .gym-replay-focus-btn { margin-left:0; }
.gym-replay-focus-btn { margin-left:auto; min-width:34px; border:1px solid #3a4657; background:#161d26; color:#c6d0dc; border-radius:5px; padding:4px 8px; font-size:12px; cursor:pointer; }
.gym-replay-focus-btn:hover { border-color:#46d6b8; color:#8ff0dc; }
/* Piece-values two-pane: running numbers hug content on the left, the game stage takes
   ALL remaining space (the board was starved at the bottom of a single column). */
.gym-td-split { flex:1 1 auto; min-height:0; display:grid; grid-template-columns:minmax(0,1fr); gap:12px; }
.gym-td-split.has-stage { grid-template-columns:minmax(330px,max-content) minmax(0,1fr); }
.gym-td-left { min-width:0; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:10px; padding-right:4px; }
.gym-td-right { min-width:0; min-height:0; display:grid; grid-template-rows:minmax(0,1fr); }
/* Full chess-style navigation on the values stage (first/prev/slider/next/last). */
.gym-replay-controls.is-nav { grid-template-columns:auto auto minmax(80px,1fr) auto auto auto; }
.gym-replay-stage.is-focused .gym-replay-controls.is-nav { grid-template-columns:auto auto minmax(160px,1fr) auto auto auto; }
/* Focus mode's move list: every played ply, clickable, current highlighted. */
.gym-replay-focus-view.is-values { grid-template-columns:minmax(0,1fr) 250px; grid-template-rows:minmax(0,1fr); gap:10px; }
.gym-replay-movelist { min-height:0; overflow-y:auto; border:1px solid #29323f; border-radius:8px; background:#0b1016; padding:6px; display:flex; flex-direction:column; gap:1px; }
.gym-replay-movelist button { text-align:left; border:0; background:none; color:#93a0b0; font:12px ui-monospace,monospace; padding:3px 6px; border-radius:4px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gym-replay-movelist button:hover { background:#161d26; color:#c6d0dc; }
.gym-replay-movelist button.is-current { background:#212b37; color:#e7ebf0; }
/* Score sheet: numbered full moves, each half-move a jump target. */
.gym-score-row { display:grid; grid-template-columns:34px minmax(0,1fr) minmax(0,1fr); align-items:center; gap:2px; }
.gym-score-row .n { color:#5c6875; font:12px ui-monospace,monospace; text-align:right; padding-right:4px; }
.gym-score-row .gap { color:#5c6875; font:12px ui-monospace,monospace; padding:3px 6px; }
.gym-score-start { margin-bottom:2px; }
/* The game ledger: one row per game, newest first, scrolling in place. */
.gym-td-ledger { flex:0 0 auto; display:flex; flex-direction:column; gap:4px; }
.gym-td-ledger-wrap { max-height:220px; overflow-y:auto; }
.gym-td-ledger td.w { color:#5ad19a; } .gym-td-ledger td.d { color:#e0b24a; } .gym-td-ledger td.l { color:#e0685f; }
.gym-td-ledger td.delta { text-align:right; white-space:nowrap; }
.gym-td-ledger td.delta.up { color:#5ad19a; } .gym-td-ledger td.delta.dn { color:#e0685f; } .gym-td-ledger td.delta.z { color:#5c6875; }
/* Adopt + live-AI audit blocks. */
.gym-td-adopt, .gym-td-liveai { flex:0 0 auto; display:flex; flex-direction:column; gap:6px; }
.gym-td-liveai { border-top:1px solid #29323f; padding-top:10px; }
.gym-td-liveai-tier { margin:0; font-size:12px; color:#93a0b0; }
.gym-td-liveai-tier b { color:#8ff0dc; }
.gym-td-liveai-vals { margin:0; font:12px ui-monospace,monospace; color:#e7ebf0; }
.gym-td-liveai-vals.dim { color:#5c6875; }
/* Probe history: the learning curve as running numbers. */
.gym-td-probelog { display:flex; flex-direction:column; gap:4px; font-size:11px; color:#93a0b0; }
.gym-td-probelog .h { color:#5c6875; }
.gym-td-probelog .rows { display:flex; flex-wrap:wrap; gap:4px 14px; max-height:66px; overflow-y:auto; font-family:ui-monospace,monospace; }
/* The pane's documentation view. */
.gym-td-help { flex:1 1 auto; min-height:0; overflow-y:auto; max-width:88ch; color:#c6d0dc; font-size:13px; line-height:1.55; padding-right:8px; }
.gym-td-help-head { display:flex; align-items:center; gap:12px; }
.gym-td-help-head h3 { flex:1 1 auto; margin:0; }
.gym-td-help h4 { margin:16px 0 4px; color:#93a0b0; font-size:13px; }
.gym-td-help p { margin:4px 0; }
.gym-td-help ul { margin:4px 0; padding-left:20px; }
.gym-td-help li { margin:3px 0; }
.gym-td-help b { color:#e7ebf0; }
.gym-td-help-keys b { font-family:ui-monospace,monospace; background:#161d26; border:1px solid #29323f; border-radius:4px; padding:1px 5px; }
/* Watch tempo. */
.gym-td-speed { display:flex; align-items:center; gap:8px; font-size:12px; color:#93a0b0; margin-top:2px; }
.gym-td-speed input[type=range] { flex:1 1 auto; min-width:0; }
.gym-td-speed .gym-num { min-width:34px; text-align:right; }
/* The stage's own throttle — the same knob as the rail's, mirrored. */
.gym-replay-tempo { display:flex; align-items:center; gap:6px; font-size:11px; color:#93a0b0; }
.gym-replay-tempo input[type=range] { width:90px; min-width:0; }
.gym-replay-tempo .gym-num { min-width:32px; text-align:right; }
/* Label-toggling buttons hold a FIXED width so ▶/⏸ swaps never shift their neighbours.
   The watch button needs the extra selector weight to beat the rail's
   .tileset-control-stack button { min-width:0 }. */
.gym-replay-playout-btn { width:90px; text-align:center; }
.gym-controls .gym-run-row .gym-td-watch-btn { min-width:96px; text-align:center; }
/* Transport buttons NEVER shrink or letter-wrap (the control stack's
   overflow-wrap:anywhere would sliver them one character per line when squeezed);
   when the row is tight, whole buttons flow to the next line instead. The compound
   selector outweighs .tileset-control-stack button. */
.gym-run-row { flex-wrap:wrap; row-gap:8px; }
.tileset-view-controls.gym-controls .gym-run-row button { flex:0 0 auto; white-space:nowrap; overflow-wrap:normal; }
@media (max-width:1180px) { .gym-td-split.has-stage { grid-template-columns:minmax(0,1fr); grid-template-rows:auto minmax(320px,1fr); } }
@media (max-width:980px) {
  .gym-run-detail.has-replay { grid-template-columns:1fr; grid-template-rows:minmax(180px,.45fr) minmax(300px,1fr); }
  .gym-replay-controls { grid-template-columns:auto minmax(80px,1fr) auto; }
  .gym-replay-ply { grid-column:1 / -1; }
}
/* Book-management block in the rail. */
.gym-bookmgr { display:flex; flex-direction:column; gap:8px; margin-bottom:6px; padding-bottom:10px; border-bottom:1px solid #29323f; }
.gym-bookmgr select { background:#0c1116; color:#e7ebf0; border:1px solid #3a4657; border-radius:4px; padding:6px 8px; font-size:13px; }
.gym-bookmgr-btns { display:flex; gap:8px; }
.gym-bookmgr-btns button { flex:1; border:1px solid #3a4657; background:#161d26; color:#c6d0dc; border-radius:6px; padding:6px 8px; font-size:12px; cursor:pointer; }
.gym-bookmgr-btns button.new { border-color:#46d6b8; color:#8ff0dc; }
.gym-bookmgr-btns button.del:not(:disabled):hover { border-color:#e0685f; color:#f0a49d; }
.gym-bookmgr-btns button:disabled { opacity:.45; cursor:default; }
.gym-gen { display:flex; flex-direction:column; gap:2px; margin:6px 0; }
.gym-gen .gl-field { margin-bottom:6px; }
/* The variety SliderRow shares the number fields' full width; let its slider shrink so
   the row (incl. the ↺) stops at the same right edge instead of overflowing the rail. */
.gym-gen .tileset-catalog-zoom .pages-ctl-row { min-width:0; max-width:100%; }
.gym-gen .tileset-catalog-zoom .pages-ctl-row input[type=range] { min-width:0; }
.gym-gen-btn { border:1px solid #46d6b8; background:#46d6b8; color:#06231d; font-weight:700; border-radius:6px; padding:7px 10px; font-size:13px; cursor:pointer; }
.gym-gen-btn:disabled { opacity:.5; cursor:default; }
.gym-count { color:#93a0b0; font-size:12px; }
/* SPRT validation panel — the "watch it decide" surface (Train mode, main pane). */
.gym-val { flex:0 0 auto; display:flex; flex-direction:column; gap:10px; padding:12px 14px; margin-bottom:10px; border:1px solid #29323f; border-radius:8px; background:#0b1016; }
.gym-val-head { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; font-size:12px; color:#93a0b0; }
.gym-val-head b { color:#e7ebf0; }
.gym-val-title { font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:#c6d0dc; }
.gym-val-stats { display:flex; align-items:baseline; gap:16px; flex-wrap:wrap; font:12px ui-monospace,monospace; font-variant-numeric:tabular-nums; color:#93a0b0; }
.gym-val-stats b { color:#e7ebf0; }
.gym-val-stats .wdl .w { color:#5ad19a; } .gym-val-stats .wdl .d { color:#e0b24a; } .gym-val-stats .wdl .l { color:#e0685f; }
/* LLR bar: reject bound (left) → accept bound (right), with the live LLR marker. */
.gym-val-bar-wrap { display:flex; flex-direction:column; gap:4px; }
.gym-val-bar-labels { display:flex; justify-content:space-between; font:11px ui-monospace,monospace; color:#5c6875; }
.gym-val-bar-labels .rej { color:#e0685f; } .gym-val-bar-labels .acc { color:#5ad19a; }
.gym-val-bar { position:relative; height:14px; border-radius:7px; background:linear-gradient(90deg,#2a1618,#161d26 42% 58%,#132018); border:1px solid #29323f; overflow:hidden; }
.gym-val-bar .zero { position:absolute; top:0; bottom:0; width:1px; background:rgba(147,160,176,.5); }
.gym-val-bar .fill { position:absolute; top:0; bottom:0; left:50%; background:rgba(70,214,184,.22); }
.gym-val-bar .fill.neg { background:rgba(224,104,95,.22); }
.gym-val-bar .marker { position:absolute; top:-2px; bottom:-2px; width:3px; border-radius:2px; background:#e7ebf0; box-shadow:0 0 4px rgba(0,0,0,.6); transform:translateX(-50%); }
.gym-val-verdict { font:700 18px ui-monospace,monospace; letter-spacing:.06em; text-align:center; padding:8px; border-radius:6px; }
.gym-val-verdict.accept { color:#0a2a1f; background:#46d6b8; }
.gym-val-verdict.reject { color:#2a1113; background:#e0685f; }
.gym-val-verdict.running { color:#93a0b0; background:#141b23; border:1px solid #29323f; font-size:13px; letter-spacing:.04em; }
.gym-val-adopt { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.gym-val-adopt button.adopt { border:1px solid #46d6b8; background:#46d6b8; color:#06231d; font-weight:700; border-radius:6px; padding:7px 12px; font-size:13px; cursor:pointer; }
.gym-val-adopt .adopted { color:#8ff0dc; font-size:12px; }
/* Adopt status in the rail. */
.gym-adopt-row { display:flex; align-items:center; gap:8px; margin:2px 0 8px; font-size:12px; }
.gym-adopt-row .badge { border-radius:4px; padding:2px 7px; font:600 11px ui-monospace,monospace; }
.gym-adopt-row .badge.on { color:#0a2a1f; background:#46d6b8; }
.gym-adopt-row .badge.off { color:#93a0b0; background:#161d26; border:1px solid #29323f; }
.gym-adopt-row button { border:1px solid #3a4657; background:#161d26; color:#c6d0dc; border-radius:5px; padding:3px 9px; font-size:12px; cursor:pointer; }
.gym-adopt-row button:hover { border-color:#e0685f; color:#f0a49d; }
.gym-val-btn { border:1px solid #e0b24a; background:#1c1a12; color:#f0d488; font-weight:700; border-radius:6px; padding:7px 10px; font-size:13px; cursor:pointer; width:100%; margin-top:6px; }
.gym-val-btn:disabled { opacity:.45; cursor:default; }
/* TD piece-value learner (the values mode). NEW rules — typography via the --ds tokens
   (ADR-0024; the solver UI was audit-flagged for raw font literals, don't repeat it). */
.gym-td-knobs { border:0; margin:0; padding:0; min-width:0; display:flex; flex-direction:column; gap:2px; }
.gym-td-knobs:disabled { opacity:.55; }
.gym-td-knobs .tileset-catalog-zoom .pages-ctl-row { min-width:0; max-width:100%; }
.gym-td-knobs .tileset-catalog-zoom .pages-ctl-row input[type=range] { min-width:0; }
.gym-td-stepn-input { width:76px; background:#0c1116; color:#e7ebf0; border:1px solid #3a4657; border-radius:4px; padding:5px 8px; font-family:var(--ds-font-mono); font-size:var(--ds-text-xs); font-variant-numeric:tabular-nums; }
.gym-td-warn { flex:0 0 auto; margin:0; padding:8px 10px; border:1px solid #5a4a22; border-radius:6px; background:#1c1a12; color:#f0d488; font-family:var(--ds-font-sans); font-size:var(--ds-text-xs); line-height:1.5; max-width:78ch; }
.gym-td-weights { margin-top:2px; grid-template-columns:max-content auto auto auto; width:fit-content; column-gap:22px; font-family:var(--ds-font-mono); font-size:var(--ds-text-xs); }
.gym-td-weights .h { color:#5c6875; font-size:var(--ds-text-2xs); text-transform:uppercase; letter-spacing:var(--ds-tracking-tight); }
.gym-td-weights .d { width:auto; min-width:70px; }
.gym-td-weights .v.na { color:#5c6875; }
.gym-td-table tr.na td { color:#5c6875; }
.gym-td-results { flex:0 0 auto; display:flex; flex-direction:column; gap:8px; }
/* Reading-width cap: on wide monitors a full-pane table strands the numbers a
   screen away from their labels — hug content instead (same fix as the live grid). */
.gym-td-table-wrap { overflow:auto; border:1px solid #29323f; border-radius:8px; background:#0b1016; width:fit-content; max-width:100%; }
.gym-td-table { width:100%; border-collapse:collapse; font-family:var(--ds-font-mono); font-size:var(--ds-text-xs); font-variant-numeric:tabular-nums; }
.gym-td-table th { position:sticky; top:0; background:#161d26; color:#93a0b0; text-align:right; font-weight:600; padding:6px 12px; border-bottom:1px solid #29323f; font-size:var(--ds-text-2xs); }
.gym-td-table th:first-child, .gym-td-table td:first-child { text-align:left; }
.gym-td-table td { text-align:right; padding:5px 12px; border-bottom:1px solid #141b23; color:#c6d0dc; }
.gym-td-keep { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.gym-td-keep .keep { border:1px solid #46d6b8; background:#46d6b8; color:#06231d; font-weight:700; border-radius:6px; padding:7px 12px; font-size:var(--ds-text-xs); cursor:pointer; }
.gym-td-keep .discard { border:1px solid #3a4657; background:#161d26; color:#c6d0dc; border-radius:6px; padding:7px 12px; font-size:var(--ds-text-xs); cursor:pointer; }
`;

/** Catalog grid — the levels you can train on, with board thumbnails. */
export function GymCatalog({ search, selected, onSelect }: { search: string; selected?: string; onSelect: (id: string) => void }): ReactElement {
  const campaigns = useCampaigns((s) => s.campaigns);
  const workspaceLevels = useCampaigns((s) => s.levels);
  useEffect(() => { void ensureCampaignsHydrated(); }, []);
  const q = search.trim().toLowerCase();
  const levels = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; label: string; sub: string; level: Level }> = [];
    for (const c of campaigns) for (const ref of c.levels) {
      const lvl = workspaceLevels[ref.levelId];
      if (!lvl || seen.has(lvl.id)) continue;
      seen.add(lvl.id);
      out.push({ id: lvl.id, label: lvl.name, sub: `${c.name} · ${MODE_NAME[lvl.objective]}`, level: lvl });
    }
    for (const lvl of Object.values(workspaceLevels)) {
      if (seen.has(lvl.id)) continue;
      out.push({ id: lvl.id, label: lvl.name, sub: MODE_NAME[lvl.objective], level: lvl });
    }
    return out.filter((o) => !q || `${o.label} ${o.sub}`.toLowerCase().includes(q));
  }, [campaigns, workspaceLevels, q]);

  return (
    <div className="tileset-studio-grid pages-grid" aria-label="Gym levels">
      {levels.map((o) => (
        <button key={o.id} type="button" className={`tileset-studio-card ${o.id === selected ? 'is-selected' : ''}`.trim()}
          onClick={() => onSelect(o.id)} aria-pressed={o.id === selected} title={`${o.label} — ${o.sub}`}>
          <span className="tileset-studio-card-image pages-card-image"><LevelThumbnail level={o.level} width={132} height={88} alt="" /></span>
          <span className="tileset-studio-card-meta"><span className="tileset-studio-card-text"><strong>{o.label}</strong><em>{o.sub}</em></span></span>
        </button>
      ))}
      {levels.length === 0 ? <p className="tileset-studio-empty">No level matches.</p> : null}
    </div>
  );
}

const REF_VEC = encodeWeights(DEFAULT_EVAL_WEIGHTS);

// --- TD piece-value learner (the `values` mode) ------------------------------------
/** Every knob the learner exposes — complete vs TrainOptions (games, seed, λ, ε/α
 * schedules, ply cap, initial weight, update rule, probe cadence) plus the seed fold.
 * Defaults derive from the ENGINE's exported baseline (ADR-0057 — never hand-copied). */
interface TdKnobs {
  games: number;
  seed: number;
  seedCount: number;
  lambda: number;
  epsStart: number;
  epsEnd: number;
  alphaStart: number;
  alphaEnd: number;
  maxPlies: number;
  initialWeight: number;
  monteCarlo: boolean;
  probeEvery: number;
  probeGames: number;
}
const TD_KNOB_DEFAULTS: TdKnobs = {
  games: 600, seed: 1, seedCount: 3,
  lambda: DEFAULT_TRAIN_OPTIONS.lambda,
  epsStart: DEFAULT_TRAIN_OPTIONS.epsilon.start, epsEnd: DEFAULT_TRAIN_OPTIONS.epsilon.end,
  alphaStart: DEFAULT_TRAIN_OPTIONS.alpha.start, alphaEnd: DEFAULT_TRAIN_OPTIONS.alpha.end,
  maxPlies: DEFAULT_TRAIN_OPTIONS.maxPlies, initialWeight: DEFAULT_TRAIN_OPTIONS.initialWeight,
  monteCarlo: false, probeEvery: 25, probeGames: DEFAULT_PROBE_GAMES,
};
const tdOptionsOf = (k: TdKnobs): TrainOptions => ({
  games: k.games, seed: k.seed, maxPlies: k.maxPlies, lambda: k.lambda,
  alpha: { start: k.alphaStart, end: k.alphaEnd },
  epsilon: { start: k.epsStart, end: k.epsEnd },
  initialWeight: k.initialWeight, monteCarlo: k.monteCarlo,
  probeEvery: k.probeEvery, probeGames: k.probeGames,
});
/** tdOptionsOf's inverse — a restored session document carries its exact schedule. */
const tdKnobsOfDoc = (opts: TrainOptions, seedCount: number): TdKnobs => ({
  games: opts.games, seed: opts.seed,
  seedCount: Number.isInteger(seedCount) && seedCount >= 1 ? seedCount : TD_KNOB_DEFAULTS.seedCount,
  lambda: opts.lambda ?? TD_KNOB_DEFAULTS.lambda,
  epsStart: opts.epsilon?.start ?? TD_KNOB_DEFAULTS.epsStart, epsEnd: opts.epsilon?.end ?? TD_KNOB_DEFAULTS.epsEnd,
  alphaStart: opts.alpha?.start ?? TD_KNOB_DEFAULTS.alphaStart, alphaEnd: opts.alpha?.end ?? TD_KNOB_DEFAULTS.alphaEnd,
  maxPlies: opts.maxPlies ?? TD_KNOB_DEFAULTS.maxPlies, initialWeight: opts.initialWeight ?? TD_KNOB_DEFAULTS.initialWeight,
  monteCarlo: opts.monteCarlo === true,
  probeEvery: opts.probeEvery ?? TD_KNOB_DEFAULTS.probeEvery, probeGames: opts.probeGames ?? TD_KNOB_DEFAULTS.probeGames,
});

/** Per-type `next − prev` — the live table's Δ column (running NUMBERS, the SPSA
 * rail's ▲/▼ idiom — not a chart). */
function tdWeightsDelta(next: ValueWeights, prev: ValueWeights): ValueWeights {
  const out = {} as ValueWeights;
  for (const t of PLAYABLE_PIECE_TYPES) out[t] = next[t] - prev[t];
  return out;
}

/** Δ-cell formatting: single-game TD moves are ~1e-4..1e-3, far below the weight
 * column's 3-decimal quantum, so the Δ column carries 4 decimals of its own. */
function tdDeltaCell(d: number | undefined): { cls: string; txt: string } {
  if (d === undefined || Math.abs(d) < 5e-5) return { cls: 'z', txt: '—' };
  return { cls: d > 0 ? 'up' : 'dn', txt: `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(4)}` };
}

/** Piece type read from a stable piece id ("player-knight-2" -> "knight"). Falls
 * back to the raw id so a promoted/oddly-named piece still renders something. */
function pieceLabel(pieceId: string): string {
  const parts = pieceId.split('-');
  return parts.length >= 3 ? parts[1] : pieceId;
}

/** Compact one-line move summary, e.g. "pawn (3,10)->(3,8), knight (1,11)->(2,9)". */
function movesLabel(moves: BookPosition['moves']): string {
  if (moves.length === 0) return '(start — no plies)';
  return moves.map((m) => `${pieceLabel(m.pieceId)} (${m.from.x},${m.from.y})->(${m.move.x},${m.move.y})`).join(', ');
}

// Watch-tempo mapping — log scale from 1 step/second down to a step every frame
// ("Max"), eight-queens' slider idiom.
const TD_BEAT_MAX_MS = 1000;
const TD_BEAT_MIN_MS = 16;
const tdBeatToSlider = (ms: number): number =>
  Math.round(100 * Math.log(ms / TD_BEAT_MAX_MS) / Math.log(TD_BEAT_MIN_MS / TD_BEAT_MAX_MS));
const tdSliderToBeat = (v: number): number =>
  Math.round(TD_BEAT_MAX_MS * Math.pow(TD_BEAT_MIN_MS / TD_BEAT_MAX_MS, v / 100));
const tdBeatReadout = (ms: number): string =>
  ms <= TD_BEAT_MIN_MS ? 'Max' : `${(1000 / ms).toFixed(1000 / ms < 10 ? 1 : 0)}/s`;

function gameMoveLabel(record: Pick<GameRecord, 'moves'>, index: number): string {
  const m = record.moves[index];
  if (!m) return 'Book position';
  const capture = m.move.capture ? ` x${m.move.capture}` : '';
  return `${index + 1}. ${pieceLabel(m.pieceId)} (${m.from.x},${m.from.y})->(${m.move.x},${m.move.y})${capture}`;
}

/** The gym bench for one level: opening-book management + inspection (Stage 1) and
 * retained-session SPSA training over the active book (Stage 2). Each book keeps its
 * own training session, so switching books restores champion + curve exactly. */

/** The Gym's open surface. URL-addressable via the `gymtab=` param (only non-default
 * values ride the URL) so a deep link can land INSIDE a mode — e.g. Piece values. */
export type GymMode = 'book' | 'train' | 'cluster' | 'values';

export function GymViewer({ levelId, header, initialMode }: { levelId?: string; header?: ReactNode; initialMode?: GymMode }): ReactElement {
  const workspaceLevels = useCampaigns((s) => s.levels);
  useEffect(() => { void ensureCampaignsHydrated(); }, []);
  const level = levelId ? workspaceLevels[levelId] : undefined;

  // Per-level book store (account-scoped, backend-persisted). blob + activeId are
  // the source of truth; positions and each book's training session live inside the
  // blob. Loaded async from /api/opening-books; starts empty until it resolves.
  const [blob, setBlob] = useState<BooksBlob>(() => emptyBlob());
  const [activeId, setActiveId] = useState<number | undefined>(undefined);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [mode, setMode] = useState<GymMode>(initialMode ?? 'book');
  // The per-level reset effect below stomps mode to 'book' on its first run (mount).
  // A deep-linked mode (`gymtab=`) must survive exactly that first reset — consumed
  // once here, so switching levels later still lands on the Gym's default.
  const deepLinkModeRef = useRef<GymMode | undefined>(initialMode);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedLatestGameIndex, setSelectedLatestGameIndex] = useState(0);
  const [latestReplayPly, setLatestReplayPly] = useState(0);
  const [replayFocus, setReplayFocus] = useState(false);
  // Depth 4 by default — depth 2 is a toy (the owner knows it). Honestly slower, but
  // the games are real enough to actually separate two weight sets.
  const [depth, setDepth] = useState(4);
  const [viewZoom, setViewZoom] = useState(0.72);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [gymError, setGymError] = useState<string | null>(null);
  const [stepProgress, setStepProgress] = useState<StepProgress | null>(null);
  const [stepProgressGames, setStepProgressGames] = useState<StepProgress[]>([]);
  const [stepPaused, setStepPaused] = useState(false);
  // SPRT validation of the champion vs the shipped reference. `val` streams in
  // game-by-game from the worker; `validating` gates the button while it runs.
  const [val, setVal] = useState<ValState | null>(null);
  const [validating, setValidating] = useState(false);
  // The vector currently adopted for this level's LIVE enemy AI (null = shipped
  // defaults). Read from the local cache so the button reflects reality on mount.
  const [adoptedVec, setAdoptedVec] = useState<number[] | null>(null);
  const [runMs, setRunMs] = useState(0);           // elapsed of the CURRENT run (header telemetry)
  const runStartRef = useRef({ ms: 0, step: 0 });  // when/where the current run began
  const workerRef = useRef<Worker | null>(null);
  const playingRef = useRef(false);
  const resumePlayingRef = useRef(false);
  // The auto-run loop calls the LATEST stepOnce through this ref, so the worker's
  // long-lived onmessage never fires a stale (ready=false) closure.
  const stepOnceRef = useRef<() => void>(() => {});

  const activeBook = useMemo(() => blob.books.find((b) => b.id === activeId), [blob, activeId]);

  // Latest blob/activeId in refs so the async worker callbacks (step results, the
  // auto-run loop) always read/write the freshest state, not a stale closure.
  const blobRef = useRef(blob); blobRef.current = blob;
  const activeIdRef = useRef(activeId); activeIdRef.current = activeId;

  // Persist + set state together — every meaningful change goes through here. The
  // save is fire-and-forget (never blocks the UI); a signed-out/failed save is
  // swallowed after logging, matching Game Lab's saved-runs behavior.
  const commit = useCallback((next: BooksBlob) => {
    blobRef.current = next;
    setBlob(next);
    if (levelId) {
      void saveOpeningBooks(levelId, next).catch((error) => {
        if (error instanceof HttpError && error.status === 401) setSignedIn(false);
        else console.warn('opening-books save failed', error);
      });
    }
  }, [levelId]);

  // When the level changes, load its books async and reset selection/session view.
  // Race-guard: a load result is ignored if the level changed before it resolved.
  useEffect(() => {
    playingRef.current = false; setPlaying(false);
    setGymError(null);
    setStepProgress(null);
    setStepProgressGames([]);
    setStepPaused(false);
    const empty = emptyBlob();
    blobRef.current = empty;
    setBlob(empty);
    setActiveId(undefined);
    setSelectedIndex(0);
    setSelectedLatestGameIndex(0);
    setLatestReplayPly(0);
    setMode(deepLinkModeRef.current ?? 'book');
    deepLinkModeRef.current = undefined;
    tdDocRef.current = null;
    if (!levelId) { setLoadingBooks(false); setAdoptedVec(null); return undefined; }
    // Reflect the local cache immediately (the live AI's synchronous source); the
    // account blob below can overwrite it once it resolves.
    setAdoptedVec(readAdoptedVector(levelId));
    let cancelled = false;
    setLoadingBooks(true);
    loadOpeningBooks(levelId)
      .then((loaded) => {
        if (cancelled) return;
        setSignedIn(true);
        blobRef.current = loaded;
        setBlob(loaded);
        setActiveId(loaded.books[0]?.id);
        // The account blob is the durable adopt truth: mirror it into the local cache
        // the live AI reads, so a fresh device picks up an adoption made elsewhere.
        if (loaded.adoptedWeights) {
          setAdoptedWeights(levelId, loaded.adoptedWeights);
          setAdoptedVec(loaded.adoptedWeights);
        }
        // Restore the Piece-values session document — the run continues exactly where
        // it stood (its OPTS restore with it: a session is a position inside a fixed
        // schedule, so the knobs must be the ones it was trained under). The doc also
        // parks in a ref: the TD worker-init effect keys on the LEVEL object, which
        // often resolves after this blob, and its reset would wipe the restore — it
        // re-applies from the ref instead.
        const doc = loaded.tdSession;
        if (doc && doc.session?.train && doc.opts && typeof doc.opts.games === 'number') {
          tdDocRef.current = doc;
          tdApplyDoc(doc);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof HttpError && error.status === 401) setSignedIn(false);
        else console.warn('opening-books load failed', error);
        // Leave the empty blob in place; the user can still work locally.
      })
      .finally(() => { if (!cancelled) setLoadingBooks(false); });
    return () => { cancelled = true; };
  }, [levelId]);

  // (Re)create the worker whenever the level or the search depth changes. The worker
  // is a PURE stepper — books/sessions travel in messages — so it never re-inits on a
  // book switch or a training step.
  useEffect(() => {
    if (!level) { setReady(false); return undefined; }
    playingRef.current = false; setPlaying(false); setReady(false); setGenerating(false); setBusy(false);
    setGymError(null);
    setStepProgress(null);
    setStepProgressGames([]);
    setStepPaused(false);
    setVal(null); setValidating(false);
    const worker = new Worker(new URL('../lab/gymWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<GymResponse>) => {
      const msg = event.data;
      if (msg.type === 'ready') {
        setReady(true);
      } else if (msg.type === 'book') {
        setGymError(null);
        setStepProgress(null);
        setStepProgressGames([]);
        setStepPaused(false);
        setGenerating(false);
        // Store the freshly generated positions on the active book (session unchanged
        // — regenerating positions doesn't reset training unless the user makes a new
        // book). Reset the inspected index into range.
        const id = activeIdRef.current;
        const cur = blobRef.current.books.find((b) => b.id === id);
        if (cur) commit(updateBook(blobRef.current, { ...cur, positions: msg.positions }));
        setSelectedIndex(0);
      } else if (msg.type === 'progress') {
        setRunMs(performance.now() - runStartRef.current.ms);
        setGymError(null);
        setStepProgress(msg.progress);
        setStepProgressGames((games) => [...games, msg.progress]);
      } else if (msg.type === 'point') {
        setRunMs(performance.now() - runStartRef.current.ms);
        setGymError(null);
        setStepProgress(null);
        setStepPaused(false);
        setBusy(false);
        // Write the updated session back onto the active book and persist.
        const id = activeIdRef.current;
        const cur = blobRef.current.books.find((b) => b.id === id);
        if (cur) commit(updateBook(blobRef.current, { ...cur, session: msg.session }));
        if (playingRef.current) setTimeout(() => stepOnceRef.current(), 20);
      } else if (msg.type === 'valpoint') {
        // One game of the streaming SPRT landed: show it. The worker keeps posting
        // until state.done, then stops on its own — so `done` flips the button back on.
        setVal(msg.state);
        if (msg.state.done) setValidating(false);
      } else {
        setRunMs(performance.now() - runStartRef.current.ms);
        setGymError(msg.message);
        setStepProgress(null);
        setStepPaused(false);
        setBusy(false); setGenerating(false); playingRef.current = false; setPlaying(false); setValidating(false);
      }
    };
    const init: GymRequest = {
      type: 'init', level,
      match: { search: { maxDepth: depth, maxNodes: 2500 }, maxPlies: 80 },
    };
    worker.postMessage(init);
    return () => { worker.terminate(); workerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, depth]);

  // --- TD piece-value learner (`values` mode) --------------------------------
  // Owner grammar: STEP (one game) / STEP N / RUN to the budget / STOP / RESET.
  // Running NUMBERS only — no charts (a chart is added when the owner asks).
  const [tdReady, setTdReady] = useState(false);
  const [tdKnobs, setTdKnobs] = useState<TdKnobs>(TD_KNOB_DEFAULTS);
  const [tdStepN, setTdStepN] = useState(25);
  // Deal-then-walk (the owner's tempo): STEP deals the next game at its start position
  // WITHOUT learning from it; he walks it forward ply by ply and the TD update lands
  // when the game concludes (exactly where episodic TD(λ) commits). `tdPending` is the
  // dealt game; `tdFrontier` is how many plies of it have been PLAYED (the walk's
  // forward edge — review behind it is free, scrubbing ahead of it is not a thing).
  const [tdPending, setTdPending] = useState<TdGameRecord | null>(null);
  const [tdFrontier, setTdFrontier] = useState(0);
  // Ply cursor into the inspected game (the pending walk, or the last committed game).
  const [tdReplayPly, setTdReplayPly] = useState(0);
  // WATCH mode: an autoplay clock presses the universal advance one beat at a time.
  const [tdWatching, setTdWatching] = useState(false);
  // Every probe the run has taken, in order — the learning curve as running numbers.
  const [tdProbeLog, setTdProbeLog] = useState<TdProbe[]>([]);
  // The pane's own documentation ("how this works") as a full-pane view.
  const [tdHelp, setTdHelp] = useState(false);
  // Watch tempo — the delay between beats, on a log scale down to one beat per frame.
  const [tdBeatMs, setTdBeatMs] = useState(250);
  // Watch scope: 'run' keeps dealing new games; 'game' (the stage's ▶ play out) stops
  // when THIS game concludes so the finished game can be inspected in place.
  const tdWatchScopeRef = useRef<'run' | 'game'>('run');
  const [tdSession, setTdSession] = useState<TdSession | null>(null);
  const [tdBusy, setTdBusy] = useState(false);
  const [tdSummarizing, setTdSummarizing] = useState<{ done: number; total: number } | null>(null);
  const [tdSummary, setTdSummary] = useState<SeedSummary | null>(null);
  const [tdKept, setTdKept] = useState(false);
  // The owner clicked Discard on a completed run's table (vs never-folded / fold
  // stopped) — the rail hint must name the true cause, not claim a stop (ADR-0071).
  const [tdDiscarded, setTdDiscarded] = useState(false);
  const [tdStopped, setTdStopped] = useState(false);
  const [tdError, setTdError] = useState<string | null>(null);
  // Δ since the last DISPLAYED update, per type — what the owner's step just moved.
  // Computed in the message handler against the previously shown weights (during a
  // long RUN progress frames are throttled, so Δ spans the games since the last frame).
  const [tdDelta, setTdDelta] = useState<ValueWeights | null>(null);
  const tdShownRef = useRef<{ game: number; weights: ValueWeights } | null>(null);
  const tdWorkerRef = useRef<Worker | null>(null);
  // Freshest session for the send handlers (the ref pattern the SPSA wiring uses).
  const tdSessionRef = useRef<TdSession | null>(tdSession); tdSessionRef.current = tdSession;
  // The level's restored/last-saved session document. The books load and the worker
  // init race (blob vs level fetch); whichever runs last re-applies from here.
  const tdDocRef = useRef<TdSessionDoc | null>(null);
  const tdApplyDoc = useCallback((doc: TdSessionDoc) => {
    setTdKnobs(tdKnobsOfDoc(doc.opts, doc.seedCount));
    setTdSession(doc.session);
    setTdProbeLog(Array.isArray(doc.probeLog) ? doc.probeLog : []);
    setTdSummary(doc.summary ?? null);
    setTdKept(doc.kept === true);
    tdShownRef.current = { game: doc.session.train.game, weights: doc.session.train.weights };
  }, []);

  // RESET: back to a fresh session derived from the engine baseline (ADR-0057) — the
  // weights return to the all-equal start and the knobs unfreeze. Knob VALUES are kept
  // here (every knob carries its own per-control ↺, and "↺ settings" restores them all).
  const tdReset = useCallback(() => {
    setTdSession(null); setTdSummary(null); setTdKept(false); setTdDiscarded(false);
    setTdStopped(false); setTdError(null); setTdSummarizing(null); setTdBusy(false);
    setTdDelta(null); tdShownRef.current = null; setTdReplayPly(0);
    // A dealt-but-unfinished game is DISCARDED, never learned from — the same game
    // re-deals identically later ((seed, gameIndex) rng), so nothing is lost or skipped.
    setTdPending(null); setTdFrontier(0); setTdWatching(false); setTdProbeLog([]);
  }, []);

  // The learner's OWN worker — never gymWorker (that one is shared by generate/step/
  // validate and re-inits on `depth`, which would kill a TD run mid-flight). Keyed on
  // the level ONLY; the session travels in every message (pure-stepper contract), so
  // nothing else can restart it. Level change ⇒ terminate + full state reset.
  useEffect(() => {
    setTdReady(false);
    tdReset();
    // Re-apply the level's saved session if the books blob restored it first — this
    // effect keys on the LEVEL object, which usually resolves after the blob, and the
    // reset above would otherwise wipe the restore.
    if (tdDocRef.current) tdApplyDoc(tdDocRef.current);
    if (!level) return undefined;
    const worker = new Worker(new URL('../lab/tdWorker.ts', import.meta.url), { type: 'module' });
    tdWorkerRef.current = worker;
    // Δ bookkeeping: compare against the last weights the table SHOWED, but only when
    // new games actually ran (`done` re-posts the final progress session — comparing
    // that to itself would wipe the last real Δ with zeros).
    const applyTdSession = (session: TdSession): void => {
      const shown = tdShownRef.current;
      if (shown && session.train.game > shown.game) setTdDelta(tdWeightsDelta(session.train.weights, shown.weights));
      if (!shown || session.train.game > shown.game) tdShownRef.current = { game: session.train.game, weights: session.train.weights };
      // Accumulate every distinct probe — the learning curve as running numbers.
      const probe = session.probe;
      if (probe) setTdProbeLog((log) => (log.length && log[log.length - 1].game === probe.game ? log : [...log, probe]));
      setTdSession(session);
    };
    worker.onmessage = (event: MessageEvent<TdResponse>) => {
      const msg = event.data;
      if (msg.type === 'ready') {
        setTdReady(true);
      } else if (msg.type === 'progress') {
        applyTdSession(msg.session);
      } else if (msg.type === 'summary-progress') {
        setTdSummarizing({ done: msg.seedsDone, total: msg.seedsTotal });
      } else if (msg.type === 'done') {
        applyTdSession(msg.session);
        setTdBusy(false);
        setTdSummarizing(null);
        setTdStopped(msg.stopped);
        if (msg.summary) { setTdSummary(msg.summary); setTdKept(false); setTdDiscarded(false); }
      } else {
        setTdError(msg.message);
        setTdBusy(false);
        setTdSummarizing(null);
      }
    };
    worker.postMessage({ type: 'init', level } as TdRequest);
    return () => { worker.terminate(); tdWorkerRef.current = null; };
  }, [level, tdReset]);

  const setTdKnob = useCallback((patch: Partial<TdKnobs>) => setTdKnobs((k) => ({ ...k, ...patch })), []);

  // STEP / STEP N / RUN all send the CURRENT session (or a fresh one) with the fixed
  // per-run options; the worker loops internally and streams running numbers back.
  const tdSend = useCallback((n: number | 'run') => {
    const worker = tdWorkerRef.current;
    if (!worker || tdBusy) return;
    setTdError(null); setTdStopped(false); setTdBusy(true);
    const cfg: TdRunConfig = { opts: tdOptionsOf(tdKnobs), seedCount: tdKnobs.seedCount };
    const session = tdSessionRef.current ?? freshTdSession(cfg.opts);
    // A run starting from scratch shows Δ against the all-equal start.
    if (!tdShownRef.current) tdShownRef.current = { game: session.train.game, weights: session.train.weights };
    worker.postMessage((n === 'run'
      ? { type: 'run', cfg, session }
      : { type: 'step', cfg, session, n }) as TdRequest);
  }, [tdBusy, tdKnobs]);
  const tdStop = useCallback(() => { tdWorkerRef.current?.postMessage({ type: 'stop' } as TdRequest); }, []);

  // Derived running numbers. A null session displays as the fresh all-equal start.
  const tdOpts = useMemo(() => tdOptionsOf(tdKnobs), [tdKnobs]);
  const tdFresh = useMemo(() => freshTdSession(tdOpts), [tdOpts]);
  const tdSess = tdSession ?? tdFresh;
  const tdGamesDone = tdSess.train.game;
  const tdComplete = tdGamesDone >= tdKnobs.games;
  const tdStarted = tdGamesDone > 0;
  const tdSchedule = useMemo(() => scheduleAt(tdOpts, tdGamesDone), [tdOpts, tdGamesDone]);
  // pawn = 1 display only when the BOARD fields pawns — on a pawnless board the pawn
  // weight never moves off its start, and dividing by that would be noise. Read from
  // the DEALT start state (the exact thing every training game plays): createFromLevel
  // realises authored units AND setup spawn-event rosters (incl. legacy random
  // placement), where layers.units alone would miss roster-dealt pawns. The per-type
  // deal count is seed-independent (canonical type order over deterministic zone
  // capacity), so the master deal answers for every training game's deal.
  const tdHasPawns = useMemo(
    () => !!level && createFromLevel(level, tdKnobs.seed).pieces
      .some((p) => p.type === 'pawn' && (p.side === 'player' || p.side === 'enemy')),
    [level, tdKnobs.seed],
  );
  const tdRel = useMemo(() => (tdHasPawns ? pawnRelativeValues(tdSess.train.weights) : null), [tdHasPawns, tdSess]);
  const tdSummaryRel = useMemo(() => (tdHasPawns && tdSummary ? pawnRelativeValues(tdSummary.mean) : null), [tdHasPawns, tdSummary]);
  // A weight still EXACTLY at its initial value has received no learning signal (the
  // type was never fielded, or its counts never went unbalanced) — mark it so the
  // tables can't be misread as "the learner concluded this piece is near-worthless".
  const tdUntouched = useCallback(
    (w: number) => w === tdKnobs.initialWeight,
    [tdKnobs.initialWeight],
  );
  // Honest-fidelity banner: the learner's 1-ply policy cannot SEE authored chess draws
  // coming (they are scored only after a move commits) — drawRulesForLevel is the
  // canonical chess-draws scan (never the solver's castle-inclusive hidden-ledger one).
  const tdDrawsAuthored = useMemo(() => (level ? drawRulesForLevel(level) !== undefined : false), [level]);
  // A dealt game freezes the knobs too: the commit must replay the SAME game the deal
  // previewed, and the game derives from (seed, budget-schedule, weights) — changing a
  // knob mid-walk would silently make the walked game and the learned game differ.
  const tdKnobsFrozen = tdStarted || tdBusy || tdSummary !== null || tdPending !== null;

  // --- The session as a web-backed document -----------------------------------
  // Every meaningful change autosaves into the level's account blob via the same
  // commit path the opening books use; the load effect above restores it. The save
  // is a TRAILING DEBOUNCE — event-driven, nothing polls: each change arms a
  // one-shot timer and cancels the previous, so a run's ~10 progress frames/second
  // coalesce into one whole-blob PUT instead of hundreds. The debounce tail is
  // covered by a pagehide flush below, so closing the tab mid-window loses nothing.
  const tdKnobsRef = useRef(tdKnobs); tdKnobsRef.current = tdKnobs;
  const tdFlushRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!levelId || !tdSession) { tdFlushRef.current = null; return undefined; }
    const buildDoc = (): TdSessionDoc => {
      const prior = blobRef.current.tdSession;
      return {
        opts: tdOptionsOf(tdKnobsRef.current), seedCount: tdKnobsRef.current.seedCount,
        session: tdSession, probeLog: tdProbeLog, summary: tdSummary, kept: tdKept,
        ...(prior?.adoption ? { adoption: prior.adoption } : {}),
      };
    };
    const id = setTimeout(() => {
      tdFlushRef.current = null;
      const doc = buildDoc();
      tdDocRef.current = doc;
      commit({ ...blobRef.current, tdSession: doc });
    }, 1200);
    // The pending save, flushable NOW with a keepalive PUT that outlives the tab.
    tdFlushRef.current = () => {
      clearTimeout(id);
      tdFlushRef.current = null;
      const doc = buildDoc();
      tdDocRef.current = doc;
      const next = { ...blobRef.current, tdSession: doc };
      blobRef.current = next;
      void saveOpeningBooks(levelId, next, true).catch(() => { /* best effort at teardown */ });
    };
    return () => clearTimeout(id);
  }, [levelId, tdSession, tdProbeLog, tdSummary, tdKept, commit]);
  useEffect(() => {
    const flush = (): void => { tdFlushRef.current?.(); };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // Reset = discard the run, including its stored document (the level's ADOPTION is
  // separate and survives — clearing that is the audit box's explicit button).
  const tdDiscardRun = useCallback(() => {
    tdDocRef.current = null;
    tdReset();
    if (blobRef.current.tdSession) {
      const { tdSession: _dropped, ...rest } = blobRef.current;
      commit(rest);
    }
  }, [tdReset, commit]);

  // STEP deals the next game (start position, learning NOT yet applied). Pure main-thread
  // preview — the worker only gets involved at the commit, and replays bit-identically.
  const tdDeal = useCallback(() => {
    if (!level || tdBusy || tdPending || tdGamesDone >= tdKnobs.games) return;
    const record = previewNextGame(level, tdOptionsOf(tdKnobs), tdSessionRef.current?.train ?? freshTdSession(tdOptionsOf(tdKnobs)).train);
    if (!record) return;
    setTdStopped(false); setTdError(null);
    setTdPending(record); setTdFrontier(0); setTdReplayPly(0);
  }, [level, tdBusy, tdPending, tdGamesDone, tdKnobs]);

  // The walk's conclusion: the frontier reached the game's final ply — commit it.
  // tdSend(1) replays the SAME game in the worker and applies the update; the session
  // comes back advanced and the stage's retire effect swaps the pending record for the
  // committed one seamlessly.
  const tdConclude = useCallback(() => { tdSend(1); }, [tdSend]);

  // Keep the inspected position inside the active book as it changes size.
  const posCount = activeBook?.positions.length ?? 0;
  useEffect(() => { if (selectedIndex > posCount - 1) setSelectedIndex(Math.max(0, posCount - 1)); }, [posCount, selectedIndex]);

  // --- Book management -------------------------------------------------------
  const settings = activeBook?.settings ?? DEFAULT_BOOK_SETTINGS;
  const setSettings = useCallback((patch: Partial<OpeningBookSettings>) => {
    const id = activeIdRef.current;
    const cur = blobRef.current.books.find((b) => b.id === id);
    if (!cur) return;
    commit(updateBook(blobRef.current, { ...cur, settings: { ...cur.settings, ...patch } }));
  }, [commit]);

  const onNewBook = useCallback(() => {
    playingRef.current = false; setPlaying(false);
    const seed = activeBook ? { ...activeBook.settings } : { ...DEFAULT_BOOK_SETTINGS };
    const { blob: next, book } = makeNewBook(blobRef.current, seed);
    commit(next);
    setActiveId(book.id);
    setSelectedIndex(0);
    setSelectedLatestGameIndex(0);
    setLatestReplayPly(0);
    setStepProgress(null);
    setStepProgressGames([]);
    setStepPaused(false);
    setMode('book');
  }, [activeBook, commit]);

  const onDeleteBook = useCallback(() => {
    if (activeId === undefined) return;
    playingRef.current = false; setPlaying(false);
    const next = deleteBook(blobRef.current, activeId);
    commit(next);
    setActiveId(next.books[0]?.id);
    setSelectedIndex(0);
    setSelectedLatestGameIndex(0);
    setLatestReplayPly(0);
    setStepProgress(null);
    setStepProgressGames([]);
    setStepPaused(false);
  }, [activeId, commit]);

  const onSelectBook = useCallback((id: number) => {
    playingRef.current = false; setPlaying(false);
    setActiveId(id);
    setSelectedIndex(0);
    setSelectedLatestGameIndex(0);
    setLatestReplayPly(0);
    setStepProgress(null);
    setStepProgressGames([]);
    setStepPaused(false);
  }, []);

  const selectLatestGame = useCallback((index: number) => {
    setSelectedLatestGameIndex(index);
    setLatestReplayPly(0);
  }, []);

  const generate = useCallback(() => {
    if (!workerRef.current || !ready || !activeBook) return;
    setGymError(null);
    setStepProgress(null);
    setStepProgressGames([]);
    setStepPaused(false);
    setGenerating(true);
    workerRef.current.postMessage({ type: 'generate', settings: activeBook.settings } as GymRequest);
  }, [ready, activeBook]);

  // --- Training --------------------------------------------------------------
  const canTrain = ready && !!activeBook && activeBook.positions.length > 0;
  const stepOnce = useCallback(() => {
    const worker = workerRef.current;
    const id = activeIdRef.current;
    const cur = blobRef.current.books.find((b) => b.id === id);
    if (busy || stepPaused) return;
    if (!worker || !ready || !cur || cur.positions.length === 0) { playingRef.current = false; setPlaying(false); return; }
    if (!playingRef.current) {
      runStartRef.current = { ms: performance.now(), step: cur.session.traj.length };
      setRunMs(0);
    }
    setGymError(null);
    setStepProgress(null);
    setStepProgressGames([]);
    setStepPaused(false);
    resumePlayingRef.current = false;
    setBusy(true);
    worker.postMessage({ type: 'step', book: cur.positions, session: cur.session } as GymRequest);
  }, [busy, ready, stepPaused]);
  stepOnceRef.current = stepOnce;

  const togglePlay = useCallback(() => {
    const worker = workerRef.current;
    if (stepPaused) {
      setGymError(null);
      setStepPaused(false);
      playingRef.current = resumePlayingRef.current;
      setPlaying(resumePlayingRef.current);
      worker?.postMessage({ type: 'resume' } as GymRequest);
      return;
    }
    if (busy) {
      resumePlayingRef.current = playingRef.current;
      playingRef.current = false;
      setPlaying(false);
      setStepPaused(true);
      worker?.postMessage({ type: 'pause' } as GymRequest);
      return;
    }
    if (playingRef.current) { playingRef.current = false; setPlaying(false); resumePlayingRef.current = false; return; }
    const cur = blobRef.current.books.find((b) => b.id === activeIdRef.current);
    runStartRef.current = { ms: performance.now(), step: cur?.session.traj.length ?? 0 };
    setRunMs(0);
    setGymError(null);
    setStepProgress(null);
    setStepProgressGames([]);
    setStepPaused(false);
    resumePlayingRef.current = false;
    playingRef.current = true; setPlaying(true); stepOnce();
  }, [busy, stepOnce, stepPaused]);

  // --- SPRT validation & adopt -----------------------------------------------
  // Kick off a streaming SPRT test of the champion vs the shipped reference over the
  // active book. The worker plays one game per message and streams a valpoint each,
  // stopping at a verdict (or the game budget). Pause training first so the two runs
  // don't contend for the single worker.
  const validateChampion = useCallback(() => {
    const worker = workerRef.current;
    const cur = blobRef.current.books.find((b) => b.id === activeIdRef.current);
    if (!worker || !ready || !cur || cur.positions.length === 0) return;
    if (busy || stepPaused) return;
    if (cur.session.champion.step < 0) return; // no real improvement to test yet
    playingRef.current = false; setPlaying(false);
    setGymError(null);
    setStepProgress(null);
    setStepProgressGames([]);
    setStepPaused(false);
    resumePlayingRef.current = false;
    setVal(null); setValidating(true);
    const candidate = decodeWeights(cur.session.champion.theta);
    worker.postMessage({ type: 'validate', candidate, book: cur.positions } as GymRequest);
  }, [busy, ready, stepPaused]);

  // Adopt the champion for this level's LIVE enemy AI: write the winning vector to the
  // local cache (the live AI's synchronous source) AND the account blob (durable,
  // cross-device). The next enemy reply on this level plays with these weights.
  // Adopt any weight vector (a local champion OR a cluster champion) for this level.
  const adoptVector = useCallback((vec: number[]) => {
    if (!levelId) return;
    setAdoptedWeights(levelId, vec);
    setAdoptedVec(vec);
    commit({ ...blobRef.current, adoptedWeights: vec });
  }, [levelId, commit]);
  const adoptChampion = useCallback(() => {
    const cur = blobRef.current.books.find((b) => b.id === activeIdRef.current);
    if (!cur || cur.session.champion.step < 0) return;
    adoptVector(cur.session.champion.theta.slice());
  }, [adoptVector]);

  // Revert to the shipped weights for this level (clears both cache and account blob).
  const unadopt = useCallback(() => {
    if (!levelId) return;
    setAdoptedWeights(levelId, null);
    setAdoptedVec(null);
    const { adoptedWeights: _drop, ...rest } = blobRef.current;
    commit(rest);
  }, [levelId, commit]);

  // --- Derived training view (from the active book's retained session) -------
  const session: GymSession | undefined = activeBook?.session;
  const traj = session?.traj ?? [];
  const latestStepGames = session?.latestStepGames ?? [];
  const champion = session?.champion ?? { step: -1, score: 0.5, theta: REF_VEC };
  const established = session?.established ?? 0;
  const lastScore = traj.length ? traj[traj.length - 1].score : 0.5;
  const champVec = champion.theta;
  const estabPct = champion.step < 0 ? 0 : Math.min(96, 40 + established * 4);
  const hasChampion = champion.step >= 0;
  const adoptedActive = adoptedVec !== null;
  const gameOutcome = (game: typeof latestStepGames[number]): 'win' | 'draw' | 'loss' => {
    if (game.record.winner === 'draw') return 'draw';
    return game.record.winner === game.candidateSide ? 'win' : 'loss';
  };
  useEffect(() => {
    setSelectedLatestGameIndex(0);
    setLatestReplayPly(0);
  }, [activeId, session?.k]);
  useEffect(() => {
    setSelectedLatestGameIndex((index) => (latestStepGames.length ? Math.min(index, latestStepGames.length - 1) : 0));
  }, [latestStepGames.length]);
  const selectedLatestGame = latestStepGames.length
    ? latestStepGames[Math.min(selectedLatestGameIndex, latestStepGames.length - 1)]
    : undefined;
  const selectedLatestOutcome = selectedLatestGame ? gameOutcome(selectedLatestGame) : undefined;
  const latestReplayStates = useMemo(
    () => (level && selectedLatestGame ? replayStates(level, selectedLatestGame.record, selectedLatestGame.openingMoves) : null),
    [level, selectedLatestGame],
  );
  const latestReplayMax = latestReplayStates ? latestReplayStates.length - 1 : 0;
  const clampedLatestReplayPly = Math.max(0, Math.min(latestReplayPly, latestReplayMax));
  const latestReplayBoard = useMemo(() => {
    if (!level || !latestReplayStates) return null;
    const state = latestReplayStates[clampedLatestReplayPly];
    if (!state) return null;
    return { ...levelToEditorBoard(level), units: unitsForGamePieces(state.pieces) };
  }, [level, latestReplayStates, clampedLatestReplayPly]);
  const toggleReplayFocus = useCallback(() => {
    if (!replayFocus) setViewZoom((zoom) => Math.max(zoom, 1));
    setReplayFocus((focus) => !focus);
  }, [replayFocus]);
  const tdLastGame = tdSess.lastGame ?? null;
  const tdLedger = tdSess.ledger ?? [];
  useEffect(() => {
    const hasReplay = mode === 'train' ? !!selectedLatestGame : mode === 'values' ? !!tdLastGame : false;
    if (!hasReplay) setReplayFocus(false);
  }, [mode, selectedLatestGame, tdLastGame]);
  const latestReplayMoveLabel = selectedLatestGame
    ? clampedLatestReplayPly === 0
      ? `Book position after ${selectedLatestGame.openingMoves.length} opening plies`
      : gameMoveLabel(selectedLatestGame.record, clampedLatestReplayPly - 1)
    : '';
  const latestReplayMoveTitle = selectedLatestGame
    ? clampedLatestReplayPly === 0
      ? `${selectedLatestGame.openingMoves.length} opening plies applied`
      : latestReplayMoveLabel
    : '';
  const replayPanel: ReactElement | null = selectedLatestGame && latestReplayStates && latestReplayBoard ? (
    <div className={`gym-replay-stage ${replayFocus ? 'is-focused' : ''}`} aria-label="Latest step game replay">
      <div className="gym-replay-head">
        <div className="gym-replay-title">
          <h3>Inspect game</h3>
          <span className="gym-replay-move" title={latestReplayMoveTitle}>{latestReplayMoveLabel}</span>
        </div>
        <span className={`outcome ${selectedLatestOutcome ?? ''}`}>{selectedLatestOutcome}</span>
        <span>step <b className="gym-num">{Math.max(0, (session?.k ?? 1) - 1)}</b></span>
        <span>{selectedLatestGame.probe === 'plus' ? 'theta+' : 'theta-'}</span>
        <span>pos <b className="gym-num">#{selectedLatestGame.bookIndex + 1}</b></span>
        <span>seed <b className="gym-num">{selectedLatestGame.seed}</b></span>
        <div className="gym-replay-controls is-inline">
          <button type="button" onClick={() => setLatestReplayPly(Math.max(0, clampedLatestReplayPly - 1))} disabled={clampedLatestReplayPly === 0}>Prev</button>
          <input type="range" min={0} max={latestReplayMax} value={clampedLatestReplayPly} onChange={(e) => setLatestReplayPly(Number(e.target.value))} aria-label="Replay ply" />
          <button type="button" onClick={() => setLatestReplayPly(Math.min(latestReplayMax, clampedLatestReplayPly + 1))} disabled={clampedLatestReplayPly >= latestReplayMax}>Next</button>
          <span className="gym-replay-ply">Ply {clampedLatestReplayPly}/{latestReplayMax}</span>
        </div>
        <button
          type="button"
          className="gym-replay-focus-btn"
          onClick={toggleReplayFocus}
          aria-pressed={replayFocus}
          aria-label={replayFocus ? 'Restore replay layout' : 'Focus replay board'}
          title={replayFocus ? 'Restore replay layout' : 'Focus replay board'}
        >
          {replayFocus ? 'X' : 'Focus'}
        </button>
      </div>
      <div className="gym-replay-board">
        <ViewPane kind="board" ariaLabel="Latest step game replay board" zoom={viewZoom} pan={viewPan} minZoom={0.3} maxZoom={2} onZoomChange={setViewZoom} onPanChange={setViewPan}>
          <div className="tileset-view-board-content is-board">
            <StudioReadOnlyBoard board={latestReplayBoard} boardZoom={viewZoom} boardPan={viewPan} ariaLabel="Latest step game replay board" />
          </div>
        </ViewPane>
      </div>
    </div>
  ) : null;
  const replayFocusActive = replayFocus && replayPanel !== null;

  // --- Stepped-game stage (`values` mode) — deal-then-walk. The stage shows either
  // the PENDING dealt game (in play: Next advances the frontier, review behind it is
  // free, no scrubbing ahead; the TD update has NOT landed yet) or the last COMMITTED
  // game (concluded: outcome chip shown, fully scrubbable). Both self-play sides share
  // one policy, so the outcome reads from the PLAYER's side (the W/D/L line's labels).
  const tdInspect = tdPending ?? tdLastGame;
  const tdWalking = tdPending !== null;
  // One cursor-keeping effect: retire a pending game once the session has learned from
  // it (single-step commit, or a Run that consumed it as the batch's first game); with
  // no walk in progress, rest the cursor on the latest game's final position (during a
  // Run the games fly past at their conclusions).
  useEffect(() => {
    if (tdPending) {
      if (tdGamesDone >= tdPending.game) {
        setTdPending(null); setTdFrontier(0);
        // ▶ play out watches only THIS game: its conclusion ends the show, leaving the
        // finished game on the stage for inspection instead of dealing the next.
        if (tdWatchScopeRef.current === 'game') setTdWatching(false);
      }
      return;
    }
    setTdReplayPly(tdLastGame?.plies ?? 0);
  }, [tdPending, tdGamesDone, tdLastGame?.game, tdLastGame?.plies]);
  const tdReplayStates = useMemo(
    () => (level && tdInspect ? replayStates(level, tdInspect) : null),
    [level, tdInspect],
  );
  // The walk's forward edge caps the cursor: a game in play only exists up to its frontier.
  const tdReplayMax = tdWalking ? tdFrontier : tdReplayStates ? tdReplayStates.length - 1 : 0;
  const tdClampedReplayPly = Math.max(0, Math.min(tdReplayPly, tdReplayMax));
  const tdReplayBoard = useMemo(() => {
    if (!level || !tdReplayStates) return null;
    const state = tdReplayStates[tdClampedReplayPly];
    if (!state) return null;
    return { ...levelToEditorBoard(level), units: unitsForGamePieces(state.pieces) };
  }, [level, tdReplayStates, tdClampedReplayPly]);
  // Standard algebraic notation for the inspected game — the accepted chess score.
  const tdReplaySan = useMemo(
    () => (tdInspect && tdReplayStates ? sanForGame(tdReplayStates, tdInspect.moves) : null),
    [tdInspect, tdReplayStates],
  );
  const tdSanAt = useCallback((ply: number): string => {
    if (!tdInspect || !tdReplaySan || ply < 1) return '';
    const i = ply - 1;
    const opensWithReply = tdInspect.moves[0]?.side === 'enemy';
    const num = Math.floor((i + (opensWithReply ? 1 : 0)) / 2) + 1;
    return `${num}${tdInspect.moves[i]?.side === 'player' ? '.' : '…'} ${tdReplaySan[i] ?? ''}`;
  }, [tdInspect, tdReplaySan]);
  const tdReplayMoveLabel = tdInspect
    ? tdClampedReplayPly === 0 ? 'Start position' : tdSanAt(tdClampedReplayPly)
    : '';
  // The coordinate form rides the tooltip for exactness.
  const tdReplayMoveTitle = tdInspect && tdClampedReplayPly > 0 ? gameMoveLabel(tdInspect, tdClampedReplayPly - 1) : '';
  const tdReplayEpsilon = tdInspect ? scheduleAt(tdOpts, tdInspect.game - 1).epsilon : 0;
  // THE universal advance — one button that always moves the algorithm one step: no game
  // in play → deal the next one; game in play → play its next ply (the final ply lands
  // the TD update); concluded → the next press deals again. The board follows; the
  // stage's own controls are pure NAVIGATION and never advance anything.
  const tdAdvance = useCallback(() => {
    if (tdBusy) return;
    if (!tdPending) { tdDeal(); return; }
    const nf = tdFrontier + 1;
    setTdFrontier(nf); setTdReplayPly(nf);
    if (nf >= tdPending.plies) tdConclude();
  }, [tdBusy, tdPending, tdFrontier, tdDeal, tdConclude]);
  // "Run until completion", one level down: play the dealt game out and commit it.
  const tdWalkToEnd = useCallback(() => {
    if (!tdPending) return;
    setTdFrontier(tdPending.plies); setTdReplayPly(tdPending.plies);
    tdConclude();
  }, [tdPending, tdConclude]);
  // Advance up to n plies of the game in play in one gesture (Shift+→); the final ply
  // still concludes and lands the update. With no game in play it deals one.
  const tdAdvanceN = useCallback((n: number) => {
    if (tdBusy) return;
    if (!tdPending) { tdDeal(); return; }
    const nf = Math.min(tdPending.plies, tdFrontier + n);
    setTdFrontier(nf); setTdReplayPly(nf);
    if (nf >= tdPending.plies) tdConclude();
  }, [tdBusy, tdPending, tdFrontier, tdDeal, tdConclude]);
  // "Step forward once" for the keyboard: review forward when the cursor is behind
  // what's been played, else advance the algorithm — the natural single-key reading.
  const tdForward = useCallback(() => {
    if (tdClampedReplayPly < tdReplayMax) { setTdReplayPly(tdClampedReplayPly + 1); return; }
    tdAdvance();
  }, [tdClampedReplayPly, tdReplayMax, tdAdvance]);
  const tdBack = useCallback(() => { setTdReplayPly(Math.max(0, tdClampedReplayPly - 1)); }, [tdClampedReplayPly]);
  // WATCH — the system presses ⏭ step for you, one beat at a time (bender-world's
  // watchable full play): deal, play each ply, land the update at the game's end, deal
  // the next, until the budget completes or he pauses. Same provably-inert advance as
  // manual stepping — the clock is the ONLY new thing. During a commit (tdBusy) the
  // beat no-ops, so game boundaries breathe naturally.
  const tdAdvanceRef = useRef(tdAdvance); tdAdvanceRef.current = tdAdvance;
  useEffect(() => {
    if (!tdWatching) return undefined;
    const id = setInterval(() => { tdAdvanceRef.current(); }, Math.max(16, tdBeatMs));
    return () => clearInterval(id);
  }, [tdWatching, tdBeatMs]);
  // Budget done and nothing left in play: the show is over — stop the clock.
  useEffect(() => {
    if (tdWatching && tdComplete && !tdPending) setTdWatching(false);
  }, [tdWatching, tdComplete, tdPending]);
  // --- Setting and auditing the level's live AI --------------------------------
  // Adoption converts the learned pawn-relative values into the eval vector's piece
  // values (touched types only; untouched types keep the shipped default — a weight
  // that never received signal is noise, not a value) and sets them through the SAME
  // per-level slot the Training tab's champion uses. Requires the pawn gauge.
  const tdAdoptSource = tdSummary ? tdSummary.mean : tdSess.train.weights;
  const tdAdoptRel = useMemo(
    () => (tdHasPawns ? pawnRelativeValues(tdAdoptSource) : null),
    [tdHasPawns, tdAdoptSource],
  );
  const tdAdoptPreview = useMemo(() => {
    if (!tdAdoptRel || !tdStarted) return null;
    return PLAYABLE_PIECE_TYPES.map((t) => {
      const untouched = tdSummary
        ? tdUntouched(tdSummary.mean[t]) && tdSummary.spread[t] === 0
        : tdUntouched(tdSess.train.weights[t]);
      // The king never adopts: classically kings have no trade value, and the two
      // numbers mean different things — the eval's king "value" is its king-DANGER
      // coefficient (the hanging-piece safety term), while the learner's king weight
      // is a mate indicator (its count feature is nonzero only once a king is dead).
      // Pouring one into the other would be a category error.
      const kept = t === 'king' || untouched;
      return {
        type: t,
        learned: tdAdoptRel[t],
        adopted: kept ? DEFAULT_EVAL_WEIGHTS.pieceValues[t] : Math.round(tdAdoptRel[t] * 100) / 100,
        untouched,
        keptReason: t === 'king' ? 'kept — king-safety coefficient, not material' : untouched ? 'kept — no signal' : null,
      };
    });
  }, [tdAdoptRel, tdStarted, tdSummary, tdSess, tdUntouched]);
  const tdAdopt = useCallback(() => {
    if (!levelId || !tdAdoptPreview) return;
    const pieceValues = { ...DEFAULT_EVAL_WEIGHTS.pieceValues };
    for (const row of tdAdoptPreview) pieceValues[row.type] = row.adopted;
    const vec = encodeWeights({ ...DEFAULT_EVAL_WEIGHTS, pieceValues });
    setAdoptedWeights(levelId, vec);
    setAdoptedVec(vec);
    const adopted = {} as ValueWeights;
    for (const row of tdAdoptPreview) adopted[row.type] = row.adopted;
    const adoption: TdAdoptionRecord = {
      at: new Date().toISOString(), vector: vec, pieceValues: adopted,
      fromGames: tdGamesDone,
      seeds: tdSummary ? tdSummary.seeds : [tdKnobsRef.current.seed],
      source: tdSummary ? 'seed-mean' : 'live-weights',
    };
    const doc: TdSessionDoc = {
      opts: tdOptionsOf(tdKnobsRef.current), seedCount: tdKnobsRef.current.seedCount,
      session: tdSess, probeLog: tdProbeLog, summary: tdSummary, kept: tdKept, adoption,
    };
    tdDocRef.current = doc;
    commit({ ...blobRef.current, adoptedWeights: vec, tdSession: doc });
  }, [levelId, tdAdoptPreview, tdGamesDone, tdSummary, tdSess, tdProbeLog, tdKept, commit]);
  const tdClearAdoption = useCallback(() => {
    if (!levelId) return;
    setAdoptedWeights(levelId, null);
    setAdoptedVec(null);
    const { adoptedWeights: _cleared, ...rest } = blobRef.current;
    const doc = rest.tdSession ? { ...rest.tdSession } : undefined;
    if (doc) delete doc.adoption;
    commit({ ...rest, ...(doc ? { tdSession: doc } : {}) });
  }, [levelId, commit]);
  // What the live opponent will actually use on this level, resolved tier by tier —
  // the audit read. `adoptedVec` mirrors localStorage + the account blob.
  const tdLiveAi = useMemo(() => {
    const shipped = levelId ? readShippedVector(levelId) : null;
    const vec = adoptedVec ?? shipped;
    const tier = adoptedVec
      ? (blob.tdSession?.adoption ? 'adopted — from this pane' : 'adopted — from the Training tab')
      : shipped ? 'globally shipped' : 'built-in defaults';
    let pieceValues = DEFAULT_EVAL_WEIGHTS.pieceValues;
    if (vec) { try { pieceValues = decodeWeights(vec).pieceValues; } catch { /* fall back to defaults */ } }
    return { tier, pieceValues, adoption: blob.tdSession?.adoption ?? null, hasAdoption: !!adoptedVec };
  }, [levelId, adoptedVec, blob.tdSession]);

  // The board renders pixel art 1:1 whenever the stage has content — the shared
  // read-only renderer is the Level Editor's render core, and its art is authored for
  // integer scale (0.72 nearest-neighbour was the "extra pixelated" look).
  const tdHasInspect = tdInspect !== null;
  useEffect(() => {
    if (mode === 'values' && tdHasInspect) setViewZoom((zoom) => Math.max(zoom, 1));
  }, [mode, tdHasInspect]);
  const tdReplayPanel: ReactElement | null = tdInspect && tdReplayStates && tdReplayBoard ? (
    <div className={`gym-replay-stage ${replayFocus ? 'is-focused' : ''}`} aria-label="Stepped training game replay">
      <div className="gym-replay-head">
        <div className="gym-replay-title">
          <h3>{tdWalking ? 'Game in play' : 'Inspect game'}</h3>
          <span className="gym-replay-move" title={tdReplayMoveTitle}>{tdReplayMoveLabel}</span>
        </div>
        {tdWalking ? (
          // No outcome, no total plies: the game has not happened past the frontier yet.
          <span className="gym-hint">learning lands when the game ends</span>
        ) : (
          <span className={`outcome ${tdInspect.winner === 'player' ? 'win' : tdInspect.winner === 'draw' ? 'draw' : 'loss'}`}>
            {tdInspect.winner === 'player' ? 'player win' : tdInspect.winner === 'draw' ? 'draw' : 'enemy win'}
          </span>
        )}
        <span>game <b className="gym-num">{tdInspect.game}</b></span>
        <span>ε <b className="gym-num">{tdReplayEpsilon.toFixed(3)}</b></span>
        {tdWalking ? null : <span>plies <b className="gym-num">{tdInspect.plies}</b></span>}
        <span>seed <b className="gym-num">{tdInspect.seed}</b></span>
        <div className="gym-replay-controls is-inline is-nav">
          <button type="button" onClick={() => setTdReplayPly(0)} disabled={tdClampedReplayPly === 0} title="First position" aria-label="First position">⏮</button>
          <button type="button" onClick={() => setTdReplayPly(Math.max(0, tdClampedReplayPly - 1))} disabled={tdClampedReplayPly === 0} title="Previous ply" aria-label="Previous ply">◀</button>
          <input type="range" min={0} max={tdReplayMax} value={tdClampedReplayPly} onChange={(e) => setTdReplayPly(Number(e.target.value))} aria-label="Replay ply" />
          <button type="button" onClick={() => setTdReplayPly(Math.min(tdReplayMax, tdClampedReplayPly + 1))} disabled={tdClampedReplayPly >= tdReplayMax} title="Next ply" aria-label="Next ply">▶</button>
          <button type="button" onClick={() => setTdReplayPly(tdReplayMax)} disabled={tdClampedReplayPly >= tdReplayMax} title={tdWalking ? 'Latest played ply' : 'Final position'} aria-label={tdWalking ? 'Latest played ply' : 'Final position'}>⏭</button>
          <span className="gym-replay-ply">{tdWalking ? `Ply ${tdClampedReplayPly} · in play` : `Ply ${tdClampedReplayPly}/${tdReplayMax}`}</span>
        </div>
        {tdWalking || tdWatching ? (
          <label className="gym-replay-tempo" title="Tempo — steps per second; Max is a step every frame">
            <input type="range" min={0} max={100} value={tdBeatToSlider(tdBeatMs)}
              onChange={(e) => setTdBeatMs(tdSliderToBeat(Number(e.target.value)))} aria-label="Play-out tempo" />
            <b className="gym-num">{tdBeatReadout(tdBeatMs)}</b>
          </label>
        ) : null}
        {tdWatching ? (
          <button type="button" className="gym-replay-focus-btn gym-replay-playout-btn" onClick={() => setTdWatching(false)}
            title="Pause — the game keeps its place">⏸ pause</button>
        ) : tdWalking ? (
          <button type="button" className="gym-replay-focus-btn gym-replay-playout-btn" onClick={() => { tdWatchScopeRef.current = 'game'; setTdWatching(true); }} disabled={tdBusy}
            title="Watch THIS game play out at the tempo, then hold at its end for inspection — the next game is not dealt">▶ play out</button>
        ) : null}
        {tdWalking ? <button type="button" className="gym-replay-focus-btn" onClick={tdWalkToEnd} disabled={tdBusy} title="Jump the dealt game to its end instantly and land its update">⏩ to end</button> : null}
        <button
          type="button"
          className="gym-replay-focus-btn"
          onClick={toggleReplayFocus}
          aria-pressed={replayFocus}
          aria-label={replayFocus ? 'Restore replay layout' : 'Focus replay board'}
          title={replayFocus ? 'Restore replay layout' : 'Focus replay board'}
        >
          {replayFocus ? 'X' : 'Focus'}
        </button>
      </div>
      <div className="gym-replay-board">
        <ViewPane kind="board" ariaLabel="Stepped training game replay board" zoom={viewZoom} pan={viewPan} minZoom={0.3} maxZoom={2} onZoomChange={setViewZoom} onPanChange={setViewPan}>
          <div className="tileset-view-board-content is-board">
            <StudioReadOnlyBoard board={tdReplayBoard} boardZoom={viewZoom} boardPan={viewPan} ariaLabel="Stepped training game replay board" />
          </div>
        </ViewPane>
      </div>
    </div>
  ) : null;
  const tdReplayFocusActive = replayFocus && tdReplayPanel !== null;
  // Keyboard transport on the whole pane (bender-world's bindings): Space watch/pause,
  // → step forward (review first, then advance), Shift+→ ten plies, ← back one position
  // (view only — nothing un-learns), Home/End first/latest. Skips form controls so
  // typing in knobs never drives the board.
  const tdKeysRef = useRef({ tdForward, tdAdvanceN, tdBack, tdReplayMax });
  tdKeysRef.current = { tdForward, tdAdvanceN, tdBack, tdReplayMax };
  useEffect(() => {
    if (mode !== 'values') return undefined;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON')) return;
      if (e.key === ' ') { e.preventDefault(); tdWatchScopeRef.current = 'run'; setTdWatching((w) => !w); }
      else if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); tdKeysRef.current.tdAdvanceN(10); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); tdKeysRef.current.tdForward(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); tdKeysRef.current.tdBack(); }
      else if (e.key === 'Home') { e.preventDefault(); setTdReplayPly(0); }
      else if (e.key === 'End') { e.preventDefault(); setTdReplayPly(tdKeysRef.current.tdReplayMax); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);
  const tdMoveListRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    tdMoveListRef.current?.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' });
  }, [tdReplayFocusActive, tdClampedReplayPly]);
  // The score sheet: numbered full moves in standard notation, every half-move a jump
  // target. While a game is in play only the PLAYED plies appear (the frontier again).
  const tdScoreRows = useMemo(
    () => (tdReplayFocusActive && tdInspect && tdReplayStates
      ? sanFullMoves(tdReplayStates, tdInspect.moves.slice(0, tdReplayMax))
      : null),
    [tdReplayFocusActive, tdInspect, tdReplayStates, tdReplayMax],
  );
  const tdScoreCell = (half: { ply: number; san: string } | null): ReactElement | null => half ? (
    <button
      type="button"
      className={tdClampedReplayPly === half.ply ? 'is-current' : ''}
      onClick={() => setTdReplayPly(half.ply)}
      title={tdInspect ? gameMoveLabel(tdInspect, half.ply - 1) : ''}
    >
      {half.san}
    </button>
  ) : null;
  const tdMoveList: ReactElement | null = tdScoreRows ? (
    <div className="gym-replay-movelist" ref={tdMoveListRef} aria-label="Score sheet">
      <button type="button" className={`gym-score-start ${tdClampedReplayPly === 0 ? 'is-current' : ''}`.trim()} onClick={() => setTdReplayPly(0)}>Start position</button>
      {tdScoreRows.map((row) => (
        <div className="gym-score-row" key={row.number}>
          <span className="n">{row.number}.</span>
          {row.first ? tdScoreCell(row.first) : <span className="gap">…</span>}
          {tdScoreCell(row.second)}
        </div>
      ))}
    </div>
  ) : null;

  // SPRT view derivation: map the live LLR onto the [lower, upper] bar (0 => reject
  // edge, 1 => accept edge, .5 => the zero line). The fill grows from center toward
  // whichever bound the evidence favors. Colors follow the verdict.
  const vr = val?.sprt;
  const llrFrac = vr && vr.upper > vr.lower
    ? Math.max(0, Math.min(1, (vr.llr - vr.lower) / (vr.upper - vr.lower)))
    : 0.5;
  const markerPct = llrFrac * 100;
  const verdict = vr?.verdict ?? 'continue';

  // Live run telemetry: tick elapsed while playing or while a single manual step is
  // computing. Cumulative game outcomes come from the whole trajectory.
  useEffect(() => {
    if ((!playing && !busy) || stepPaused) return undefined;
    const id = setInterval(() => setRunMs(performance.now() - runStartRef.current.ms), 250);
    return () => clearInterval(id);
  }, [playing, busy, stepPaused]);
  const runSteps = Math.max(0, traj.length - runStartRef.current.step);
  const pace = (playing || busy) && !stepPaused && runMs > 400 ? runSteps / (runMs / 1000) : 0;
  const stepProgressPct = stepProgress && stepProgress.gamesTotal > 0
    ? Math.max(0, Math.min(100, (stepProgress.gamesDone / stepProgress.gamesTotal) * 100))
    : 0;
  const stepProgressLabel = stepProgress
    ? `${stepProgress.phase} game ${stepProgress.phaseGamesDone}/${stepProgress.phaseGamesTotal} · ${stepProgress.gamesDone}/${stepProgress.gamesTotal} total`
    : '';
  const liveStepGames = useMemo(() => [...stepProgressGames].reverse(), [stepProgressGames]);
  const runButtonLabel = stepPaused ? (resumePlayingRef.current ? '▶ resume run' : '▶ resume') : playing || busy ? '⏸ pause' : '▶ run';
  const runButtonClass = `play ${stepPaused ? 'is-resume' : playing || busy ? 'is-pause' : ''}`.trim();
  const totals = useMemo(() => {
    let games = 0, wins = 0, draws = 0, losses = 0;
    for (const p of traj) { games += p.games ?? 0; wins += p.wins ?? 0; draws += p.draws ?? 0; losses += p.losses ?? 0; }
    return { games, wins, draws, losses, drawRate: games ? draws / games : 0 };
  }, [traj]);
  const trajDesc = useMemo(() => [...traj].reverse(), [traj]);  // newest step on top
  const scoreColor = (v: number): string => (v > 0.505 ? '#5ad19a' : v < 0.495 ? '#e0685f' : '#c6d0dc');
  const fmtElapsed = (ms: number): string => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  // Convergence chart, y-axis auto-zoomed to the data (always spanning 0.5) so even
  // tiny movement shows instead of a dead-flat line. Gold ring marks the champion.
  const convRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cvs = convRef.current; if (!cvs) return;
    const ctx = cvs.getContext('2d'); if (!ctx) return;
    const W = cvs.width, H = cvs.height, pad = 24; ctx.clearRect(0, 0, W, H);
    if (traj.length === 0) {
      ctx.strokeStyle = 'rgba(58,70,87,.35)'; ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g += 1) { const y = pad + (H - 2 * pad) * g / 4; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke(); }
      return;
    }
    const scores = traj.map((p) => p.score);
    let lo = Math.min(0.5, ...scores), hi = Math.max(0.5, ...scores);
    const range = (hi - lo) || 0.02; lo -= range * 0.25; hi += range * 0.25;
    const n = traj.length;
    const X = (i: number) => pad + (W - 2 * pad) * (n <= 1 ? 0.5 : i / (n - 1));
    const Y = (v: number) => H - pad - (H - 2 * pad) * ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo));
    ctx.font = '10px ui-monospace, monospace';
    for (let g = 0; g <= 4; g += 1) {
      const v = hi - (hi - lo) * g / 4; const y = pad + (H - 2 * pad) * g / 4;
      ctx.strokeStyle = 'rgba(58,70,87,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
      ctx.fillStyle = '#5c6875'; ctx.fillText(v.toFixed(3), 2, y + 3);
    }
    ctx.strokeStyle = 'rgba(147,160,176,.5)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pad, Y(0.5)); ctx.lineTo(W - pad, Y(0.5)); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(X(0), Y(scores[0]));
    scores.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
    ctx.strokeStyle = '#46d6b8'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(X(n - 1), Y(scores[n - 1]), 3.5, 0, 7); ctx.fillStyle = '#46d6b8'; ctx.fill();
    const ci = traj.findIndex((p) => p.step === champion.step);
    if (ci >= 0) { ctx.beginPath(); ctx.arc(X(ci), Y(scores[ci]), 4.5, 0, 7); ctx.strokeStyle = '#e0b24a'; ctx.lineWidth = 2; ctx.stroke(); }
  }, [traj, champion, replayFocusActive]);

  // Board at the inspected position (the SELECTED book position, both modes).
  const selectedPos = activeBook?.positions[Math.min(selectedIndex, posCount - 1)];
  const board = useMemo(() => {
    if (!level) return null;
    const base = levelToEditorBoard(level);
    const game = selectedPos ? stateAtPosition(level, selectedPos) : createFromLevel(level, settings.seedBase);
    return { ...base, units: unitsForGamePieces(game.pieces) };
  }, [level, selectedPos, settings.seedBase]);

  return (
    <>
      <style>{GYM_CSS}</style>
      <section className="al-lab-main gym-main" aria-label="Gym output">
        {!level ? (
          <p className="gym-hint">Pick a level from the Gym catalog to train the AI on it.</p>
        ) : (
          <>
            {!replayFocusActive ? <div className="gym-head">
              <nav className="gym-modebar" aria-label="Gym mode">
                <button type="button" className={`gym-book-mode ${mode === 'book' ? 'active' : ''}`} onClick={() => setMode('book')} aria-pressed={mode === 'book'}>Opening book</button>
                <div className={`gym-training-mode ${mode === 'train' || mode === 'cluster' ? 'is-active' : ''}`} role="group" aria-label="Training location">
                  <span className="gym-training-label">Training</span>
                  <div className="gym-training-tabs">
                    <button type="button" className={mode === 'train' ? 'active' : ''} onClick={() => setMode('train')} disabled={!activeBook} aria-pressed={mode === 'train'}>Local</button>
                    <button type="button" className={mode === 'cluster' ? 'active' : ''} onClick={() => setMode('cluster')} aria-pressed={mode === 'cluster'}>Cluster</button>
                  </div>
                </div>
                {/* A different learner, not a third SPSA location — its own mode button,
                    and deliberately NOT gated on an opening book (it plays from the
                    level start; it needs only the level). */}
                <button type="button" className={`gym-book-mode ${mode === 'values' ? 'active' : ''}`} onClick={() => setMode('values')} aria-pressed={mode === 'values'}>Piece values</button>
              </nav>

              {mode === 'book' ? (
                activeBook ? (
                  <>
                    <div className="gym-bookhead">
                      <span>Book <b className="gym-num">#{activeBook.id}</b> — <b className="gym-num">{posCount}</b> position{posCount === 1 ? '' : 's'} · plies <b className="gym-num">{activeBook.settings.plies}</b> · variety <b className="gym-num">{activeBook.settings.variety.toFixed(2)}</b></span>
                    </div>
                    {posCount > 0 ? (
                      <div className="gym-pager">
                        <button type="button" onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))} disabled={selectedIndex === 0}>◂ prev</button>
                        <span>position <span className="gym-num">{Math.min(selectedIndex, posCount - 1) + 1}</span> of <span className="gym-num">{posCount}</span></span>
                        <button type="button" onClick={() => setSelectedIndex((i) => Math.min(posCount - 1, i + 1))} disabled={selectedIndex >= posCount - 1}>next ▸</button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="gym-hint" style={{ margin: '4px 0 8px' }}>No opening book yet — make one in the rail, then <b>Generate</b> its positions.</p>
                )
              ) : mode === 'train' ? (
                <h3 style={{ margin: '4px 0 8px' }}>
                  Training book <span className="gym-num">#{activeBook?.id}</span> — <span className="gym-num">{posCount}</span> position{posCount === 1 ? '' : 's'}, live run
                </h3>
              ) : mode === 'values' ? (
                <h3 style={{ margin: '4px 0 8px' }}>Piece values — learn this board&apos;s piece values from scratch by self-play (afterstate TD(λ))</h3>
              ) : (
                <h3 style={{ margin: '4px 0 8px' }}>Cluster training — headless tuning on the D8als_v7 pool</h3>
              )}
            </div> : null}

            {mode === 'cluster' && level ? (
              <ClusterRuns level={level} levelId={levelId} onAdopt={adoptVector} />
            ) : null}

            {mode === 'book' ? (
              <>
                {activeBook && posCount > 0 ? (
                  <div className="gym-postable-wrap">
                    <table className="gym-postable">
                      <thead>
                        <tr><th style={{ width: 52 }}>seed</th><th>opening moves</th></tr>
                      </thead>
                      <tbody>
                        {activeBook.positions.map((pos, i) => {
                          const label = movesLabel(pos.moves);
                          return (
                            <tr key={`${pos.seed}-${i}`} className={i === selectedIndex ? 'is-sel' : ''} onClick={() => setSelectedIndex(i)}>
                              <td className="gym-num">#{pos.seed}</td>
                              <td className="moves" title={label}>{label}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <div className="gym-board">
                  {board ? (
                    <ViewPane kind="board" ariaLabel="Board" zoom={viewZoom} pan={viewPan} minZoom={0.3} maxZoom={2} onZoomChange={setViewZoom} onPanChange={setViewPan}>
                      <div className="tileset-view-board-content is-board"><StudioReadOnlyBoard board={board} boardZoom={viewZoom} boardPan={viewPan} ariaLabel="Board" /></div>
                    </ViewPane>
                  ) : (
                    <div className="gym-empty-book">Generate a book to inspect its positions here.</div>
                  )}
                </div>
              </>
            ) : mode === 'train' ? (
              <div className={`gym-run ${replayFocusActive ? 'is-replay-focus' : ''}`.trim()}>
                {replayFocusActive ? (
                  <div className="gym-replay-focus-view">{replayPanel}</div>
                ) : (
                  <>
                <div className="gym-run-head">
                  <span className={`gym-run-state ${playing || busy ? 'live' : ''}`}>{stepPaused ? '⏸ paused mid-step' : playing ? '▶ training' : busy ? '▶ stepping' : '⏸ paused'}</span>
                  <span>step <b className="gym-num">{session?.k ?? 0}</b></span>
                  <span><b className="gym-num">{pace > 0 ? pace.toFixed(1) : '—'}</b>/s</span>
                  <span><b className="gym-num">{fmtElapsed(runMs)}</b> elapsed</span>
                  <span><b className="gym-num">{totals.games}</b> games</span>
                  {stepProgress ? <span><b className="gym-num">{stepProgress.gamesDone}/{stepProgress.gamesTotal}</b> step games</span> : null}
                  <span className="gym-run-score" style={{ color: scoreColor(lastScore) }}>{lastScore.toFixed(3)}</span>
                </div>

                {validating || val ? (
                  <div className="gym-val" aria-label="SPRT validation">
                    <div className="gym-val-head">
                      <span className="gym-val-title">SPRT · champion vs shipped</span>
                      <span>H0 <b>+0</b> Elo · H1 <b>+8</b> Elo · α β <b>0.05</b></span>
                      <span style={{ marginLeft: 'auto' }}>game <b className="gym-num">{val?.gameIndex ?? 0}</b></span>
                    </div>
                    <div className="gym-val-stats">
                      <span className="wdl"><b className="w">{val?.w ?? 0}</b> W · <b className="d">{val?.d ?? 0}</b> D · <b className="l">{val?.l ?? 0}</b> L</span>
                      <span>score <b>{(vr?.score ?? 0.5).toFixed(3)}</b></span>
                      <span>Elo <b style={{ color: (vr?.elo ?? 0) > 0 ? '#5ad19a' : (vr?.elo ?? 0) < 0 ? '#e0685f' : '#c6d0dc' }}>{vr ? `${vr.elo >= 0 ? '+' : ''}${vr.elo.toFixed(1)}` : '—'}</b></span>
                      <span>LLR <b>{vr ? vr.llr.toFixed(2) : '0.00'}</b></span>
                    </div>
                    <div className="gym-val-bar-wrap">
                      <div className="gym-val-bar-labels">
                        <span className="rej">◀ reject {vr ? vr.lower.toFixed(2) : ''}</span>
                        <span>LLR</span>
                        <span className="acc">accept {vr ? vr.upper.toFixed(2) : ''} ▶</span>
                      </div>
                      <div className="gym-val-bar">
                        <span className="zero" style={{ left: '50%' }} />
                        <span className={`fill ${llrFrac < 0.5 ? 'neg' : ''}`} style={llrFrac >= 0.5 ? { left: '50%', width: `${(llrFrac - 0.5) * 100}%` } : { left: `${markerPct}%`, width: `${(0.5 - llrFrac) * 100}%` }} />
                        <span className="marker" style={{ left: `${markerPct}%` }} />
                      </div>
                    </div>
                    <div className={`gym-val-verdict ${verdict === 'accept' ? 'accept' : verdict === 'reject' ? 'reject' : 'running'}`}>
                      {verdict === 'accept' ? '✓ ACCEPTED — a real improvement'
                        : verdict === 'reject' ? '✗ REJECTED — not better than shipped'
                        : validating ? '▶ testing… watch it resolve game by game'
                        : '⏸ inconclusive — ran out of games'}
                    </div>
                    {verdict === 'accept' && val?.done ? (
                      <div className="gym-val-adopt">
                        {adoptedActive
                          ? <span className="adopted">✓ adopted for this level — the live enemy plays these weights</span>
                          : <button type="button" className="adopt" onClick={adoptChampion} disabled={!levelId}>Adopt for this level</button>}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <canvas ref={convRef} className="gym-run-curve" width={900} height={200} aria-label="convergence curve" />
                <div className="gym-run-stats">
                  <span className="wdl"><b className="w">{totals.wins}</b> W · <b className="d">{totals.draws}</b> D · <b className="l">{totals.losses}</b> L</span>
                  <span className="gym-hint">draw rate <b className="gym-num" style={{ color: totals.drawRate > 0.8 ? '#e0b24a' : '#c6d0dc' }}>{totals.games ? `${(totals.drawRate * 100).toFixed(0)}%` : '—'}</b></span>
                  {totals.games > 0 && totals.drawRate > 0.8 ? <span className="gym-hint">— mostly draws, so little signal to climb</span> : null}
                </div>
                <div className={`gym-run-detail ${replayPanel ? 'has-replay' : ''}`}>
                  <div className="gym-log-wrap">
                    <table className="gym-log">
                      <thead><tr><th>step</th><th>score</th><th>y⁺</th><th>y⁻</th><th>W-D-L</th><th>c</th><th>a</th></tr></thead>
                      <tbody>
                        {trajDesc.map((p) => (
                          <tr key={p.step} className={p.step === champion.step ? 'is-champ' : ''}>
                            <td>{p.step}</td>
                            <td style={{ color: scoreColor(p.score) }}>{p.score.toFixed(3)}</td>
                            <td>{p.yPlus.toFixed(2)}</td>
                            <td>{p.yMinus.toFixed(2)}</td>
                            <td>{`${p.wins ?? 0}-${p.draws ?? 0}-${p.losses ?? 0}`}</td>
                            <td className="dim">{p.c.toFixed(3)}</td>
                            <td className="dim">{p.a.toFixed(3)}</td>
                          </tr>
                        ))}
                        {traj.length === 0 ? <tr><td colSpan={7} className="gym-log-empty">Hit ▶ run — each step&apos;s numbers stream in here, newest on top.</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                  {replayPanel}
                </div>
                  </>
                )}
              </div>
            ) : mode === 'values' ? (
              <div className={`gym-run ${tdReplayFocusActive ? 'is-replay-focus' : ''}`.trim()} aria-label="Piece-value learner">
                {tdReplayFocusActive ? (
                  <div className="gym-replay-focus-view is-values">{tdReplayPanel}{tdMoveList}</div>
                ) : tdHelp ? (
                  <div className="gym-td-help" aria-label="How the piece-value learner works">
                    <div className="gym-td-help-head">
                      <h3>How the piece-value learner works</h3>
                      <button type="button" className="gym-replay-focus-btn" onClick={() => setTdHelp(false)}>✕ close</button>
                    </div>

                    <h4>What this is</h4>
                    <p>
                      This pane learns <b>this board&apos;s</b> piece values from nothing, by playing itself. The method is
                      <b> afterstate TD(λ)</b> — the TD-Gammon family (Tesauro 1992–95), in the Beal &amp; Smith (1997)
                      &ldquo;learn piece values from random play&rdquo; lineage. The value model is deliberately the smallest thing
                      that can learn piece values: <b>six numbers, one per piece type</b>. A position&apos;s value is
                      σ(w · f), where f counts your living pieces minus the enemy&apos;s per type, read as the probability the
                      player wins. Absolute weights are in log-odds units; the piece-value story is the <b>ratios</b> — hence the
                      pawn&nbsp;=&nbsp;1 column.
                    </p>

                    <h4>One step of the algorithm</h4>
                    <p>
                      ⏭ step deals a game: both sides play 1-ply greedy against the <i>current</i> values, with an ε chance per move
                      of exploring at random (ε anneals from its start to its end across the whole budget — early games are noisy on
                      purpose). When the game ends, its result (win 1, draw ½, loss 0) becomes the target, and TD(λ) walks the error
                      back through the game&apos;s positions. <b>The six weights move once per game, at its end</b> — that is why every
                      number on this pane holds still while a game is in play, and why the Δ column after a step is exactly what the
                      game you just watched taught the learner.
                    </p>

                    <h4>Does it want to run in parallel?</h4>
                    <p>
                      No — as configured it is <b>inherently sequential</b>: game n+1 is played <i>by</i> the values that game n just
                      updated (on-policy self-play). Watching does not force synchrony onto a parallel algorithm; the beat only sets the
                      clock between plies. ▶ run executes the identical chain at full speed — step, watch, and run all produce
                      <b> bit-for-bit the same numbers</b> (that reproducibility is bought by the fixed sequence). Where this family
                      <i>does</i> parallelize: independent <b>seeds</b> — the mean&nbsp;±&nbsp;spread fold at budget completion is exactly
                      that — and large deep-RL systems (A3C, AlphaZero) run many self-play workers against a slightly-stale shared
                      network because their games are expensive and their models huge. Here a game takes milliseconds and the model is
                      six numbers, so parallel workers would buy nothing and cost the reproducibility.
                    </p>

                    <h4>Watching it progress</h4>
                    <ul>
                      <li><b>game n / budget</b> — position in the run; ε and α (learning rate) anneal across it.</li>
                      <li><b>W · D · L</b> — training outcomes. Variety is signal; all-draws means the board is giving the learner no gradient.</li>
                      <li><b>vs random</b> — every 25 games, greedy-with-current-values plays 16 seeded games against a fixed random opponent
                        (0.5 = parity, 1.0 = sweep). The history line under W·D·L is the learning curve as numbers.</li>
                      <li><b>Game ledger</b> — one row per game, newest first: result (cap-length draws marked), plies, the ε it played
                        under, and the exact per-piece weight change its update landed. The run&apos;s accounting, game by game.</li>
                      <li><b>Learned values — live</b> — weights separating from the equal start; Δ is the last displayed update; greyed
                        rows never received signal; pawn&nbsp;=&nbsp;1 ratios are the reading.</li>
                      <li><b>At completion</b> — the run refolds across sibling seeds into mean&nbsp;±&nbsp;spread next to the chess
                        defaults: small spread = a real value of this board, large spread = seed noise.</li>
                    </ul>

                    <h4>What is saved</h4>
                    <p>
                      <b>The run is a document on your account.</b> Everything that matters — games played, the weights, the probe
                      history, the result table and its Kept mark, and any adoption you made — autosaves (about a second after each
                      change) into this level&apos;s account storage, and is restored when you return, on any device. <b>Reset is the
                      only discard</b>: it deletes the run&apos;s document (the level&apos;s adopted AI, if any, survives until you clear
                      it in the audit box). One deliberate exception: a dealt-but-unfinished game is not stored — it re-deals
                      identically from the same seed, so nothing is lost. And determinism still holds underneath: a run&apos;s whole
                      identity is (board, master seed, settings); the same seed replays the same games to the same values.
                    </p>

                    <h4>Becoming a level&apos;s AI — setting and auditing it</h4>
                    <p>
                      The live opponent resolves its evaluation weights per level in three tiers, checked before every enemy reply:
                      your personally <b>adopted</b> weights → the globally <b>shipped</b> weights → the built-in defaults.
                      <b> Setting:</b> the &ldquo;Make it this level&apos;s AI&rdquo; table shows exactly what will be set — the learned
                      pawn&nbsp;=&nbsp;1 values become the evaluation&apos;s piece values (types that never received signal keep the
                      default, marked), and Adopt writes them into the same per-level slot the Training tab&apos;s champion uses — the
                      very next enemy reply plays under them. <b>Auditing:</b> the &ldquo;This level&apos;s live AI&rdquo; box always
                      shows which tier is active, the exact piece values in force next to the defaults, and the adoption record
                      (when, from which seeds, at how many games). &ldquo;clear adoption&rdquo; returns the level to shipped weights
                      or defaults.
                    </p>

                    <h4>Keys</h4>
                    <p className="gym-td-help-keys">
                      <b>Space</b> watch/pause · <b>→</b> step forward · <b>Shift+→</b> ten plies · <b>←</b> back one position
                      (view only — nothing un-learns) · <b>Home/End</b> first/latest
                    </p>
                  </div>
                ) : (
                  <div className={`gym-td-split ${tdReplayPanel ? 'has-stage' : ''}`.trim()}>
                  <div className="gym-td-left">
                <div className="gym-run-head">
                  <span className={`gym-run-state ${tdBusy || tdWalking || tdWatching ? 'live' : ''}`}>
                    {tdSummarizing ? `▶ folding seeds — ${tdSummarizing.done}/${tdSummarizing.total} done`
                      : tdWatching ? '▶ watching'
                      : tdBusy ? '▶ learning'
                      : tdWalking ? '▶ game in play'
                      : tdComplete ? (tdSummary === null && tdStopped ? '⏹ seed fold stopped' : '✓ budget complete')
                      : tdStopped ? '⏹ stopped'
                      : tdStarted ? '⏸ paused'
                      : 'ready'}
                  </span>
                  <span>game <b className="gym-num">{tdGamesDone}</b> / <b className="gym-num">{tdKnobs.games}</b></span>
                  <span>ε <b className="gym-num">{tdSchedule.epsilon.toFixed(3)}</b></span>
                  <span>vs random <b className="gym-num">{tdSess.probe ? tdSess.probe.winRate.toFixed(3) : '—'}</b>{tdSess.probe ? <span className="gym-hint"> @ game {tdSess.probe.game}</span> : null}</span>
                </div>

                {tdDrawsAuthored ? (
                  <p className="gym-td-warn">
                    This level authors chess draw rules (50-move / threefold). The learner scores such a draw
                    only AFTER the move commits — its 1-ply lookahead can&apos;t see the draw coming — so play near
                    draw boundaries, and the values learned from it, are approximate on this board.
                  </p>
                ) : null}

                <div className="gym-run-stats">
                  <span className="wdl"><b className="w">{tdSess.train.outcomes.playerWins}</b> W · <b className="d">{tdSess.train.outcomes.draws}</b> D · <b className="l">{tdSess.train.outcomes.enemyWins}</b> L</span>
                  <span className="gym-hint">training-game outcomes (exploration on) — player wins / draws / enemy wins</span>
                </div>

                {tdProbeLog.length ? (
                  <div className="gym-td-probelog" aria-label="Probe history">
                    <span className="h">vs random over the run — greedy with the current values, 0.5 = parity</span>
                    <div className="rows">
                      {tdProbeLog.map((p) => (
                        <span key={p.game}>@{p.game} <b className="gym-num">{p.winRate.toFixed(3)}</b></span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {tdLedger.length ? (
                  <div className="gym-td-ledger" aria-label="Game ledger">
                    <h3>Game ledger <span className="gym-hint">— one row per game, newest first; Δ = what that game&apos;s update moved</span></h3>
                    <div className="gym-td-table-wrap gym-td-ledger-wrap">
                      <table className="gym-td-table">
                        <thead><tr><th>#</th><th>result</th><th>plies</th><th>ε</th><th>Δ P</th><th>Δ N</th><th>Δ B</th><th>Δ R</th><th>Δ Q</th><th>Δ K</th></tr></thead>
                        <tbody>
                          {[...tdLedger].reverse().map((row) => (
                            <tr key={row.game}>
                              <td className="gym-num">{row.game}</td>
                              <td className={row.winner === 'player' ? 'w' : row.winner === 'draw' ? 'd' : 'l'}>
                                {row.winner === 'player' ? 'win' : row.winner === 'draw' ? (row.plies >= (tdKnobs.maxPlies || Infinity) ? 'draw (cap)' : 'draw') : 'loss'}
                              </td>
                              <td className="gym-num">{row.plies}</td>
                              <td className="gym-num">{row.epsilon.toFixed(2)}</td>
                              {PLAYABLE_PIECE_TYPES.map((t) => {
                                const d = tdDeltaCell(row.delta[t]);
                                return <td key={t} className={`delta ${d.cls}`}>{d.txt}</td>;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                <div>
                  <h3>Learned values — live</h3>
                  <div className="gym-weights gym-td-weights">
                    <div className="k h">piece</div><div className="v h">weight (logit)</div>
                    <div className="d h">Δ<InfoTip label="delta column">What the last displayed update moved each weight by — one game when stepping; during a long Run, the games since the previous progress frame. Single-game moves are tiny (~0.0001–0.001), which is why this column carries 4 decimals.</InfoTip></div>
                    <div className="v h">pawn = 1</div>
                    {PLAYABLE_PIECE_TYPES.map((t) => {
                      const d = tdDeltaCell(tdDelta ? tdDelta[t] : undefined);
                      const na = tdStarted && tdUntouched(tdSess.train.weights[t]);
                      return (
                        <Fragment key={t}>
                          <div className="k">{t}</div>
                          <div className={`v${na ? ' na' : ''}`}>{tdSess.train.weights[t].toFixed(3)}</div>
                          <div className={`d ${d.cls}`}>{d.txt}</div>
                          <div className="v">{tdRel ? tdRel[t].toFixed(2) : '—'}</div>
                        </Fragment>
                      );
                    })}
                  </div>
                  {!tdRel ? <p className="gym-hint">{tdHasPawns ? 'Pawn weight too small to normalize by yet — raw logit weights; the RATIOS are the piece-value reading.' : 'No pawns on this board — raw logit weights; the RATIOS are the piece-value reading.'}</p> : null}
                  {tdStarted && PLAYABLE_PIECE_TYPES.some((t) => tdUntouched(tdSess.train.weights[t])) ? (
                    <p className="gym-hint">greyed = still exactly at the initial weight — this board has given that piece type no learning signal yet (never fielded, or its counts never went unbalanced).</p>
                  ) : null}
                </div>

                {tdSummary ? (
                  <div className="gym-td-results" aria-label="Learned values vs chess defaults">
                    <h3>Result — learned mean ± spread over {tdSummary.perSeed.length} seed{tdSummary.perSeed.length === 1 ? '' : 's'}, next to the chess defaults{tdKept ? ' · KEPT' : ''}</h3>
                    <div className="gym-td-table-wrap">
                      <table className="gym-td-table">
                        <thead><tr><th>piece</th><th>learned (logit)</th><th>± spread</th><th>pawn = 1</th><th>chess default</th></tr></thead>
                        <tbody>
                          {PLAYABLE_PIECE_TYPES.map((t) => {
                            const na = tdUntouched(tdSummary.mean[t]) && tdSummary.spread[t] === 0;
                            return (
                              <tr key={t} className={na ? 'na' : ''}>
                                <td>{t}</td>
                                <td>{tdSummary.mean[t].toFixed(3)}</td>
                                <td>± {tdSummary.spread[t].toFixed(3)}</td>
                                <td>{tdSummaryRel ? tdSummaryRel[t].toFixed(2) : '—'}</td>
                                <td>{DEFAULT_EVAL_WEIGHTS.pieceValues[t]}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="gym-hint">seeds {tdSummary.seeds.join(', ')} — spread is across independent runs (big spread = seed noise, not a real value). {tdSummaryRel
                      ? <>Chess defaults are pawn-relative; compare them against the pawn&nbsp;=&nbsp;1 column.</>
                      : <>Chess defaults are pawn-relative and this board fields no pawns, so compare RATIOS — learned values against each other vs defaults against each other.</>}</p>
                    {PLAYABLE_PIECE_TYPES.some((t) => tdUntouched(tdSummary.mean[t]) && tdSummary.spread[t] === 0) ? (
                      <p className="gym-hint">greyed rows never moved off the initial weight in ANY seed — this board gave that piece type no learning signal; the number is noise, not a learned value.</p>
                    ) : null}
                    {!tdKept ? (
                      <div className="gym-td-keep">
                        <button type="button" className="keep" onClick={() => setTdKept(true)}>Keep result</button>
                        <button type="button" className="discard" onClick={() => { setTdSummary(null); setTdKept(false); setTdDiscarded(true); }}>Discard</button>
                        <span className="gym-hint">Keep marks this result in the saved run; Discard clears the table (the run&apos;s numbers stay). The whole run autosaves to your account either way.</span>
                      </div>
                    ) : (
                      <p className="gym-hint">Kept — saved with the run on your account; Reset discards the run.</p>
                    )}
                  </div>
                ) : null}

                {tdAdoptPreview ? (
                  <div className="gym-td-adopt" aria-label="Make it this level's AI">
                    <h3>Make it this level&apos;s AI</h3>
                    <div className="gym-td-table-wrap">
                      <table className="gym-td-table">
                        <thead><tr><th>piece</th><th>learned (pawn = 1)</th><th>will set</th><th>current default</th></tr></thead>
                        <tbody>
                          {tdAdoptPreview.map((row) => (
                            <tr key={row.type} className={row.keptReason ? 'na' : ''}>
                              <td>{row.type}</td>
                              <td>{row.learned.toFixed(2)}</td>
                              <td>{row.adopted}{row.keptReason ? ` (${row.keptReason})` : ''}</td>
                              <td>{DEFAULT_EVAL_WEIGHTS.pieceValues[row.type]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="gym-hint">source: {tdSummary
                      ? <>mean of {tdSummary.perSeed.length} seeds at {tdGamesDone} games</>
                      : <>live weights at game {tdGamesDone} (the seed fold at budget completion is the steadier read)</>}. Adopting replaces any previous adoption on this level, including one from the Training tab.</p>
                    <div className="gym-td-keep">
                      <button type="button" className="keep" onClick={tdAdopt}>Adopt as this level&apos;s AI</button>
                    </div>
                  </div>
                ) : null}

                {level ? (
                  <div className="gym-td-liveai" aria-label="This level's live AI">
                    <h3>This level&apos;s live AI</h3>
                    <p className="gym-hint">resolved before every enemy reply: your adoption → globally shipped → built-in defaults</p>
                    <p className="gym-td-liveai-tier">active: <b>{tdLiveAi.tier}</b></p>
                    <p className="gym-td-liveai-vals">
                      {PLAYABLE_PIECE_TYPES.map((t) => `${t.charAt(0).toUpperCase()} ${Math.round(tdLiveAi.pieceValues[t] * 100) / 100}`).join(' · ')}
                    </p>
                    {tdLiveAi.tier !== 'built-in defaults' ? (
                      <p className="gym-td-liveai-vals dim">defaults: {PLAYABLE_PIECE_TYPES.map((t) => `${t.charAt(0).toUpperCase()} ${DEFAULT_EVAL_WEIGHTS.pieceValues[t]}`).join(' · ')}</p>
                    ) : null}
                    {tdLiveAi.adoption ? (
                      <p className="gym-hint">adopted {new Date(tdLiveAi.adoption.at).toLocaleString()} — {tdLiveAi.adoption.source === 'seed-mean' ? `mean of seeds ${tdLiveAi.adoption.seeds.join(', ')}` : `live weights (seed ${tdLiveAi.adoption.seeds.join(', ')})`} at {tdLiveAi.adoption.fromGames} games</p>
                    ) : null}
                    {tdLiveAi.hasAdoption ? (
                      <div className="gym-adopt-row">
                        <button type="button" onClick={tdClearAdoption}>clear adoption</button>
                        <span className="gym-hint">the level falls back to shipped weights or defaults</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {tdError ? <p className="gym-error">Value learner failed: {tdError}</p> : null}
                {!tdStarted && !tdBusy && !tdWalking && !tdWatching ? <p className="gym-hint">Every piece starts at the same weight. ⏭ step always advances the algorithm one step: first press deals a training game, each press after plays one ply, and the weight update lands on the last one. ▶ watch presses step for you, one beat at a time; ▶ run plays the whole budget at full speed.</p> : null}
                  </div>
                  {tdReplayPanel ? <div className="gym-td-right">{tdReplayPanel}</div> : null}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </section>

      <aside className="tileset-view-controls gym-controls" aria-label="Gym controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="gym-hint">{level ? `Training: ${level.name} (${MODE_NAME[level.objective]})` : 'No level — pick one in the Catalog.'}</p>
            {level && loadingBooks ? <p className="gym-hint">Loading your books…</p> : null}
            {level && signedIn === false ? <p className="gym-hint">Sign in to save opening books to your account.</p> : null}

            {level && mode !== 'values' ? (
              <div className="gym-bookmgr">
                <label className="gl-field">Opening book
                  <select value={activeId ?? ''} onChange={(e) => onSelectBook(Number(e.target.value))} disabled={blob.books.length === 0}>
                    {blob.books.length === 0 ? <option value="">— none yet —</option> : null}
                    {blob.books.map((b) => (
                      <option key={b.id} value={b.id}>{`Book #${b.id} — size ${b.settings.size} · plies ${b.settings.plies} · variety ${b.settings.variety.toFixed(2)}`}</option>
                    ))}
                  </select>
                </label>
                <div className="gym-bookmgr-btns">
                  <button type="button" className="new" onClick={onNewBook}>+ New Opening Book</button>
                  <button type="button" className="del" onClick={onDeleteBook} disabled={activeId === undefined}>Delete</button>
                </div>
                <span className="gym-count">{blob.books.length} book{blob.books.length === 1 ? '' : 's'} for this level (that many regenerations).</span>
              </div>
            ) : null}

            {mode === 'book' && level ? (
              activeBook ? (
                <div className="gym-gen">
                  <h3>Generate positions</h3>
                  <label className="gl-field"><span>size (positions)<InfoTip label="size (positions)">How many opening positions this book holds — one per seed. More gives a broader set to train and test across (and takes longer to generate).</InfoTip></span>
                    <input type="number" min={1} max={64} value={settings.size} onChange={(e) => setSettings({ size: Math.max(1, Number(e.target.value) || 1) })} />
                  </label>
                  <label className="gl-field"><span>opening plies<InfoTip label="opening plies">How many half-moves to wander from the level's fixed start before saving the position. 0 = every seed lands on the identical board; a few plies makes them diverge. More = more different (and likelier to reach an odd spot).</InfoTip></span>
                    <input type="number" min={0} max={12} value={settings.plies} onChange={(e) => setSettings({ plies: Math.max(0, Number(e.target.value) || 0) })} />
                  </label>
                  <label className="gl-field"><span>seed base<InfoTip label="seed base">The first random seed; position i uses seed base + i. A seed is a stable handle — the same seed always rebuilds the same opening, so you can return to it. Change it for a fresh set.</InfoTip></span>
                    <input type="number" min={1} value={settings.seedBase} onChange={(e) => setSettings({ seedBase: Math.max(1, Number(e.target.value) || 1) })} />
                  </label>
                  <SliderRow label={<>variety <b className="gym-num">{settings.variety.toFixed(2)}</b><InfoTip label="variety">How the wandering moves are chosen. Low = pick among the AI&apos;s few best moves (sane, small divergence). High = any legal move (wild, big divergence).</InfoTip></>} value={settings.variety} set={(v) => setSettings({ variety: v })} min={0} max={1} step={0.05} nudge={0.05} dflt={DEFAULT_BOOK_SETTINGS.variety} />
                  <button type="button" className="gym-gen-btn" onClick={generate} disabled={!ready || generating}>
                    {generating ? 'Generating…' : posCount > 0 ? 'Regenerate' : 'Generate'}
                  </button>
                  {!ready ? <p className="gym-hint">Preparing engine…</p> : null}
                  <p className="gym-hint" style={{ marginTop: 6 }}>Each seed walks a few random legal opening plies from the level start, so seeds diverge into slightly-imbalanced boards to train on.</p>
                </div>
              ) : (
                <p className="gym-hint">Make an opening book above to generate and inspect positions.</p>
              )
            ) : null}

            {mode === 'train' && level ? (
              <>
                <label className="gl-field"><span>search depth<InfoTip label="search depth">How many moves ahead the AI looks while playing the training games. Deeper = stronger but slower play, so each step takes longer.</InfoTip></span>
                  <input type="number" min={1} max={5} value={depth} onChange={(e) => setDepth(Math.max(1, Number(e.target.value) || 1))} />
                </label>

                <div className="gym-run-row">
                  <button type="button" className={runButtonClass} onClick={togglePlay} disabled={(!canTrain && !stepPaused) || generating || validating}>{runButtonLabel}</button>
                  <button type="button" onClick={stepOnce} disabled={!canTrain || busy || playing || stepPaused}>⏭ step</button>
                </div>
                {!ready ? <p className="gym-hint">Preparing…</p>
                  : !activeBook ? <p className="gym-hint">No active book.</p>
                  : activeBook.positions.length === 0 ? <p className="gym-hint">This book has no positions — generate them in step 1 first.</p>
                  : stepPaused && stepProgress ? <p className="gym-hint">Paused after {stepProgress.gamesDone}/{stepProgress.gamesTotal} games. Resume to finish this step; no point is committed until all games finish.</p>
                  : busy && !playing ? <p className="gym-hint">Playing this step's games…</p> : null}
                {stepProgress ? (
                  <div className="gym-step-progress" aria-label="Training step progress">
                    <span className="bar"><i style={{ width: `${stepProgressPct}%` }} /></span>
                    <span className="label">{stepProgressLabel}</span>
                  </div>
                ) : null}
                {busy || stepProgressGames.length ? (
                  <div className="gym-live-games-wrap" aria-label="Completed games in this step" aria-live="polite">
                    <table className="gym-live-games">
                      <thead><tr><th>#</th><th>phase</th><th>pos</th><th>A side</th><th>result</th><th>plies</th></tr></thead>
                      <tbody>
                        {liveStepGames.length ? liveStepGames.map((progress, i) => (
                          <tr
                            key={`${progress.gamesDone}-${progress.phase}-${progress.game.bookIndex}-${progress.game.candidateSide}-${progress.game.seed}`}
                            className={i === 0 ? 'is-current' : ''}
                            title={`seed ${progress.game.seed}, winner ${progress.game.record.winner}, ${progress.game.record.turnsElapsed} rounds`}
                          >
                            <td>{progress.gamesDone}</td>
                            <td>{progress.phase}</td>
                            <td>#{progress.game.bookIndex + 1}</td>
                            <td>{progress.game.candidateSide}</td>
                            <td className={progress.outcome}>{progress.outcome}</td>
                            <td>{progress.game.record.plies}</td>
                          </tr>
                        )) : <tr><td colSpan={6} className="gym-live-games-empty">First game in progress</td></tr>}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {gymError ? <p className="gym-error">Training worker failed: {gymError}</p> : null}

                <h3>Champion</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }} className="gym-num">
                  <span className="gym-hint">score</span><span>{champion.score.toFixed(3)}</span>
                </div>
                <div className="gym-hint" style={{ marginBottom: 4 }}>how established</div>
                <div className="gym-estab">
                  <span className="gym-meter"><i style={{ width: estabPct + '%' }} /></span>
                  <span className="gym-hint gym-num">{champion.step < 0 ? 'no gain yet' : `+${established} since best`}</span>
                </div>

                <h3>Latest step games</h3>
                {latestStepGames.length ? (
                  <div className="gym-latest-games-wrap">
                    <table className="gym-latest-games">
                      <thead><tr><th>probe</th><th>pos</th><th>A side</th><th>outcome</th><th>plies</th></tr></thead>
                      <tbody>
                        {latestStepGames.map((game, i) => {
                          const outcome = gameOutcome(game);
                          return (
                            <tr
                              key={`${game.probe}-${game.bookIndex}-${game.candidateSide}-${game.seed}-${i}`}
                              className={i === selectedLatestGameIndex ? 'is-sel' : ''}
                              title={`seed ${game.seed}, winner ${game.record.winner}, ${game.record.turnsElapsed} rounds`}
                              role="button"
                              tabIndex={0}
                              aria-selected={i === selectedLatestGameIndex}
                              onClick={() => selectLatestGame(i)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  selectLatestGame(i);
                                }
                              }}
                            >
                              <td>{game.probe === 'plus' ? 'theta+' : 'theta-'}</td>
                              <td>#{game.bookIndex + 1}</td>
                              <td>{game.candidateSide}</td>
                              <td className={outcome}>{outcome}</td>
                              <td>{game.record.plies}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="gym-hint">Run one local step to retain its inspectable game records.</p>
                )}

                <h3>Validate <span className="gym-hint">(SPRT vs shipped)</span></h3>
                <button type="button" className="gym-val-btn" onClick={validateChampion}
                  disabled={!canTrain || !hasChampion || validating || playing || busy || stepPaused}>
                  {validating ? 'Validating…' : 'Validate champion vs shipped'}
                </button>
                {!hasChampion ? <p className="gym-hint">Train until a step beats the shipped weights — then validate that champion.</p>
                  : validating ? <p className="gym-hint">Playing the test games — watch the verdict resolve in the main view.</p>
                  : <p className="gym-hint">Plays candidate vs shipped game-by-game until SPRT decides ACCEPT or REJECT.</p>}

                <h3>Live enemy weights <span className="gym-hint">(this level)</span></h3>
                <div className="gym-adopt-row">
                  <span className={`badge ${adoptedActive ? 'on' : 'off'}`}>{adoptedActive ? 'ADOPTED' : 'shipped'}</span>
                  <span className="gym-hint">{adoptedActive ? 'the played opponent uses the adopted champion' : 'the played opponent uses the shipped defaults'}</span>
                  {adoptedActive ? <button type="button" onClick={unadopt}>Revert</button> : null}
                </div>

                <h3>Eval weights <span className="gym-hint">(champion vs shipped)</span></h3>
                <div className="gym-weights">
                  {PARAM_LABELS.map((lab, i) => {
                    const d = champVec[i] - REF_VEC[i];
                    const cls = d > 0.001 ? 'up' : d < -0.001 ? 'dn' : 'z';
                    const txt = Math.abs(d) < 0.001 ? '—' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(3)}`;
                    return (<Fragment key={lab}><div className="k">{lab}</div><div className="v">{champVec[i].toFixed(2)}</div><div className={`d ${cls}`}>{txt}</div></Fragment>);
                  })}
                </div>
              </>
            ) : null}

            {mode === 'values' && level ? (
              <>
                <div className="gym-run-row">
                  <button type="button" onClick={tdAdvance} disabled={!tdReady || tdBusy || (tdComplete && !tdWalking)}
                    title={tdWalking ? 'Play the next ply — the update lands on the final one' : 'Deal the next training game; each press after plays one ply'}>⏭ step</button>
                  <button type="button" onClick={() => tdSend(Math.max(1, tdStepN))} disabled={!tdReady || tdBusy || tdComplete}
                    title="Play N whole games at full speed">⏭ games</button>
                  <input className="gym-td-stepn-input" type="number" min={1} max={100000} value={tdStepN} list="gym-td-step-presets"
                    onChange={(e) => setTdStepN(Math.max(1, Math.floor(Number(e.target.value) || 1)))} aria-label="Games per batch step" />
                  <datalist id="gym-td-step-presets">
                    {[1, 2, 5, 10, 25, 50, 100, 1000].map((n) => <option key={n} value={n} />)}
                  </datalist>
                </div>
                <div className="gym-run-row">
                  <button type="button" className="play gym-td-watch-btn" onClick={() => { tdWatchScopeRef.current = 'run'; setTdWatching((w) => !w); }} disabled={!tdReady || (tdComplete && !tdWalking)}
                    title={tdWatching ? 'Pause — the game in play keeps its place' : 'The system plays by itself, one step per beat: each ply on the board, the update landing at every game’s end, game after game, until you pause'}>
                    {tdWatching ? '⏸ pause' : '▶ watch'}
                  </button>
                  <button type="button" onClick={() => { setTdWatching(false); tdSend('run'); }} disabled={!tdReady || tdBusy || (tdComplete && tdSummary !== null)}
                    title="Full speed, no animation — plays the remaining budget in seconds; same numbers, bit for bit">▶ run</button>
                  <button type="button" onClick={() => { setTdWatching(false); tdStop(); }} disabled={!tdBusy && !tdWatching}>⏹ stop</button>
                  <button type="button" onClick={tdDiscardRun} disabled={tdBusy || (!tdStarted && tdSummary === null && !tdStopped && !tdError && !tdWalking)}
                    title="Discard this run and its saved document (the level's adopted AI, if any, stays until cleared in the audit box)">↺ reset</button>
                </div>
                <label className="gym-td-speed" title="Watch tempo — steps per second; Max is a step every frame">
                  <span>speed</span>
                  <input type="range" min={0} max={100} value={tdBeatToSlider(tdBeatMs)}
                    onChange={(e) => setTdBeatMs(tdSliderToBeat(Number(e.target.value)))} aria-label="Watch tempo" />
                  <b className="gym-num">{tdBeatReadout(tdBeatMs)}</b>
                </label>
                <div className="gym-run-row">
                  <button type="button" onClick={() => setTdHelp((h) => !h)} aria-pressed={tdHelp}
                    title="What this algorithm is, how to read its progress, what is saved, and how it becomes a level's AI">? how this works</button>
                </div>
                {!tdReady ? <p className="gym-hint">Preparing learner…</p>
                  : tdWatching ? <p className="gym-hint">Watching — the system plays by itself, one step per beat; each game&apos;s update lands as it ends. Pause (or ⏹) any time; nothing is ever half-applied.</p>
                  : tdBusy ? <p className="gym-hint">{tdSummarizing ? 'Folding sibling seeds into the mean ± spread table…' : 'Playing training games — Stop lands between games, nothing half-applied.'}</p>
                  : tdWalking ? <p className="gym-hint">Game {tdPending?.game} is in play — each ⏭ step plays one ply (⏩ to end finishes it); its weight update lands when the game ends. ⏭ games / Run consume it as the batch&apos;s first game; Reset discards it unlearned.</p>
                  : tdComplete && tdSummary === null && tdDiscarded ? <p className="gym-hint">Result discarded — the run&apos;s numbers stay. Run recomputes the mean ± spread table; Reset starts a new run.</p>
                  : tdComplete && tdSummary === null ? <p className="gym-hint">Budget done but the seed fold was stopped — Run finishes the mean ± spread table, or Reset.</p>
                  : tdComplete ? <p className="gym-hint">Budget complete. Keep or Discard the result in the main pane; Reset starts a new run.</p>
                  : tdStarted ? <p className="gym-hint">Paused at game {tdGamesDone}. Settings are frozen mid-run (the schedules anneal over the whole budget) — Reset to change them.</p>
                  : null}

                <h3>Learner settings</h3>
                {/* ADR-0057 §4: every non-slider tuning knob carries its own permanent ↺
                    back to the committed baseline (ctlReset — the canonical primitive),
                    plus the blanket "↺ all settings" below. Master seed is VIEW state (the
                    ADR's named exemption), so it carries none and the blanket keeps it. */}
                <fieldset className="gym-td-knobs" disabled={tdKnobsFrozen}>
                  <label className="gl-field"><span>games budget<InfoTip label="games budget">How many self-play training games one run plays. The exploration (ε) and learning-rate (α) schedules anneal across THIS whole budget, so it is fixed once a run starts — Reset to change it.</InfoTip></span>
                    <div className="pages-ctl-row">
                      <input type="number" min={1} max={100000} value={tdKnobs.games} onChange={(e) => setTdKnob({ games: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                      {ctlReset(() => setTdKnob({ games: TD_KNOB_DEFAULTS.games }))}
                    </div>
                  </label>
                  <label className="gl-field"><span>master seed<InfoTip label="master seed">Seeds every training game deterministically — the same seed and settings replay the identical run, game for game.</InfoTip></span>
                    <input type="number" min={1} value={tdKnobs.seed} onChange={(e) => setTdKnob({ seed: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                  </label>
                  <label className="gl-field"><span>seeds for ± spread<InfoTip label="seeds for ± spread">How many independent runs the final table averages. The live run is the first of them (the master seed itself); the rest replay the same budget from derived sibling seeds after it completes, giving mean ± spread — is a value real, or seed noise?</InfoTip></span>
                    <div className="pages-ctl-row">
                      <input type="number" min={1} max={16} value={tdKnobs.seedCount} onChange={(e) => setTdKnob({ seedCount: Math.max(1, Math.min(16, Math.floor(Number(e.target.value) || 1))) })} />
                      {ctlReset(() => setTdKnob({ seedCount: TD_KNOB_DEFAULTS.seedCount }))}
                    </div>
                  </label>
                  <label className="gl-field"><span>update rule<InfoTip label="update rule">TD(λ) bootstraps each position toward the next one&apos;s value — the TD-Gammon update. Monte-Carlo regresses every position straight to the final outcome (the λ = 1 limit), kept as an A/B lever.</InfoTip></span>
                    <div className="pages-ctl-row">
                      <select value={tdKnobs.monteCarlo ? 'mc' : 'td'} onChange={(e) => setTdKnob({ monteCarlo: e.target.value === 'mc' })}>
                        <option value="td">TD(λ) — bootstrapped</option>
                        <option value="mc">Monte-Carlo — outcome only</option>
                      </select>
                      {ctlReset(() => setTdKnob({ monteCarlo: TD_KNOB_DEFAULTS.monteCarlo }))}
                    </div>
                  </label>
                  <SliderRow label={<>λ trace decay <b className="gym-num">{tdKnobs.lambda.toFixed(2)}</b><InfoTip label="lambda trace decay">How far credit for a result reaches back along the game. 0 = only the previous position learns; 1 ≈ Monte-Carlo (the whole game regresses to the outcome). Ignored by the Monte-Carlo rule.</InfoTip></>}
                    value={tdKnobs.lambda} set={(v) => setTdKnob({ lambda: v })} min={0} max={1} step={0.01} nudge={0.05} dflt={DEFAULT_TRAIN_OPTIONS.lambda} />
                  <SliderRow label={<>ε start <b className="gym-num">{tdKnobs.epsStart.toFixed(2)}</b><InfoTip label="epsilon start">Exploration at game 0: the chance a move is uniformly random instead of greedy. Anneals linearly to ε end by the last game — noisy early, sharp late.</InfoTip></>}
                    value={tdKnobs.epsStart} set={(v) => setTdKnob({ epsStart: v })} min={0} max={1} step={0.01} nudge={0.05} dflt={DEFAULT_TRAIN_OPTIONS.epsilon.start} />
                  <SliderRow label={<>ε end <b className="gym-num">{tdKnobs.epsEnd.toFixed(2)}</b><InfoTip label="epsilon end">Exploration at the last game of the budget.</InfoTip></>}
                    value={tdKnobs.epsEnd} set={(v) => setTdKnob({ epsEnd: v })} min={0} max={1} step={0.01} nudge={0.05} dflt={DEFAULT_TRAIN_OPTIONS.epsilon.end} />
                  <SliderRow label={<>α start <b className="gym-num">{tdKnobs.alphaStart.toFixed(3)}</b><InfoTip label="alpha start">Learning rate at game 0: how hard each game moves the weights. Anneals linearly to α end — big early steps, fine late ones.</InfoTip></>}
                    value={tdKnobs.alphaStart} set={(v) => setTdKnob({ alphaStart: v })} min={0} max={0.5} step={0.005} nudge={0.01} dflt={DEFAULT_TRAIN_OPTIONS.alpha.start} />
                  <SliderRow label={<>α end <b className="gym-num">{tdKnobs.alphaEnd.toFixed(3)}</b><InfoTip label="alpha end">Learning rate at the last game of the budget.</InfoTip></>}
                    value={tdKnobs.alphaEnd} set={(v) => setTdKnob({ alphaEnd: v })} min={0} max={0.5} step={0.005} nudge={0.01} dflt={DEFAULT_TRAIN_OPTIONS.alpha.end} />
                  <label className="gl-field"><span>ply cap<InfoTip label="ply cap">Hard game-length cap; a training game that hits it scores as a draw.</InfoTip></span>
                    <div className="pages-ctl-row">
                      <input type="number" min={10} max={400} value={tdKnobs.maxPlies} onChange={(e) => setTdKnob({ maxPlies: Math.max(10, Math.min(400, Math.floor(Number(e.target.value) || 10))) })} />
                      {ctlReset(() => setTdKnob({ maxPlies: TD_KNOB_DEFAULTS.maxPlies }))}
                    </div>
                  </label>
                  <label className="gl-field"><span>initial weight<InfoTip label="initial weight">Every piece type starts at this same small weight — &quot;everything starts equal&quot;, scaled so the value starts near ½ and can learn in both directions.</InfoTip></span>
                    <div className="pages-ctl-row">
                      <input type="number" min={0.01} max={1} step={0.01} value={tdKnobs.initialWeight} onChange={(e) => setTdKnob({ initialWeight: Math.max(0.01, Math.min(1, Number(e.target.value) || DEFAULT_TRAIN_OPTIONS.initialWeight)) })} />
                      {ctlReset(() => setTdKnob({ initialWeight: TD_KNOB_DEFAULTS.initialWeight }))}
                    </div>
                  </label>
                  <label className="gl-field"><span>probe every K games<InfoTip label="probe every K games">Every K training games, freeze the weights and score them against a fixed random opponent — the honest &quot;is it getting better?&quot; number in the header. 0 = probe only once, at the end of the budget (set probe games to 0 to never probe).</InfoTip></span>
                    <div className="pages-ctl-row">
                      <input type="number" min={0} max={10000} value={tdKnobs.probeEvery} onChange={(e) => setTdKnob({ probeEvery: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                      {ctlReset(() => setTdKnob({ probeEvery: TD_KNOB_DEFAULTS.probeEvery }))}
                    </div>
                  </label>
                  <label className="gl-field"><span>probe games<InfoTip label="probe games">Games per probe — more games give a steadier number but a slower probe. 0 = never probe.</InfoTip></span>
                    <div className="pages-ctl-row">
                      <input type="number" min={0} max={200} value={tdKnobs.probeGames} onChange={(e) => setTdKnob({ probeGames: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                      {ctlReset(() => setTdKnob({ probeGames: TD_KNOB_DEFAULTS.probeGames }))}
                    </div>
                  </label>
                  {/* ADR-0057's blanket reset beside the per-control ↺s — every tuning
                      knob back to the committed baseline in one press. Master seed is
                      view state, so it survives. */}
                  <div className="gym-run-row">
                    <button type="button"
                      disabled={(Object.keys(TD_KNOB_DEFAULTS) as Array<keyof TdKnobs>).every((k) => k === 'seed' || tdKnobs[k] === TD_KNOB_DEFAULTS[k])}
                      onClick={() => setTdKnobs((k) => ({ ...TD_KNOB_DEFAULTS, seed: k.seed }))}>
                      ↺ all settings
                    </button>
                  </div>
                </fieldset>
              </>
            ) : null}
          </div>
        </section>
      </aside>
    </>
  );
}
