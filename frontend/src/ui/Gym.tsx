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
import { createFromLevel } from '../game/setup';
import { PARAM_LABELS, encodeWeights } from '../game/tuning';
import { DEFAULT_EVAL_WEIGHTS } from '../core/ai';
import type { GymRequest, GymResponse, GymPoint } from '../lab/gymWorker';

const GYM_CSS = `
.gym-main { overflow-y:auto; padding:14px 16px 40px; color:#e7ebf0; font:13px/1.45 system-ui,sans-serif; }
.gym-main h3 { font-size:13px; margin:14px 0 6px; color:#93a0b0; }
.gym-board { display:grid; grid-template-rows:minmax(0,1fr); height:360px; border:1px solid #29323f; border-radius:8px; overflow:hidden; background:#0b1016; }
.gym-conv { margin-top:14px; }
.gym-conv canvas { width:100%; height:150px; display:block; background:#0b1016; border:1px solid #29323f; border-radius:8px; }
.gym-scorebig { font:600 24px ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.gym-hint { color:#5c6875; font-size:12px; }
.gym-controls .gl-field { display:flex; flex-direction:column; gap:4px; font-size:12px; color:#93a0b0; margin-bottom:8px; }
.gym-controls input,.gym-controls select { background:#0c1116; color:#e7ebf0; border:1px solid #3a4657; border-radius:4px; padding:5px 8px; font-size:13px; }
.gym-run-row { display:flex; gap:8px; align-items:center; margin:10px 0; }
.gym-run-row .play { background:#46d6b8; color:#06231d; border-color:#46d6b8; font-weight:700; }
.gym-estab { display:flex; align-items:center; gap:8px; margin:4px 0 10px; }
.gym-meter { flex:1; height:6px; border-radius:3px; background:#0c1116; border:1px solid #29323f; overflow:hidden; }
.gym-meter i { display:block; height:100%; background:linear-gradient(90deg,#e0b24a,#46d6b8); }
.gym-weights { display:grid; grid-template-columns:1fr auto auto; gap:2px 10px; font:12px ui-monospace,monospace; }
.gym-weights .k { color:#93a0b0; } .gym-weights .v { text-align:right; font-variant-numeric:tabular-nums; }
.gym-weights .d { text-align:right; width:56px; } .gym-weights .d.up { color:#5ad19a; } .gym-weights .d.dn { color:#e0685f; } .gym-weights .d.z { color:#5c6875; }
.gym-num { font-family:ui-monospace,monospace; font-variant-numeric:tabular-nums; }
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

/** The gym bench for one level: board-grounded, stepped SPSA tuning in the frame. */
export function GymViewer({ levelId, header }: { levelId?: string; header?: ReactNode }): ReactElement {
  const workspaceLevels = useCampaigns((s) => s.levels);
  useEffect(() => { void ensureCampaignsHydrated(); }, []);
  const level = levelId ? workspaceLevels[levelId] : undefined;

  // Kept small by default so a step lands in a few seconds (each step plays
  // bookSize×4 real games); crank both up for a more trustworthy signal.
  const [bookSize, setBookSize] = useState(2);
  const [depth, setDepth] = useState(2);
  const [seed, setSeed] = useState(1);
  const [viewZoom, setViewZoom] = useState(0.72);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });

  const [traj, setTraj] = useState<GymPoint[]>([]);
  const [champion, setChampion] = useState<{ step: number; score: number; theta: number[] }>({ step: -1, score: 0.5, theta: REF_VEC });
  const [established, setEstablished] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const playingRef = useRef(false);
  const [playing, setPlaying] = useState(false);

  // (Re)create the worker whenever the level or the run knobs change.
  useEffect(() => {
    if (!level) return undefined;
    playingRef.current = false; setPlaying(false);
    setTraj([]); setChampion({ step: -1, score: 0.5, theta: REF_VEC }); setEstablished(0); setReady(false);
    const worker = new Worker(new URL('../lab/gymWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<GymResponse>) => {
      const msg = event.data;
      if (msg.type === 'ready') { setReady(true); }
      else if (msg.type === 'point') {
        setTraj((t) => [...t, msg.point]);
        setChampion(msg.champion);
        setEstablished(msg.sinceImprovement);
        setBusy(false);
        if (playingRef.current) setTimeout(() => stepOnce(), 20);
      } else { setBusy(false); playingRef.current = false; setPlaying(false); }
    };
    const init: GymRequest = {
      type: 'init', level, bookSize,
      match: { search: { maxDepth: depth, maxNodes: 2500 }, maxPlies: 80 },
    };
    worker.postMessage(init);
    return () => { worker.terminate(); workerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, bookSize, depth]);

  const stepOnce = useCallback(() => {
    if (!workerRef.current || !ready) return;
    setBusy(true);
    workerRef.current.postMessage({ type: 'step' } as GymRequest);
  }, [ready]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) { playingRef.current = false; setPlaying(false); return; }
    playingRef.current = true; setPlaying(true); stepOnce();
  }, [stepOnce]);

  // Convergence chart.
  const convRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cvs = convRef.current; if (!cvs) return;
    const ctx = cvs.getContext('2d'); if (!ctx) return;
    const W = cvs.width, H = cvs.height, pad = 18; ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(58,70,87,.35)'; ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g += 1) { const y = pad + (H - 2 * pad) * g / 4; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke(); }
    if (traj.length === 0) return;
    const lo = 0.35, hi = 0.65, n = traj.length;
    const X = (i: number) => pad + (W - 2 * pad) * (n <= 1 ? 0.5 : i / (n - 1));
    const Y = (v: number) => H - pad - (H - 2 * pad) * ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo));
    // 0.5 baseline (even with the reference)
    ctx.strokeStyle = 'rgba(147,160,176,.4)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pad, Y(0.5)); ctx.lineTo(W - pad, Y(0.5)); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(X(0), Y(traj[0].score));
    traj.forEach((p, i) => ctx.lineTo(X(i), Y(p.score)));
    ctx.strokeStyle = '#46d6b8'; ctx.lineWidth = 2; ctx.stroke();
    const last = traj[traj.length - 1];
    ctx.beginPath(); ctx.arc(X(n - 1), Y(last.score), 4, 0, 7); ctx.fillStyle = '#46d6b8'; ctx.fill();
  }, [traj]);

  // Board at the current seed (the position being tuned on).
  const board = useMemo(() => {
    if (!level) return null;
    const base = levelToEditorBoard(level);
    const game = createFromLevel(level, seed);
    return { ...base, units: unitsForGamePieces(game.pieces) };
  }, [level, seed]);

  const lastScore = traj.length ? traj[traj.length - 1].score : 0.5;
  const champVec = champion.theta;
  // Grows as steps pass without the champion improving — a rough "settling" read.
  const estabPct = champion.step < 0 ? 0 : Math.min(96, 40 + established * 4);

  return (
    <>
      <style>{GYM_CSS}</style>
      <section className="al-lab-main gym-main" aria-label="Gym output">
        {!level ? (
          <p className="gym-hint">Pick a level from the Gym catalog to train the AI on it.</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Board — seed <span className="gym-num">#{seed}</span></h3>
              <button type="button" onClick={() => setSeed((s) => s + 1)} title="Next book position">↻</button>
              <span className="gym-hint">book position {((seed - 1) % bookSize) + 1} of {bookSize}</span>
            </div>
            <div className="gym-board">
              {board ? (
                <ViewPane kind="board" ariaLabel="Board" zoom={viewZoom} pan={viewPan} minZoom={0.3} maxZoom={2} onZoomChange={setViewZoom} onPanChange={setViewPan}>
                  <div className="tileset-view-board-content is-board"><StudioReadOnlyBoard board={board} boardZoom={viewZoom} boardPan={viewPan} ariaLabel="Board" /></div>
                </ViewPane>
              ) : null}
            </div>

            <div className="gym-conv">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span className="gym-hint">Champion strength vs the shipped AI ({traj.length} steps)</span>
                <span className="gym-scorebig" style={{ color: lastScore > 0.505 ? '#5ad19a' : lastScore < 0.495 ? '#e0685f' : '#e7ebf0' }}>{lastScore.toFixed(3)}</span>
              </div>
              <canvas ref={convRef} width={900} height={300} aria-label="convergence curve" />
              <p className="gym-hint" style={{ marginTop: 8 }}>
                0.5 = even with the shipped weights. Above 0.5 = the tuner found something stronger. A flat line at 0.5 means the games are drawing — no signal to climb (the unbalanced-book / oracle-fitness work).
              </p>
            </div>
          </>
        )}
      </section>

      <aside className="tileset-view-controls gym-controls" aria-label="Gym controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="gym-hint">{level ? `Training: ${level.name} (${MODE_NAME[level.objective]})` : 'No level — pick one in the Catalog.'}</p>

            <label className="gl-field">book size
              <input type="number" min={1} max={32} value={bookSize} onChange={(e) => setBookSize(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label className="gl-field">search depth
              <input type="number" min={1} max={5} value={depth} onChange={(e) => setDepth(Math.max(1, Number(e.target.value) || 1))} />
            </label>

            <div className="gym-run-row">
              <button type="button" className="play" onClick={togglePlay} disabled={!ready}>{playing ? '⏸ pause' : '▶ run'}</button>
              <button type="button" onClick={stepOnce} disabled={!ready || busy || playing}>⏭ step</button>
            </div>
            {!ready ? <p className="gym-hint">Preparing…</p> : busy && !playing ? <p className="gym-hint">Playing this step's games…</p> : null}

            <h3>Champion</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }} className="gym-num">
              <span className="gym-hint">score</span><span>{champion.score.toFixed(3)}</span>
            </div>
            <div className="gym-hint" style={{ marginBottom: 4 }}>how established</div>
            <div className="gym-estab">
              <span className="gym-meter"><i style={{ width: estabPct + '%' }} /></span>
              <span className="gym-hint gym-num">{champion.step < 0 ? 'no gain yet' : `+${established} since best`}</span>
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
          </div>
        </section>
      </aside>
    </>
  );
}
