// Game Lab (/game-lab): the owner-facing experiment bench for the game AI.
// Pick a level, run N self-play games in workers, read the aggregate (win rates
// with error bars, per-piece activity), drill into any single game, and step
// through it ply-by-ply on the real board renderer. Runs persist per-account
// (/api/lab-runs) with the LEVEL SNAPSHOT embedded so replays survive later
// level edits; Export downloads the same document as JSON.
//
// Dev tooling — deliberately a plain web page (Studio family), not game chrome.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
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

// Dev-page styling rides inline with the component, the same pattern as
// SurfaceLab's SL_CSS / ArtworkCompare's AC_CSS (Studio pages are plain web
// pages — no game chrome).
const GL_CSS = `
.game-lab { padding: 18px 22px 60px; max-width: 1400px; margin: 0 auto; color: #e8e4da; font: 14px/1.45 system-ui, sans-serif; }
.game-lab h2 { font-size: 16px; margin: 0 0 10px; }
.game-lab h3 { font-size: 14px; margin: 16px 0 6px; }
.game-lab-panel { background: rgba(20, 24, 30, 0.72); border: 1px solid #3a4150; border-radius: 8px; padding: 14px 16px; margin-bottom: 14px; }
.game-lab-config { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
.game-lab-config h2 { flex-basis: 100%; margin-bottom: 2px; }
.game-lab-config label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #b9b2a4; }
.game-lab-config input, .game-lab-config select, .game-lab select { background: #12151b; color: #e8e4da; border: 1px solid #3a4150; border-radius: 4px; padding: 5px 8px; font-size: 13px; }
.game-lab-config input[type='number'] { width: 84px; }
.game-lab button { background: #2a3242; color: #e8e4da; border: 1px solid #4a5468; border-radius: 5px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
.game-lab button:hover:not(:disabled) { background: #38445c; }
.game-lab button:disabled { opacity: 0.45; cursor: default; }
.game-lab progress { width: 220px; height: 14px; }
.game-lab table { border-collapse: collapse; width: 100%; margin-top: 4px; }
.game-lab th, .game-lab td { border: 1px solid #333a47; padding: 5px 9px; text-align: left; font-size: 13px; }
.game-lab th { background: #1a1f28; color: #b9b2a4; font-weight: 600; }
.game-lab-split { display: grid; grid-template-columns: minmax(280px, 420px) 1fr; gap: 14px; align-items: start; }
.game-lab-games table tbody tr { cursor: pointer; }
.game-lab-games table tbody tr:hover { background: #232a37; }
.game-lab tr.is-selected { background: #2c3447; }
.game-lab-games { max-height: 560px; overflow-y: auto; }
.game-lab-replay-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.game-lab-replay-controls input[type='range'] { flex: 1; min-width: 160px; }
.game-lab-ply-label { font-size: 12px; color: #b9b2a4; }
.game-lab-move-line { font-family: ui-monospace, monospace; font-size: 12px; color: #cfc8b8; margin: 4px 0 10px; }
.game-lab-board { display: grid; grid-template-rows: minmax(0, 1fr); height: 560px; border: 1px solid #333a47; border-radius: 6px; overflow: hidden; background: #0d1015; }
.game-lab-actions { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
.game-lab-hint { color: #8f8878; font-size: 13px; }
.game-lab-error { color: #e08b8b; font-size: 13px; }
.game-lab-progress-label { font-size: 12px; color: #b9b2a4; }
.game-lab-linklike { background: none; border: none; padding: 0; color: #9db8e8; cursor: pointer; font-size: 13px; text-decoration: underline; }
`;

const readParams = () => new URLSearchParams(window.location.search);

