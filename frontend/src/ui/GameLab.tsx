// Game Lab — the owner-facing experiment bench for the game AI, living INSIDE the
// one Studio (ADR-0029 / docs/studio-control-architecture.md "Adding to the
// studio"): a `catalogCategories` entry whose grid is the levels you can
// experiment on, and whose "View Selected" opens the bench as the `gamelab`
// Viewer kind. It inherits the Studio topbar/breadcrumb/frame and is reachable by
// its catalog tab — NOT a standalone route.
//
// In the fixed frame: the run CONFIG is the Controls rail (level readout, games /
// depth / nodes / seed / variant, Run/Reset, Save/Export, saved runs); the run
// OUTPUT is the main pane (aggregate + per-piece table, the game list, and the
// ply-by-ply replay on the real board renderer). Runs persist per-account
// (/api/lab-runs) with the LEVEL SNAPSHOT embedded so replays survive level edits.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useCampaigns } from '../campaign/store';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { MODE_NAME } from '../core/objectives';
import type { Level, LevelUnit } from '../core/level';
import { PLAYABLE_PIECE_TYPES } from '../core/pieces';
import { aggregateRecords, replayStates, type GameRecord } from '../game/selfplay';
import { runLabGames, type LabRunHandle } from '../lab/labRunner';
import {
  deleteLabRun,
  listLabRuns,
  loadLabRun,
  saveLabRun,
  type LabRunBody,
  type LabRunMeta,
  type LabRunSummary,
} from '../net/labRuns';
import { levelToEditorBoard, unitsForGamePieces } from '../core/levelBoard';
import { StudioReadOnlyBoard } from '../render/StudioReadOnlyBoard';
import { LevelThumbnail } from '../render/LevelThumbnail';
import { ViewPane } from './shared/ViewPane';
import { fetchMe } from '../net/auth';
import type { PieceType } from '../core/types';

interface RunConfig {
  games: number;
  maxDepth: number;
  /** Per-decision node ceiling. Node-bounded (not wall-clock) so a run is
   * reproducible from its seeds on any machine — the whole point of the bench. */
  maxNodes: number;
  seedBase: number;
}

const DEFAULT_CONFIG: RunConfig = { games: 100, maxDepth: 4, maxNodes: 20_000, seedBase: 1 };

/** 'none' = run the level as authored; otherwise index into layers.units. */
interface VariantConfig {
  unitIndex: number | 'none';
  action: 'remove' | PieceType;
}

/** Apply the variant lever to a level: clone with one authored unit removed or
 * type-swapped. The clone keeps everything else (terrain, zones, objective). */
function applyVariant(level: Level, variant: VariantConfig): { level: Level; label?: string } {
  if (variant.unitIndex === 'none') return { level };
  const unit = level.layers.units[variant.unitIndex];
  if (!unit) return { level };
  const units =
    variant.action === 'remove'
      ? level.layers.units.filter((_, i) => i !== variant.unitIndex)
      : level.layers.units.map((u, i) => (i === variant.unitIndex ? { ...u, type: variant.action as LevelUnit['type'] } : u));
  const label =
    variant.action === 'remove'
      ? `${unit.side} ${unit.type} @ (${unit.x},${unit.y}) removed`
      : `${unit.side} ${unit.type} @ (${unit.x},${unit.y}) → ${variant.action}`;
  return { level: { ...level, layers: { ...level.layers, units } }, label };
}

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

/** Per-piece rollup across a run: how often each fielded piece moved, captured,
 * and survived — the "is the bishop pulling its weight" table. */
function pieceRollup(records: readonly GameRecord[]): Array<{
  id: string;
  side: string;
  type: string;
  avgMoves: number;
  captures: number;
  survivalRate: number;
  neverMovedRate: number;
}> {
  const byId = new Map<string, { side: string; type: string; games: number; moves: number; captures: number; survived: number; neverMoved: number }>();
  for (const record of records) {
    for (const piece of record.pieces) {
      const entry = byId.get(piece.id) ?? { side: piece.side, type: piece.type, games: 0, moves: 0, captures: 0, survived: 0, neverMoved: 0 };
      entry.games += 1;
      entry.moves += piece.moves;
      entry.captures += piece.captures;
      if (piece.survived) entry.survived += 1;
      if (piece.moves === 0) entry.neverMoved += 1;
      byId.set(piece.id, entry);
    }
  }
  return [...byId.entries()]
    .map(([id, e]) => ({
      id,
      side: e.side,
      type: e.type,
      avgMoves: e.games ? e.moves / e.games : 0,
      captures: e.captures,
      survivalRate: e.games ? e.survived / e.games : 0,
      neverMovedRate: e.games ? e.neverMoved / e.games : 0,
    }))
    .sort((a, b) => a.side.localeCompare(b.side) || a.id.localeCompare(b.id));
}

