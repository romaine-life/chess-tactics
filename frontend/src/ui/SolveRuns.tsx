// Cluster board-solver panel (ADR-0069 §5) — the "Run" tab. Cloned from ui/ClusterRuns.tsx
// but the solver's output is a PROVEN GAME VALUE + a (partial) tablebase, not an eval vector
// to adopt, so the whole adopt/ship machinery (onAdopt, shipAiWeights, verdictLabel, isAdmin,
// champTheta, canAdopt) is dropped — a prop-shape change, not a block delete (F5). Before
// launch it shows the instant FeasibilityReport (estimateFeasibility on the selected level) as
// the pre-commit read; a run streams SolveProgress (phase, coverage, proven census, tightening
// rootBounds) which this polls; Cancel deletes the Job but keeps the partial body.
//
// Also exports SolveCatalog + SolveViewer, the Studio catalog wrappers (mirroring Gym's
// GymCatalog/GymViewer) so the Run tab is CLICK-REACHABLE (ADR-0058) from the Studio.

import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useCampaigns } from '../campaign/store';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { MODE_NAME } from '../core/objectives';
import type { Level } from '../core/level';
import { LevelThumbnail } from '../render/LevelThumbnail';
import { estimateFeasibility } from '../core/solver';
import type { FeasibilityReport, SolveMode } from '../core/solver';
import {
  launchSolveRun, listSolveRuns, getSolveRun, cancelSolveRun,
  type SolveRunSummary, type SolveRunDoc,
} from '../net/solveRuns';
import { SolverStepper, type SolverTab } from './solver/SolverStepper';

const shortId = (id: string): string => id.slice(0, 8);
const fmtTime = (iso: string): string => { try { return new Date(iso).toLocaleTimeString(); } catch { return iso; } };
const fmtInt = (n: number | undefined): string => (n == null ? '—' : Math.round(n).toLocaleString());
const fmtBytes = (n: number | undefined): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
};

// Default launch budget (contract SolveBounds: ms + states + bytes). maxMemoryBytes is set
// UNDER the 12Gi solver-container limit so the worker's self-check trips before an OOM-kill.
const DEFAULT_BOUNDS = { wallClockMs: 300_000, maxStates: 50_000_000, maxMemoryBytes: 8 * 2 ** 30 };

const SOLVE_RUNS_CSS = `
.cluster-runs { display:flex; flex-direction:column; gap:10px; padding:14px 16px; color:#e7ebf0; font:13px/1.45 system-ui,sans-serif; }
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
.solve-feasibility { border:1px solid #29323f; background:#12181f; border-radius:6px; padding:10px; margin:0; }
.solve-feasibility h4 { margin:0 0 6px; font-size:12px; color:#93a0b0; font-weight:600; }
.solve-feasibility .v { text-transform:uppercase; font-size:11px; letter-spacing:.04em; font-weight:700; }
.solve-feasibility .v.solvable { color:#8fce9b; }
.solve-feasibility .v.hard { color:#d9b871; }
.solve-feasibility .v.infeasible { color:#e2a0a0; }
.solve-feasibility .notes { color:#7c8a9c; font-size:11px; margin:4px 0 0; }
.solve-feasibility .warn { color:#e2a0a0; }
.tileset-studio-grid.pages-grid { display:grid; }
`;

/** A verdict-colour class for the feasibility badge. */
function verdictClass(v: string): string { return v === 'solvable' ? 'solvable' : v === 'hard' ? 'hard' : 'infeasible'; }

/** The instant, pre-commit feasibility read (ADR §2), shown BEFORE launch. Pure + cheap. */
function FeasibilityLine({ report }: { report: FeasibilityReport }): ReactElement {
  return (
    <div className="solve-feasibility">
      <h4>Feasibility (instant read)</h4>
      <p className="cluster-run-line">
        <span className={`v ${verdictClass(report.verdict)}`}>{report.verdict}</span>
        {' · '}est. states <b>{fmtInt(report.stateSpaceUpperBound)}</b>
        {' · '}tablebase <b>{fmtBytes(report.tablebaseBytesEstimate)}</b>
        {' · '}root branching <b>{fmtInt(report.branchingRoot)}</b>
        {' · '}recommends <b>{report.recommendedMode}</b>
        {report.etaSeconds ? <> · eta ~<b>{Math.round(report.etaSeconds)}s</b></> : null}
      </p>
      {report.enPassantUnsound ? (
        <p className="notes warn">En-passant reachable on this board — a strong solve is unsound; the run is downgraded to at best a bounded search.</p>
      ) : null}
      {report.hiddenStateUnsound ? (
        <p className="notes warn">Castle / chess-draws events on this level (ADR-0072) — the solver cannot key their hidden ledger yet; launching will be refused.</p>
      ) : null}
      {report.notes?.length ? <p className="notes">{report.notes.join(' · ')}</p> : null}
    </div>
  );
}

/** The Run tab: launch a bounded/anytime solve on the cluster, poll the run list + a run's
 * live progress, cancel. Output is a proven value + tablebase — nothing to adopt (F5). */