function writeParams(entries: Record<string, string | null>): void {
  const params = readParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  window.history.replaceState({}, '', `/game-lab${qs ? `?${qs}` : ''}`);
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

export function GameLab(): ReactElement {
  const campaigns = useCampaigns((s) => s.campaigns);
  const workspaceLevels = useCampaigns((s) => s.levels);

  const [selectedLevelId, setSelectedLevelId] = useState<string>(() => readParams().get('level') ?? '');
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
  const [loadedRunId, setLoadedRunId] = useState<string | null>(() => readParams().get('run'));

  const [selectedSeed, setSelectedSeed] = useState<number | null>(() => {
    const raw = readParams().get('game');
    return raw === null ? null : Number(raw);
  });
  const [ply, setPly] = useState<number>(() => Number(readParams().get('ply') ?? 0) || 0);
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'player' | 'enemy' | 'draw'>('all');

  useEffect(() => {
    void ensureCampaignsHydrated();
    fetchMe().then((me) => setSignedIn(Boolean(me.signed_in))).catch(() => setSignedIn(false));
    listLabRuns().then(setSavedRuns).catch(() => setSavedRuns([]));
  }, []);

  // Deep link: ?run=<id> restores a saved run wholesale (level snapshot included).
  useEffect(() => {
    if (!loadedRunId || records) return;
    loadLabRun(loadedRunId)
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
        setSaveState('saved');
      })
      .catch(() => setRunError('Could not load the linked run (signed out, or it was deleted).'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedRunId]);

  useEffect(() => {
    writeParams({
      level: selectedLevelId || null,
      run: loadedRunId,
      game: selectedSeed === null ? null : String(selectedSeed),
      ply: selectedSeed === null || ply === 0 ? null : String(ply),
    });
  }, [selectedLevelId, loadedRunId, selectedSeed, ply]);

  const level = workspaceLevels[selectedLevelId];
  const levelOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ id: string; label: string }> = [];
    for (const campaign of campaigns) {
      for (const ref of campaign.levels) {
        const lvl = workspaceLevels[ref.levelId];
        if (!lvl || seen.has(lvl.id)) continue;
        seen.add(lvl.id);
        options.push({ id: lvl.id, label: `${campaign.name} — ${lvl.name} (${MODE_NAME[lvl.objective]})` });
      }
    }
    for (const lvl of Object.values(workspaceLevels)) {
      if (seen.has(lvl.id)) continue;
      options.push({ id: lvl.id, label: `${lvl.name} (${MODE_NAME[lvl.objective]})` });
    }
    return options;
  }, [campaigns, workspaceLevels]);

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
    setLoadedRunId(null);
    setRunError(null);
    setSaveState('idle');
    setProgress({ done: 0, total: seeds.length });
    const handle = runLabGames(applied.level, seeds, search, (_record, done, total) => setProgress({ done, total }));
    handleRef.current = handle;
    handle.promise
      .then((all) => setRecords(all))
      .catch((error: Error) => setRunError(error.message))
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
      .then(({ id }) => {
        setSaveState('saved');
        setLoadedRunId(id);
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

  const aggregate = useMemo(() => (records ? aggregateRecords(records) : null), [records]);
  const rollup = useMemo(() => (records ? pieceRollup(records) : []), [records]);

  const filteredRecords = useMemo(() => {
    if (!records) return [];
    if (outcomeFilter === 'all') return records;
    return records.filter((r) => r.winner === outcomeFilter);
  }, [records, outcomeFilter]);

  const selectedRecord = useMemo(
    () => (selectedSeed === null ? null : records?.find((r) => r.seed === selectedSeed) ?? null),
    [records, selectedSeed],
  );

  // Replay: rebuild every board state once per selected game, render the current
  // ply through the same read-only board the editors use.
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

  const openGame = (seed: number): void => {
    setSelectedSeed(seed);
    setPly(0);
  };

  const describeMove = (record: GameRecord, index: number): string => {
    const m = record.moves[index];
    const capture = m.move.capture ? ` ×${m.move.capture}` : '';
    return `${index + 1}. ${m.pieceId} (${m.from.x},${m.from.y})→(${m.move.x},${m.move.y})${capture}`;
  };

  const running = progress !== null;

  return (
    <div className="game-lab">
      <style>{GL_CSS}</style>
      <section className="game-lab-panel game-lab-config" aria-label="Run configuration">
        <h2>Run</h2>
        <label>
          Level
          <select value={selectedLevelId} onChange={(e) => setSelectedLevelId(e.target.value)} disabled={running}>
            <option value="">— pick a level —</option>
            {levelOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label>
          Games
          <input type="number" min={1} max={2000} value={config.games} disabled={running}
            onChange={(e) => setConfig({ ...config, games: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        <label>
          Depth
          <input type="number" min={1} max={8} value={config.maxDepth} disabled={running}
            onChange={(e) => setConfig({ ...config, maxDepth: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        <label>
          nodes / move
          <input type="number" min={500} max={2_000_000} step={500} value={config.maxNodes} disabled={running}
            onChange={(e) => setConfig({ ...config, maxNodes: Math.max(500, Number(e.target.value) || 500) })} />
        </label>
        <label>
          Seed base
          <input type="number" min={1} value={config.seedBase} disabled={running}
            onChange={(e) => setConfig({ ...config, seedBase: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        {level && level.layers.units.length > 0 ? (
          <label>
            Variant
            <select
              value={variant.unitIndex === 'none' ? 'none' : String(variant.unitIndex)}
              disabled={running}
              onChange={(e) => setVariant({ ...variant, unitIndex: e.target.value === 'none' ? 'none' : Number(e.target.value) })}
            >
              <option value="none">as authored</option>
              {level.layers.units.map((u, i) => (
                <option key={`${u.side}-${u.type}-${i}`} value={i}>{`${u.side} ${u.type} @ (${u.x},${u.y})`}</option>
              ))}
            </select>
          </label>
        ) : null}
        {variant.unitIndex !== 'none' ? (
          <label>
            becomes
            <select value={variant.action} disabled={running}
              onChange={(e) => setVariant({ ...variant, action: e.target.value as VariantConfig['action'] })}>
              <option value="remove">removed</option>
              {PLAYABLE_PIECE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        ) : null}
        {running ? (
          <>
            <button type="button" onClick={cancelRun}>Cancel</button>
            <progress value={progress.done} max={progress.total} />
            <span className="game-lab-progress-label">{progress.done}/{progress.total}</span>
          </>
        ) : (
          <button type="button" onClick={startRun} disabled={!level}>Run games</button>
        )}
        {runError ? <p className="game-lab-error" role="alert">{runError}</p> : null}
      </section>

      {aggregate && records ? (
        <section className="game-lab-panel game-lab-results" aria-label="Run results">
          <h2>
            Results{runMetaBase?.variant ? ` — ${runMetaBase.variant}` : ''}
          </h2>
          <table>
            <thead>
              <tr><th>Games</th><th>Player wins</th><th>Enemy wins</th><th>Draws</th><th>Player win rate</th><th>Avg game length</th><th>Avg search depth</th></tr>
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
          <div className="game-lab-actions">
            <button type="button" onClick={saveRun} disabled={saveState === 'saving' || saveState === 'saved' || signedIn === false}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save run'}
            </button>
            <button type="button" onClick={exportRun}>Export JSON</button>
            {signedIn === false ? <span className="game-lab-hint">Sign in to save runs to your account.</span> : null}
            {typeof saveState === 'string' && saveState.startsWith('Save failed') ? (
              <span className="game-lab-error">{saveState}</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {records ? (
        <div className="game-lab-split">
          <section className="game-lab-panel game-lab-games" aria-label="Games in this run">
            <h2>Games</h2>
            <label>
              Outcome
              <select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value as typeof outcomeFilter)}>
                <option value="all">all</option>
                <option value="player">player wins</option>
                <option value="enemy">enemy wins</option>
                <option value="draw">draws</option>
              </select>
            </label>
            <table>
              <thead>
                <tr><th>Seed</th><th>Winner</th><th>Plies</th><th>Rounds</th></tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => (
                  <tr
                    key={r.seed}
                    className={selectedSeed === r.seed ? 'is-selected' : ''}
                    onClick={() => openGame(r.seed)}
                  >
                    <td>{r.seed}</td>
                    <td>{r.winner}</td>
                    <td>{r.plies}</td>
                    <td>{r.turnsElapsed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="game-lab-panel game-lab-replay" aria-label="Replay">
            <h2>Replay</h2>
            {selectedRecord && states && stepBoard ? (
              <>
                <div className="game-lab-replay-controls">
                  <button type="button" onClick={() => setPly(Math.max(0, clampedPly - 1))} disabled={clampedPly === 0}>‹ Prev</button>
                  <input
                    type="range"
                    min={0}
                    max={states.length - 1}
                    value={clampedPly}
                    onChange={(e) => setPly(Number(e.target.value))}
                  />
                  <button type="button" onClick={() => setPly(Math.min(states.length - 1, clampedPly + 1))} disabled={clampedPly >= states.length - 1}>Next ›</button>
                  <span className="game-lab-ply-label">
                    Ply {clampedPly}/{states.length - 1} — seed {selectedRecord.seed}, {selectedRecord.winner} wins in {selectedRecord.plies}
                  </span>
                </div>
                <p className="game-lab-move-line">
                  {clampedPly === 0 ? 'Starting position' : describeMove(selectedRecord, clampedPly - 1)}
                </p>
                <div className="game-lab-board">
                  <ViewPane
                    kind="board"
                    ariaLabel="Replay board"
                    zoom={viewZoom}
                    pan={viewPan}
                    minZoom={0.3}
                    maxZoom={2}
                    onZoomChange={setViewZoom}
                    onPanChange={setViewPan}
                  >
                    <div className="tileset-view-board-content is-board">
                      <StudioReadOnlyBoard board={stepBoard} boardZoom={viewZoom} boardPan={viewPan} ariaLabel="Replay board" />
                    </div>
                  </ViewPane>
                </div>
              </>
            ) : (
              <p className="game-lab-hint">Pick a game from the table to step through it.</p>
            )}
          </section>
        </div>
      ) : null}

      <section className="game-lab-panel game-lab-saved" aria-label="Saved runs">
        <h2>Saved runs</h2>
        {savedRuns === null ? (
          <p className="game-lab-hint">Loading…</p>
        ) : savedRuns.length === 0 ? (
          <p className="game-lab-hint">{signedIn === false ? 'Sign in to keep runs across sessions.' : 'No saved runs yet.'}</p>
        ) : (
          <table>
            <thead>
              <tr><th>Run</th><th>Games</th><th>Player win rate</th><th>Saved</th><th /></tr>
            </thead>
            <tbody>
              {savedRuns.map((run) => (
                <tr key={run.id} className={loadedRunId === run.id ? 'is-selected' : ''}>
                  <td><button type="button" className="game-lab-linklike" onClick={() => { setLoadedRunId(run.id); setRecords(null); setSelectedSeed(null); setPly(0); }}>{run.meta.name}</button></td>
                  <td>{run.meta.games}</td>
                  <td>{run.meta.games ? pct(run.meta.playerWins / run.meta.games) : '—'}</td>
                  <td>{new Date(run.created_at).toLocaleString()}</td>
                  <td>
                    <button type="button" onClick={() => {
                      void deleteLabRun(run.id).then(() => listLabRuns().then(setSavedRuns)).catch(() => undefined);
                    }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