// The main-pane (output) styling; the Controls rail reuses the shared Studio
// `.tileset-view-controls` chrome, so only the run-form bits and the tables need
// scoping here.
const GL_CSS = `
.game-lab-main { display: flex; flex-direction: column; overflow: hidden; color: #e8e4da; font: 13px/1.45 system-ui, sans-serif; }
.game-lab-scroll { flex: 1 1 0; min-height: 96px; overflow-y: auto; padding: 14px 16px 24px; }
.game-lab-main h2 { font-size: 15px; margin: 0 0 8px; }
.game-lab-main h3 { font-size: 13px; margin: 14px 0 6px; color: #b9b2a4; }
.game-lab-main table { border-collapse: collapse; width: 100%; margin-top: 4px; }
.game-lab-main th, .game-lab-main td { border: 1px solid #333a47; padding: 4px 8px; text-align: left; font-size: 12px; }
.game-lab-main th { background: #1a1f28; color: #b9b2a4; font-weight: 600; position: sticky; top: 0; }
.game-lab-games { max-height: 240px; overflow-y: auto; margin-top: 12px; }
.game-lab-games tbody tr { cursor: pointer; }
.game-lab-games tbody tr:hover { background: #232a37; }
.game-lab-main tr.is-selected { background: #2c3447; }
.game-lab-replay-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 12px 0 8px; }
.game-lab-replay-controls input[type=range] { flex: 1; min-width: 160px; }
.game-lab-ply-label, .game-lab-hint { font-size: 12px; color: #8f8878; }
.game-lab-move-line { font-family: ui-monospace, monospace; font-size: 12px; color: #cfc8b8; margin: 4px 0 10px; }
.game-lab-stage { flex: 1.5 1 0; min-height: 320px; margin: 0 16px 14px; display: flex; flex-direction: column; }
.game-lab-board { flex: 1 1 auto; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr); border: 1px solid #333a47; border-radius: 6px; overflow: hidden; background: #0d1015; }
.game-lab-controls .gl-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #b9b2a4; margin-bottom: 8px; }
.game-lab-controls input, .game-lab-controls select { background: #12151b; color: #e8e4da; border: 1px solid #3a4150; border-radius: 4px; padding: 5px 8px; font-size: 13px; }
.game-lab-controls .gl-run-row { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
.game-lab-controls progress { width: 100%; }
.game-lab-picked { font-size: 12px; color: #cfc8b8; margin: 0 0 8px; }
.game-lab-error { color: #e08b8b; font-size: 12px; }
.game-lab-saved-runs { margin-top: 14px; }
.game-lab-saved-runs button.linklike { background: none; border: none; padding: 0; color: #9db8e8; cursor: pointer; font-size: 12px; text-decoration: underline; text-align: left; }
`;

/**
 * Catalog grid: the levels you can experiment on. Selecting one and hitting
 * "View Selected" opens the bench (the `gamelab` Viewer kind) for it. Uses the
 * shared studio card classes so the grid matches every other catalog.
 */
