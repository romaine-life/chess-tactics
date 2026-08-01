// Cluster board-solver panel (ADR-0069 §5) — the "Run" tab. It uses the shared cluster-job
// controller and shell; only the solver-specific detail renderer differs from training.
// The solver's output is a PROVEN GAME VALUE + a (partial) tablebase, not an eval vector.
// Before
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
import { StudioCatalogCard } from './studio/StudioCatalogCard';
import { estimateFeasibility } from '../core/solver';
import type { FeasibilityReport, SolveMode } from '../core/solver';
import {
  launchSolveRun, listSolveRuns, getSolveRun, cancelSolveRun,
  type SolveRunSummary, type SolveRunDoc,
} from '../net/solveRuns';
import { SolverStepper, type SolverTab } from './solver/SolverStepper';
import { useSceneParticipant } from './shell/SceneBoundary';
import { ClusterJobPanel, useClusterJobController } from './shared/ClusterJobPanel';

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
  const controller = useClusterJobController<SolveRunSummary, SolveRunDoc>({
    listRuns: listSolveRuns,
    getRun: getSolveRun,
    cancelRun: cancelSolveRun,
  });
  const initialError = controller.initialSettled && controller.error ? new Error(controller.error) : null;
  useSceneParticipant(
    'studio:solver-runs',
    initialError ? 'error' : controller.initialSettled ? 'painted' : 'loading',
    initialError,
  );

  // The instant feasibility read for the selected level (pure, cheap — recomputed on level
  // change), shown before launch and used to prefill the run's mode.
  const feasibility = useMemo<FeasibilityReport | null>(() => {
    if (!level) return null;
    try { return estimateFeasibility(level); } catch { return null; }
  }, [level]);

  const launch = useCallback(() => {
    if (!level) return;
    void controller.launch(async () => {
      const mode: SolveMode = feasibility?.recommendedMode ?? 'retrograde';
      return launchSolveRun({ level, mode, bounds: DEFAULT_BOUNDS });
    });
  }, [controller, feasibility, level]);

  const body = controller.detail?.body;
  const bounds = body?.rootBounds;

  return (
    <>
      <style>{SOLVE_RUNS_CSS}</style>
      <ClusterJobPanel
        className="solve-cluster-runs"
        launchLabel="Solve on the cluster"
        launchDisabled={!level}
        launching={controller.launching}
        onLaunch={launch}
        note={<>A node auto-provisions, runs a bounded/anytime solve of the board&apos;s game value (strong or search per feasibility), streams the tightening bounds, and scales to zero.</>}
        error={controller.error}
        prelude={feasibility ? <FeasibilityLine report={feasibility} /> : null}
        runs={controller.runs}
        openId={controller.openId}
        onOpen={controller.setOpenId}
        detail={controller.detail}
        onCancel={(id) => { void controller.cancel(id); }}
        renderDetail={(detail) => <>
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
        </>}
      />
    </>
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
        <StudioCatalogCard key={o.id} title={o.label} badge={o.sub} selected={o.id === selected} onSelect={() => onSelect(o.id)} titleText={`${o.label} — ${o.sub}`} imageClassName="pages-card-image" media={<LevelThumbnail level={o.level} width={132} alt="" authoringPreview />} />
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
  const [campaignsSettled, setCampaignsSettled] = useState(false);
  const [campaignLoadError, setCampaignLoadError] = useState<Error | null>(null);
  useEffect(() => {
    let cancelled = false;
    void ensureCampaignsHydrated()
      .then(() => { if (!cancelled) setCampaignsSettled(true); })
      .catch((value: unknown) => {
        if (!cancelled) setCampaignLoadError(value instanceof Error ? value : new Error(String(value)));
      });
    return () => { cancelled = true; };
  }, []);
  const level = levelId ? workspaceLevels[levelId] : undefined;
  const routeError = useMemo(
    () => campaignLoadError
      ?? (campaignsSettled && levelId && !level ? new Error(`Selected Solver level ${levelId} is unavailable`) : null),
    [campaignLoadError, campaignsSettled, level, levelId],
  );
  useSceneParticipant(
    'studio:solver-viewer',
    routeError ? 'error' : campaignsSettled ? 'painted' : 'loading',
    routeError,
  );
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
