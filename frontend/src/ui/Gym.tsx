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
import { SliderRow } from './dressing/SliderRow';
import { createFromLevel } from '../game/setup';
import { PARAM_LABELS, encodeWeights, decodeWeights } from '../game/tuning';
import { replayStates, type GameRecord } from '../game/selfplay';
import { DEFAULT_EVAL_WEIGHTS } from '../core/ai';
import { stateAtPosition, type BookPosition, type OpeningBookSettings } from '../game/openingBook';
import type { GymRequest, GymResponse } from '../lab/gymWorker';
import type { StepProgress } from '../lab/gymStep';
import type { ValState } from '../lab/validate';
import { setAdoptedWeights, readAdoptedVector } from '../game/adoptedWeights';
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

function gameMoveLabel(record: GameRecord, index: number): string {
  const m = record.moves[index];
  if (!m) return 'Book position';
  const capture = m.move.capture ? ` x${m.move.capture}` : '';
  return `${index + 1}. ${pieceLabel(m.pieceId)} (${m.from.x},${m.from.y})->(${m.move.x},${m.move.y})${capture}`;
}

/** The gym bench for one level: opening-book management + inspection (Stage 1) and
 * retained-session SPSA training over the active book (Stage 2). Each book keeps its
 * own training session, so switching books restores champion + curve exactly. */
export function GymViewer({ levelId, header }: { levelId?: string; header?: ReactNode }): ReactElement {
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
  const [mode, setMode] = useState<'book' | 'train' | 'cluster'>('book');
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
    setMode('book');
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
  useEffect(() => {
    if (mode !== 'train' || !selectedLatestGame) setReplayFocus(false);
  }, [mode, selectedLatestGame]);
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

            {level ? (
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
          </div>
        </section>
      </aside>
    </>
  );
}