export function GameLabCatalog({
  search,
  selected,
  onSelect,
}: {
  search: string;
  selected?: string;
  onSelect: (levelId: string) => void;
}): ReactElement {
  const campaigns = useCampaigns((s) => s.campaigns);
  const workspaceLevels = useCampaigns((s) => s.levels);
  useEffect(() => { void ensureCampaignsHydrated(); }, []);

  const q = search.trim().toLowerCase();
  const levels = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; label: string; sub: string; level: Level }> = [];
    for (const campaign of campaigns) {
      for (const ref of campaign.levels) {
        const lvl = workspaceLevels[ref.levelId];
        if (!lvl || seen.has(lvl.id)) continue;
        seen.add(lvl.id);
        out.push({ id: lvl.id, label: lvl.name, sub: `${campaign.name} · ${MODE_NAME[lvl.objective]}`, level: lvl });
      }
    }
    for (const lvl of Object.values(workspaceLevels)) {
      if (seen.has(lvl.id)) continue;
      out.push({ id: lvl.id, label: lvl.name, sub: MODE_NAME[lvl.objective], level: lvl });
    }
    return out.filter((o) => !q || `${o.label} ${o.sub}`.toLowerCase().includes(q));
  }, [campaigns, workspaceLevels, q]);

  return (
    <div className="tileset-studio-grid pages-grid" aria-label="Game Lab levels">
      {levels.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`tileset-studio-card ${o.id === selected ? 'is-selected' : ''}`.trim()}
          onClick={() => onSelect(o.id)}
          aria-pressed={o.id === selected}
          title={`${o.label} — ${o.sub}`}
        >
          <span className="tileset-studio-card-image pages-card-image">
            {/* Baked board thumbnail — the same preview the Campaign Editor's level
                list uses, so a level looks identical everywhere it's shown. */}
            <LevelThumbnail level={o.level} width={132} height={88} alt="" authoringPreview />
          </span>
          <span className="tileset-studio-card-meta">
            <span className="tileset-studio-card-text">
              <strong>{o.label}</strong>
              <em>{o.sub}</em>
            </span>
          </span>
        </button>
      ))}
      {levels.length === 0 ? <p className="tileset-studio-empty">No level matches.</p> : null}
    </div>
  );
}

/**
 * The bench for one selected level, rendered in the Studio Viewer frame: main
 * pane (results + games + replay) plus the shared Controls rail (`header` +
 * run config). `levelId` comes from the catalog selection.
 */