export function SolveRuns({ level }: { level?: Level }): ReactElement {
  const [runs, setRuns] = useState<SolveRunSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SolveRunDoc | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The instant feasibility read for the selected level (pure, cheap — recomputed on level
  // change), shown before launch and used to prefill the run's mode.
  const feasibility = useMemo<FeasibilityReport | null>(() => {
    if (!level) return null;
    try { return estimateFeasibility(level); } catch { return null; }
  }, [level]);

  const refresh = useCallback(async () => {
    try { setRuns(await listSolveRuns()); setError(null); }
    catch (e) { setError(String((e as Error).message || e)); }
  }, []);

  // Poll the run list every 8s (statuses advance as Jobs run on the cluster).
  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(t);
  }, [refresh]);

  // Poll the open run's full result every 6s until it's terminal.
  useEffect(() => {
    if (!openId) { setDetail(null); return undefined; }
    let live = true;
    const load = async () => { try { const d = await getSolveRun(openId); if (live) setDetail(d); } catch { /* transient */ } };
    void load();
    const t = window.setInterval(load, 6000);
    return () => { live = false; window.clearInterval(t); };
  }, [openId]);

  const launch = useCallback(async () => {
    if (!level) return;
    setLaunching(true); setError(null);
    try {
      const mode: SolveMode = feasibility?.recommendedMode ?? 'retrograde';
      const { id, status } = await launchSolveRun({ level, mode, bounds: DEFAULT_BOUNDS });
      setOpenId(id);
      if (status !== 'running') setError('run persisted but not launched (no cluster in this environment)');
      await refresh();
    } catch (e) { setError(String((e as Error).message || e)); }
    setLaunching(false);
  }, [level, feasibility, refresh]);

  const cancel = useCallback(async (id: string) => {
    try { await cancelSolveRun(id); await refresh(); }
    catch (e) { setError(String((e as Error).message || e)); }
  }, [refresh]);

  const body = detail?.body;
  const bounds = body?.rootBounds;

  return (
    <div className="cluster-runs">
      <style>{SOLVE_RUNS_CSS}</style>
      <div className="cluster-runs-head">
        <button type="button" className="tileset-view-action" onClick={() => void launch()} disabled={!level || launching}>
          {launching ? 'Launching…' : 'Solve on the cluster'}
        </button>
        <span className="cluster-runs-note">
          A node auto-provisions, runs a bounded/anytime solve of the board&apos;s game value (strong or search per feasibility), streams the tightening bounds, and scales to zero.
        </span>
      </div>
      {error ? <p className="cluster-runs-err">{error}</p> : null}
      {feasibility ? <FeasibilityLine report={feasibility} /> : null}

      <div className="cluster-runs-body">
        <ul className="cluster-runs-list">
          {runs.length === 0 ? <li className="cluster-runs-empty">No runs yet.</li> : null}
          {runs.map((r) => (
            <li key={r.id}>
              <button type="button" className={`cluster-run-row${openId === r.id ? ' active' : ''}`} onClick={() => setOpenId(r.id)}>
                <span className="cluster-run-id">{shortId(r.id)}</span>
                <span className={`cluster-run-status s-${r.status}`}>{r.status}</span>
                <span className="cluster-run-time">{fmtTime(r.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="cluster-run-detail">
          {!detail ? <p className="cluster-runs-empty">Select a run.</p> : (
            <>
              <div className="cluster-run-detail-head">
                <b className={`cluster-run-status s-${detail.status}`}>{detail.status}</b>
                {detail.status === 'running' || detail.status === 'pending'
                  ? <button type="button" className="tileset-view-action" onClick={() => void cancel(detail.id)}>Cancel</button>
                  : null}
              </div>

              {body?.feasibility ? (
                <p className="cluster-run-line">
                  feasibility <b className={`v ${verdictClass(body.feasibility.verdict)}`}>{body.feasibility.verdict}</b>
                  {' · '}est. states {fmtInt(body.feasibility.stateSpaceUpperBound)}
                  {' · '}est. tablebase {fmtBytes(body.feasibility.tablebaseBytesEstimate)}
                  {body.feasibility.enPassantUnsound ? <span className="warn"> · en-passant refusal</span> : null}
                  {body.feasibility.hiddenStateUnsound ? <span className="warn"> · hidden-ledger refusal (ADR-0072)</span> : null}
                </p>
              ) : null}

              {detail.status === 'done' ? (
                <>
                  <p className="cluster-run-line">
                    proven value <b>{body?.rootValue?.outcome ?? 'unknown'}</b>
                    {body?.rootValue?.winner ? ` (${body.rootValue.winner})` : ''}
                    {body?.rootValue?.distancePlies != null ? ` · DTM ${body.rootValue.distancePlies} plies` : ''}
                    {body?.complete === false ? ' · partial (budget stop)' : ''}
                    {body?.secs != null ? ` · ${body.secs}s` : ''}
                  </p>
                  <p className="cluster-run-line">
                    proven {fmtInt(body?.provenCount)} positions
                    {body?.proven ? ` (win ${fmtInt(body.proven.win)} / loss ${fmtInt(body.proven.loss)} / draw ${fmtInt(body.proven.draw)})` : ''}
                    {body?.coveragePct != null ? ` · coverage ${Math.round(body.coveragePct)}%` : ''}
                  </p>
                  {body?.pieceValues?.entries?.length ? (
                    <p className="cluster-run-line">
                      piece values: {body.pieceValues.entries.map((e) => `${e.side} ${e.type} ${e.outcomeFlipped ? '(flips)' : (e.distanceDeltaPlies != null ? `${e.distanceDeltaPlies >= 0 ? '+' : ''}${e.distanceDeltaPlies}` : '±0')}`).join(', ')}
                      {body.pieceValues.partial ? ' · partial' : ''}
                    </p>
                  ) : null}
                  {body?.tablebaseUrl ? (
                    <p className="cluster-run-line">tablebase: <a href={body.tablebaseUrl} download>download</a></p>
                  ) : body?.tablebaseTruncated ? (
                    <p className="cluster-run-line">tablebase truncated at the memory cap (proven summary kept inline).</p>
                  ) : body?.tablebase ? (
                    <p className="cluster-run-line">tablebase stored inline in this run.</p>
                  ) : null}
                </>
              ) : detail.status === 'error' ? (
                <p className="cluster-run-line">the solve Job failed — see cluster logs.</p>
              ) : (
                <>
                  <p className="cluster-run-line">
                    phase <b>{body?.phase ?? '…'}</b>
                    {body?.depth != null ? ` · depth ${body.depth}` : ''}
                    {body?.sweep != null ? ` · sweep ${body.sweep}` : ''}
                    {body?.secs != null ? ` · ${Math.round(body.secs)}s` : ''}
                  </p>
                  <p className="cluster-run-line">
                    {fmtInt(body?.statesSolved)} solved / {fmtInt(body?.statesEnumerated)} enumerated
                    {body?.coveragePct != null ? ` · ${Math.round(body.coveragePct)}%` : ''}
                  </p>
                  {body?.proven ? (
                    <p className="cluster-run-line">proven — win {fmtInt(body.proven.win)} · loss {fmtInt(body.proven.loss)} · draw {fmtInt(body.proven.draw)}</p>
                  ) : null}
                  {bounds ? (
                    <p className="cluster-run-line">
                      root bounds [<b>{bounds.lower}</b>, <b>{bounds.upper}</b>]{bounds.proven ? ' — proven' : ''}
                      {bounds.bestDistancePlies != null ? ` · best DTM ${bounds.bestDistancePlies}` : ''}
                    </p>
                  ) : (
                    <p className="cluster-run-line">solving on the cluster… (this panel polls the result)</p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Studio catalog wrappers (ADR-0058: click-reachable, never a type-the-URL route) ──
// Mirror Gym's GymCatalog/GymViewer so the Board Solver is a Studio catalog category.

/** The level picker for the Board Solver category — pick a level, open its Run tab. Same
 * campaign/workspace-level source as GymCatalog. */
export function SolveCatalog({ search, selected, onSelect }: { search: string; selected?: string; onSelect: (id: string) => void }): ReactElement {
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
    <div className="tileset-studio-grid pages-grid" aria-label="Solver levels">
      {levels.map((o) => (
        <button key={o.id} type="button" className={`tileset-studio-card ${o.id === selected ? 'is-selected' : ''}`.trim()}
          onClick={() => onSelect(o.id)} aria-pressed={o.id === selected} title={`${o.label} — ${o.sub}`}>
          <span className="tileset-studio-card-image pages-card-image"><LevelThumbnail level={o.level} width={132} height={88} alt="" authoringPreview /></span>
          <span className="tileset-studio-card-meta"><span className="tileset-studio-card-text"><strong>{o.label}</strong><em>{o.sub}</em></span></span>
        </button>
      ))}
      {levels.length === 0 ? <p className="tileset-studio-empty">No level matches.</p> : null}
    </div>
  );
}

/** The Board Solver viewer for one level: resolves the level from the workspace and hosts
 * the bench — the interactive Stepper tab (Phase 2, ui/solver/SolverStepper.tsx) plus the
 * cluster Run tab (this file's SolveRuns), passed in as `runTab` so there is no import
 * cycle. `tab`/`onTabChange` ride the Studio route (`stab=` param) for deep links; without
 * them (any non-Studio host) the tab is local state. Mirrors GymViewer's level resolution. */
export function SolveViewer({ levelId, header, tab, onTabChange }: {
  levelId?: string;
  header?: ReactNode;
  tab?: SolverTab;
  onTabChange?: (tab: SolverTab) => void;
}): ReactElement {
  const workspaceLevels = useCampaigns((s) => s.levels);
  useEffect(() => { void ensureCampaignsHydrated(); }, []);
  const level = levelId ? workspaceLevels[levelId] : undefined;
  const [localTab, setLocalTab] = useState<SolverTab>('step');
  return (
    <SolverStepper
      level={level}
      header={header}
      tab={tab ?? localTab}
      onTabChange={onTabChange ?? setLocalTab}
      runTab={level
        ? <SolveRuns level={level} />
        : <p className="tileset-studio-empty" style={{ padding: 16 }}>Pick a level in the catalog to solve.</p>}
    />
  );
}