export function GameLabViewer({ levelId, header }: { levelId?: string; header?: ReactNode }): ReactElement {
  const workspaceLevels = useCampaigns((s) => s.levels);
  useEffect(() => { void ensureCampaignsHydrated(); }, []);

  const [config, setConfig] = useState<RunConfig>(DEFAULT_CONFIG);
  const [variant, setVariant] = useState<VariantConfig>({ unitIndex: 'none', action: 'remove' });
  const [viewZoom, setViewZoom] = useState(0.8);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });

  // The run currently on screen. runLevel is the SNAPSHOT the games were played
  // on (variant applied) — never the live workspace level, which may drift.
  const [records, setRecords] = useState<GameRecord[] | null>(null);
  const [runLevel, setRunLevel] = useState<Level | null>(null);
  const [runMetaBase, setRunMetaBase] = useState<{ config: RunConfig; variant?: string } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const handleRef = useRef<LabRunHandle | null>(null);

  const [savedRuns, setSavedRuns] = useState<LabRunSummary[] | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | string>('idle');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const [selectedSeed, setSelectedSeed] = useState<number | null>(null);
  const [ply, setPly] = useState<number>(0);
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'player' | 'enemy' | 'draw'>('all');

  useEffect(() => {
    fetchMe().then((me) => setSignedIn(Boolean(me.signed_in))).catch(() => setSignedIn(false));
    listLabRuns().then(setSavedRuns).catch(() => setSavedRuns([]));
  }, []);

  // Switching the selected level clears the on-screen run — it belonged to the
  // previous level.
  useEffect(() => {
    setRecords(null);
    setRunLevel(null);
    setRunMetaBase(null);
    setSelectedSeed(null);
    setPly(0);
    setVariant({ unitIndex: 'none', action: 'remove' });
  }, [levelId]);

  const level = levelId ? workspaceLevels[levelId] : undefined;

  const startRun = useCallback(() => {
    if (!level || handleRef.current) return;
    const applied = applyVariant(level, variant);
    const seeds = Array.from({ length: config.games }, (_, i) => config.seedBase + i);
    const search = { maxDepth: config.maxDepth, maxNodes: config.maxNodes };
    setRecords(null);
    setRunLevel(applied.level);
    setRunMetaBase({ config: { ...config }, variant: applied.label });
    setSelectedSeed(null);
    setPly(0);
    setRunError(null);
    setSaveState('idle');
    setProgress({ done: 0, total: seeds.length });
    // Coalesce progress updates: a large run finishes hundreds/thousands of games,
    // and one setState per game would re-render the page that often.
    const step = Math.max(1, Math.floor(seeds.length / 100));
    const handle = runLabGames(applied.level, seeds, search, (_record, done, total) => {
      if (done === total || done % step === 0) setProgress({ done, total });
    });
    handleRef.current = handle;
    handle.promise
      .then((all) => setRecords(all))
      // A cancel rejects with 'cancelled' (per the LabRunHandle contract); not an error.
      .catch((error: Error) => { if (error.message !== 'cancelled') setRunError(error.message); })
      .finally(() => {
        handleRef.current = null;
        setProgress(null);
      });
  }, [level, variant, config]);

  const cancelRun = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setProgress(null);
  }, []);

  const saveRun = useCallback(() => {
    if (!records || !runLevel || !runMetaBase) return;
    const agg = aggregateRecords(records);
    const meta: LabRunMeta = {
      name: `${runLevel.name}${runMetaBase.variant ? ` — ${runMetaBase.variant}` : ''}`,
      levelId: runLevel.id,
      levelName: runLevel.name,
      games: agg.games,
      playerWins: agg.playerWins,
      enemyWins: agg.enemyWins,
      draws: agg.draws,
      avgPlies: agg.avgPlies,
      search: { maxDepth: runMetaBase.config.maxDepth, maxNodes: runMetaBase.config.maxNodes },
      seedBase: runMetaBase.config.seedBase,
      variant: runMetaBase.variant,
    };
    const body: LabRunBody = {
      level: runLevel,
      search: { maxDepth: runMetaBase.config.maxDepth, maxNodes: runMetaBase.config.maxNodes },
      records,
    };
    setSaveState('saving');
    saveLabRun(meta, body)
      .then(() => {
        setSaveState('saved');
        listLabRuns().then(setSavedRuns).catch(() => undefined);
      })
      .catch((error: Error) => setSaveState(`Save failed: ${error.message}`));
  }, [records, runLevel, runMetaBase]);

  const exportRun = useCallback(() => {
    if (!records || !runLevel || !runMetaBase) return;
    const doc = { level: runLevel, config: runMetaBase.config, variant: runMetaBase.variant, records };
    const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lab-run-${runLevel.id}-${runMetaBase.config.seedBase}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [records, runLevel, runMetaBase]);

  const loadRun = useCallback((id: string) => {
    loadLabRun(id)
      .then((doc) => {
        setRecords(doc.body.records);
        setRunLevel(doc.body.level);
        setRunMetaBase({
          config: {
            games: doc.meta.games,
            maxDepth: doc.body.search.maxDepth ?? DEFAULT_CONFIG.maxDepth,
            maxNodes: doc.body.search.maxNodes ?? DEFAULT_CONFIG.maxNodes,
            seedBase: doc.meta.seedBase,
          },
          variant: doc.meta.variant,
        });
        setSelectedSeed(null);
        setPly(0);
        setSaveState('saved');
      })
      .catch(() => setRunError('Could not load the run (signed out, or it was deleted).'));
  }, []);

  const aggregate = useMemo(() => (records ? aggregateRecords(records) : null), [records]);
  const rollup = useMemo(() => (records ? pieceRollup(records) : []), [records]);

  const configIsDefault =
    config.games === DEFAULT_CONFIG.games &&
    config.maxDepth === DEFAULT_CONFIG.maxDepth &&
    config.maxNodes === DEFAULT_CONFIG.maxNodes &&
    config.seedBase === DEFAULT_CONFIG.seedBase &&
    variant.unitIndex === 'none';

  const filteredRecords = useMemo(() => {
    if (!records) return [];
    if (outcomeFilter === 'all') return records;
    return records.filter((r) => r.winner === outcomeFilter);
  }, [records, outcomeFilter]);

  const selectedRecord = useMemo(
    () => (selectedSeed === null ? null : records?.find((r) => r.seed === selectedSeed) ?? null),
    [records, selectedSeed],
  );

  const states = useMemo(
    () => (selectedRecord && runLevel ? replayStates(runLevel, selectedRecord) : null),
    [selectedRecord, runLevel],
  );
  const baseBoard = useMemo(() => (runLevel ? levelToEditorBoard(runLevel) : null), [runLevel]);
  const clampedPly = states ? Math.max(0, Math.min(ply, states.length - 1)) : 0;
  const stepBoard = useMemo(() => {
    if (!baseBoard || !states) return null;
    return { ...baseBoard, units: unitsForGamePieces(states[clampedPly].pieces) };
  }, [baseBoard, states, clampedPly]);

  const describeMove = (record: GameRecord, index: number): string => {
    const m = record.moves[index];
    const capture = m.move.capture ? ` ×${m.move.capture}` : '';
    return `${index + 1}. ${m.pieceId} (${m.from.x},${m.from.y})→(${m.move.x},${m.move.y})${capture}`;
  };

  const running = progress !== null;

  return (
    <>
      <style>{GL_CSS}</style>
      <section className="al-lab-main game-lab-main" aria-label="Game Lab output">
        <div className="game-lab-scroll">
        {!level ? (
          <p className="game-lab-hint">Pick a level from the Game Lab catalog to run experiments on it.</p>
        ) : !records ? (
          <p className="game-lab-hint">
            {running ? `Running games… ${progress.done}/${progress.total}` : `Ready to run games on “${level.name}”. Set the knobs on the right and hit Run games.`}
          </p>
        ) : aggregate ? (
          <>
            <h2>Results{runMetaBase?.variant ? ` — ${runMetaBase.variant}` : ''}</h2>
            <table>
              <thead>
                <tr><th>Games</th><th>Player wins</th><th>Enemy wins</th><th>Draws</th><th>Player win rate</th><th>Avg length</th><th>Avg depth</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{aggregate.games}</td>
                  <td>{aggregate.playerWins}</td>
                  <td>{aggregate.enemyWins}</td>
                  <td>{aggregate.draws}</td>
                  <td>{pct(aggregate.playerWinRate)} ± {pct(aggregate.winRateError)}</td>
                  <td>{aggregate.avgPlies.toFixed(1)} plies</td>
                  <td>{aggregate.avgDepth.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
            <h3>Pieces</h3>
            <table>
              <thead>
                <tr><th>Piece</th><th>Avg moves / game</th><th>Total captures</th><th>Survival</th><th>Never moved</th></tr>
              </thead>
              <tbody>
                {rollup.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.avgMoves.toFixed(2)}</td>
                    <td>{p.captures}</td>
                    <td>{pct(p.survivalRate)}</td>
                    <td>{pct(p.neverMovedRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Games</h3>
            <label className="game-lab-picked">
              Outcome{' '}
              <select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value as typeof outcomeFilter)}>
                <option value="all">all</option>
                <option value="player">player wins</option>
                <option value="enemy">enemy wins</option>
                <option value="draw">draws</option>
              </select>
            </label>
            <div className="game-lab-games">
              <table>
                <thead>
                  <tr><th>Seed</th><th>Winner</th><th>Plies</th><th>Rounds</th></tr>
                </thead>
                <tbody>
                  {filteredRecords.map((r) => (
                    <tr
                      key={r.seed}
                      className={selectedSeed === r.seed ? 'is-selected' : ''}
                      onClick={() => { setSelectedSeed(r.seed); setPly(0); }}
                    >
                      <td>{r.seed}</td>
                      <td>{r.winner}</td>
                      <td>{r.plies}</td>
                      <td>{r.turnsElapsed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Replay</h3>
            {selectedRecord && states && stepBoard ? null : (
              <p className="game-lab-hint">Pick a game from the table to step through it.</p>
            )}
          </>
        ) : null}
        </div>
        {selectedRecord && states && stepBoard ? (
          <div className="game-lab-stage">
            <div className="game-lab-replay-controls">
              <button type="button" onClick={() => setPly(Math.max(0, clampedPly - 1))} disabled={clampedPly === 0}>‹ Prev</button>
              <input type="range" min={0} max={states.length - 1} value={clampedPly} onChange={(e) => setPly(Number(e.target.value))} />
              <button type="button" onClick={() => setPly(Math.min(states.length - 1, clampedPly + 1))} disabled={clampedPly >= states.length - 1}>Next ›</button>
              <span className="game-lab-ply-label">
                Ply {clampedPly}/{states.length - 1} — seed {selectedRecord.seed}, {selectedRecord.winner} wins in {selectedRecord.plies}
              </span>
            </div>
            <p className="game-lab-move-line">
              {clampedPly === 0 ? 'Starting position' : describeMove(selectedRecord, clampedPly - 1)}
            </p>
            <div className="game-lab-board">
              <ViewPane kind="board" ariaLabel="Replay board" zoom={viewZoom} pan={viewPan} minZoom={0.3} maxZoom={2} onZoomChange={setViewZoom} onPanChange={setViewPan}>
                <div className="tileset-view-board-content is-board">
                  <StudioReadOnlyBoard board={stepBoard} boardZoom={viewZoom} boardPan={viewPan} ariaLabel="Replay board" />
                </div>
              </ViewPane>
            </div>
          </div>
        ) : null}
      </section>

      <aside className="tileset-view-controls game-lab-controls" aria-label="Game Lab controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="game-lab-picked">{level ? `Level: ${level.name} (${MODE_NAME[level.objective]})` : 'No level selected — pick one in the Catalog.'}</p>

            <label className="gl-field">Games
              <input type="number" min={1} max={2000} value={config.games} disabled={running}
                onChange={(e) => setConfig({ ...config, games: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            <label className="gl-field">Depth
              <input type="number" min={1} max={8} value={config.maxDepth} disabled={running}
                onChange={(e) => setConfig({ ...config, maxDepth: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            <label className="gl-field">nodes / move
              <input type="number" min={500} max={2_000_000} step={500} value={config.maxNodes} disabled={running}
                onChange={(e) => setConfig({ ...config, maxNodes: Math.max(500, Number(e.target.value) || 500) })} />
            </label>
            <label className="gl-field">Seed base
              <input type="number" min={1} value={config.seedBase} disabled={running}
                onChange={(e) => setConfig({ ...config, seedBase: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            {level && level.layers.units.length > 0 ? (
              <label className="gl-field">Variant
                <select value={variant.unitIndex === 'none' ? 'none' : String(variant.unitIndex)} disabled={running}
                  onChange={(e) => setVariant({ ...variant, unitIndex: e.target.value === 'none' ? 'none' : Number(e.target.value) })}>
                  <option value="none">as authored</option>
                  {level.layers.units.map((u, i) => (
                    <option key={`${u.side}-${u.type}-${i}`} value={i}>{`${u.side} ${u.type} @ (${u.x},${u.y})`}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {variant.unitIndex !== 'none' ? (
              <label className="gl-field">becomes
                <select value={variant.action} disabled={running}
                  onChange={(e) => setVariant({ ...variant, action: e.target.value as VariantConfig['action'] })}>
                  <option value="remove">removed</option>
                  {PLAYABLE_PIECE_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </label>
            ) : null}

            <div className="gl-run-row">
              {running ? (
                <>
                  <button type="button" onClick={cancelRun}>Cancel</button>
                  <progress value={progress.done} max={progress.total} />
                </>
              ) : (
                <>
                  <button type="button" onClick={startRun} disabled={!level}>Run games</button>
                  {/* ADR-0057: reset to the committed defaults (derived baseline, not a zero-out). */}
                  <button type="button" disabled={configIsDefault}
                    onClick={() => { setConfig(DEFAULT_CONFIG); setVariant({ unitIndex: 'none', action: 'remove' }); }}>
                    Reset
                  </button>
                </>
              )}
            </div>
            {runError ? <p className="game-lab-error" role="alert">{runError}</p> : null}

            {records ? (
              <div className="gl-run-row">
                <button type="button" onClick={saveRun} disabled={saveState === 'saving' || saveState === 'saved' || signedIn === false}>
                  {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save run'}
                </button>
                <button type="button" onClick={exportRun}>Export JSON</button>
              </div>
            ) : null}
            {signedIn === false ? <p className="game-lab-hint">Sign in to save runs to your account.</p> : null}
            {typeof saveState === 'string' && saveState.startsWith('Save failed') ? <p className="game-lab-error">{saveState}</p> : null}

            <div className="game-lab-saved-runs">
              <h3 style={{ fontSize: 12, color: '#b9b2a4', margin: '0 0 6px' }}>Saved runs</h3>
              {savedRuns === null ? (
                <p className="game-lab-hint">Loading…</p>
              ) : savedRuns.length === 0 ? (
                <p className="game-lab-hint">{signedIn === false ? 'Sign in to keep runs across sessions.' : 'No saved runs yet.'}</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {savedRuns.map((run) => (
                    <li key={run.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
                      <button type="button" className="linklike" onClick={() => loadRun(run.id)}>{run.meta.name}</button>
                      <button type="button" style={{ fontSize: 11 }}
                        onClick={() => { void deleteLabRun(run.id).then(() => listLabRuns().then(setSavedRuns)).catch(() => undefined); }}>×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </aside>
    </>
  );
}
