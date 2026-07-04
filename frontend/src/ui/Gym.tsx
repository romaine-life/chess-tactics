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
import { SliderRow } from './dressing/SliderRow';
import { createFromLevel } from '../game/setup';
import { PARAM_LABELS, encodeWeights } from '../game/tuning';
import { DEFAULT_EVAL_WEIGHTS } from '../core/ai';
import { stateAtPosition, positionBalance, type BookPosition, type OpeningBookSettings } from '../game/openingBook';
import type { GymRequest, GymResponse } from '../lab/gymWorker';
import {
  loadBooks, saveBooks, makeNewBook, deleteBook, updateBook,
  DEFAULT_BOOK_SETTINGS, type BooksBlob, type GymSession,
} from '../lab/openingBooks';

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
.gym-estab { display:flex; align-items:center; gap:8px; margin:4px 0 10px; }
.gym-meter { flex:1; height:6px; border-radius:3px; background:#0c1116; border:1px solid #29323f; overflow:hidden; }
.gym-meter i { display:block; height:100%; background:linear-gradient(90deg,#e0b24a,#46d6b8); }
.gym-weights { display:grid; grid-template-columns:1fr auto auto; gap:2px 10px; font:12px ui-monospace,monospace; }
.gym-weights .k { color:#93a0b0; } .gym-weights .v { text-align:right; font-variant-numeric:tabular-nums; }
.gym-weights .d { text-align:right; width:56px; } .gym-weights .d.up { color:#5ad19a; } .gym-weights .d.dn { color:#e0685f; } .gym-weights .d.z { color:#5c6875; }
.gym-num { font-family:ui-monospace,monospace; font-variant-numeric:tabular-nums; }
.gym-steps { display:flex; gap:0; margin-bottom:12px; }
.gym-steps button { border:1px solid #29323f; background:#161d26; color:#93a0b0; padding:6px 16px; font-size:12px; }
.gym-steps button:first-child { border-radius:6px 0 0 6px; } .gym-steps button:last-child { border-radius:0 6px 6px 0; border-left:none; }
.gym-steps button.active { background:#212b37; color:#e7ebf0; }
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
.gym-postable td.bal { text-align:right; white-space:nowrap; }
.gym-bal { display:inline-flex; align-items:center; gap:6px; justify-content:flex-end; }
.gym-bal-meter { width:44px; height:6px; border-radius:3px; background:#0c1116; border:1px solid #29323f; position:relative; overflow:hidden; }
.gym-bal-meter i { position:absolute; top:0; bottom:0; }
.gym-bal-meter i.pos { left:50%; background:#5ad19a; } .gym-bal-meter i.neg { right:50%; background:#e0685f; }
.gym-empty-book { color:#5c6875; font-size:12px; padding:16px; text-align:center; }
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
.gym-gen-btn { border:1px solid #46d6b8; background:#46d6b8; color:#06231d; font-weight:700; border-radius:6px; padding:7px 10px; font-size:13px; cursor:pointer; }
.gym-gen-btn:disabled { opacity:.5; cursor:default; }
.gym-count { color:#93a0b0; font-size:12px; }
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

/** The gym bench for one level: opening-book management + inspection (Stage 1) and
 * retained-session SPSA training over the active book (Stage 2). Each book keeps its
 * own training session, so switching books restores champion + curve exactly. */
export function GymViewer({ levelId, header }: { levelId?: string; header?: ReactNode }): ReactElement {
  const workspaceLevels = useCampaigns((s) => s.levels);
  useEffect(() => { void ensureCampaignsHydrated(); }, []);
  const level = levelId ? workspaceLevels[levelId] : undefined;

  // Per-level book store (localStorage-backed). blob + activeId are the source of
  // truth; positions and each book's training session live inside the blob.
  const [blob, setBlob] = useState<BooksBlob>(() => (levelId ? loadBooks(levelId) : { nextId: 1, books: [] }));
  const [activeId, setActiveId] = useState<number | undefined>(() => blob.books[0]?.id);
  const [mode, setMode] = useState<'book' | 'train'>('book');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [depth, setDepth] = useState(2);
  const [viewZoom, setViewZoom] = useState(0.72);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const playingRef = useRef(false);
  // The auto-run loop calls the LATEST stepOnce through this ref, so the worker's
  // long-lived onmessage never fires a stale (ready=false) closure.
  const stepOnceRef = useRef<() => void>(() => {});

  const activeBook = useMemo(() => blob.books.find((b) => b.id === activeId), [blob, activeId]);

  // Latest blob/activeId in refs so the async worker callbacks (step results, the
  // auto-run loop) always read/write the freshest state, not a stale closure.
  const blobRef = useRef(blob); blobRef.current = blob;
  const activeIdRef = useRef(activeId); activeIdRef.current = activeId;

  // Persist + set state together — every meaningful change goes through here.
  const commit = useCallback((next: BooksBlob) => {
    blobRef.current = next;
    setBlob(next);
    if (levelId) saveBooks(levelId, next);
  }, [levelId]);

  // When the level changes, load its books and reset selection/session view.
  useEffect(() => {
    playingRef.current = false; setPlaying(false);
    const loaded = levelId ? loadBooks(levelId) : { nextId: 1, books: [] };
    blobRef.current = loaded;
    setBlob(loaded);
    setActiveId(loaded.books[0]?.id);
    setSelectedIndex(0);
    setMode('book');
  }, [levelId]);

  // (Re)create the worker whenever the level or the search depth changes. The worker
  // is a PURE stepper — books/sessions travel in messages — so it never re-inits on a
  // book switch or a training step.
  useEffect(() => {
    if (!level) { setReady(false); return undefined; }
    playingRef.current = false; setPlaying(false); setReady(false); setGenerating(false); setBusy(false);
    const worker = new Worker(new URL('../lab/gymWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<GymResponse>) => {
      const msg = event.data;
      if (msg.type === 'ready') {
        setReady(true);
      } else if (msg.type === 'book') {
        setGenerating(false);
        // Store the freshly generated positions on the active book (session unchanged
        // — regenerating positions doesn't reset training unless the user makes a new
        // book). Reset the inspected index into range.
        const id = activeIdRef.current;
        const cur = blobRef.current.books.find((b) => b.id === id);
        if (cur) commit(updateBook(blobRef.current, { ...cur, positions: msg.positions }));
        setSelectedIndex(0);
      } else if (msg.type === 'point') {
        setBusy(false);
        // Write the updated session back onto the active book and persist.
        const id = activeIdRef.current;
        const cur = blobRef.current.books.find((b) => b.id === id);
        if (cur) commit(updateBook(blobRef.current, { ...cur, session: msg.session }));
        if (playingRef.current) setTimeout(() => stepOnceRef.current(), 20);
      } else {
        setBusy(false); setGenerating(false); playingRef.current = false; setPlaying(false);
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
    setMode('book');
  }, [activeBook, commit]);

  const onDeleteBook = useCallback(() => {
    if (activeId === undefined) return;
    playingRef.current = false; setPlaying(false);
    const next = deleteBook(blobRef.current, activeId);
    commit(next);
    setActiveId(next.books[0]?.id);
    setSelectedIndex(0);
  }, [activeId, commit]);

  const onSelectBook = useCallback((id: number) => {
    playingRef.current = false; setPlaying(false);
    setActiveId(id);
    setSelectedIndex(0);
  }, []);

  const generate = useCallback(() => {
    if (!workerRef.current || !ready || !activeBook) return;
    setGenerating(true);
    workerRef.current.postMessage({ type: 'generate', settings: activeBook.settings } as GymRequest);
  }, [ready, activeBook]);

  // --- Training --------------------------------------------------------------
  const canTrain = ready && !!activeBook && activeBook.positions.length > 0;
  const stepOnce = useCallback(() => {
    const worker = workerRef.current;
    const id = activeIdRef.current;
    const cur = blobRef.current.books.find((b) => b.id === id);
    if (!worker || !ready || !cur || cur.positions.length === 0) { playingRef.current = false; setPlaying(false); return; }
    setBusy(true);
    worker.postMessage({ type: 'step', book: cur.positions, session: cur.session } as GymRequest);
  }, [ready]);
  stepOnceRef.current = stepOnce;

  const togglePlay = useCallback(() => {
    if (playingRef.current) { playingRef.current = false; setPlaying(false); return; }
    playingRef.current = true; setPlaying(true); stepOnce();
  }, [stepOnce]);

  // --- Derived training view (from the active book's retained session) -------
  const session: GymSession | undefined = activeBook?.session;
  const traj = session?.traj ?? [];
  const champion = session?.champion ?? { step: -1, score: 0.5, theta: REF_VEC };
  const established = session?.established ?? 0;
  const lastScore = traj.length ? traj[traj.length - 1].score : 0.5;
  const champVec = champion.theta;
  const estabPct = champion.step < 0 ? 0 : Math.min(96, 40 + established * 4);

  // Convergence chart (reads the active book's trajectory).
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
    ctx.strokeStyle = 'rgba(147,160,176,.4)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pad, Y(0.5)); ctx.lineTo(W - pad, Y(0.5)); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(X(0), Y(traj[0].score));
    traj.forEach((p, i) => ctx.lineTo(X(i), Y(p.score)));
    ctx.strokeStyle = '#46d6b8'; ctx.lineWidth = 2; ctx.stroke();
    const last = traj[traj.length - 1];
    ctx.beginPath(); ctx.arc(X(n - 1), Y(last.score), 4, 0, 7); ctx.fillStyle = '#46d6b8'; ctx.fill();
  }, [traj]);

  // Board at the inspected position (the SELECTED book position, both modes).
  const selectedPos = activeBook?.positions[Math.min(selectedIndex, posCount - 1)];
  const board = useMemo(() => {
    if (!level) return null;
    const base = levelToEditorBoard(level);
    const game = selectedPos ? stateAtPosition(level, selectedPos) : createFromLevel(level, settings.seedBase);
    return { ...base, units: unitsForGamePieces(game.pieces) };
  }, [level, selectedPos, settings.seedBase]);

  // Balance scaled to a small meter (roughly one minor piece per half-bar).
  const balMeter = (bal: number): ReactElement => {
    const pct = Math.min(50, Math.abs(bal) / 6 * 50);
    return (
      <span className="gym-bal">
        <span className="gym-num">{bal > 0 ? '+' : ''}{bal.toFixed(1)}</span>
        <span className="gym-bal-meter"><i className={bal >= 0 ? 'pos' : 'neg'} style={{ width: pct + '%' }} /></span>
      </span>
    );
  };

  return (
    <>
      <style>{GYM_CSS}</style>
      <section className="al-lab-main gym-main" aria-label="Gym output">
        {!level ? (
          <p className="gym-hint">Pick a level from the Gym catalog to train the AI on it.</p>
        ) : (
          <>
            <div className="gym-head">
              <nav className="gym-steps" aria-label="Gym steps">
                <button type="button" className={mode === 'book' ? 'active' : ''} onClick={() => setMode('book')}>1 · Opening book</button>
                <button type="button" className={mode === 'train' ? 'active' : ''} onClick={() => setMode('train')} disabled={!activeBook}>2 · Train</button>
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
              ) : (
                <h3 style={{ margin: '4px 0 8px' }}>
                  Training book <span className="gym-num">#{activeBook?.id}</span> — board shows position <span className="gym-num">{posCount ? Math.min(selectedIndex, posCount - 1) + 1 : 0}</span> of <span className="gym-num">{posCount}</span>
                </h3>
              )}
            </div>

            {mode === 'book' && activeBook && posCount > 0 ? (
              <div className="gym-postable-wrap">
                <table className="gym-postable">
                  <thead>
                    <tr><th style={{ width: 52 }}>seed</th><th>opening moves</th><th style={{ width: 96, textAlign: 'right' }}>balance</th></tr>
                  </thead>
                  <tbody>
                    {activeBook.positions.map((pos, i) => {
                      const label = movesLabel(pos.moves);
                      return (
                        <tr key={`${pos.seed}-${i}`} className={i === selectedIndex ? 'is-sel' : ''} onClick={() => setSelectedIndex(i)}>
                          <td className="gym-num">#{pos.seed}</td>
                          <td className="moves" title={label}>{label}</td>
                          <td className="bal">{balMeter(positionBalance(level, pos))}</td>
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
        )}
      </section>

      <aside className="tileset-view-controls gym-controls" aria-label="Gym controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="gym-hint">{level ? `Training: ${level.name} (${MODE_NAME[level.objective]})` : 'No level — pick one in the Catalog.'}</p>

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
                  <label className="gl-field">size (positions)
                    <input type="number" min={1} max={64} value={settings.size} onChange={(e) => setSettings({ size: Math.max(1, Number(e.target.value) || 1) })} />
                  </label>
                  <label className="gl-field">opening plies
                    <input type="number" min={0} max={12} value={settings.plies} onChange={(e) => setSettings({ plies: Math.max(0, Number(e.target.value) || 0) })} />
                  </label>
                  <label className="gl-field">seed base
                    <input type="number" min={1} value={settings.seedBase} onChange={(e) => setSettings({ seedBase: Math.max(1, Number(e.target.value) || 1) })} />
                  </label>
                  <SliderRow label="variety" value={settings.variety} set={(v) => setSettings({ variety: v })} min={0} max={1} step={0.05} nudge={0.05} dflt={DEFAULT_BOOK_SETTINGS.variety} />
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
                <label className="gl-field">search depth
                  <input type="number" min={1} max={5} value={depth} onChange={(e) => setDepth(Math.max(1, Number(e.target.value) || 1))} />
                </label>

                <div className="gym-run-row">
                  <button type="button" className="play" onClick={togglePlay} disabled={!canTrain}>{playing ? '⏸ pause' : '▶ run'}</button>
                  <button type="button" onClick={stepOnce} disabled={!canTrain || busy || playing}>⏭ step</button>
                </div>
                {!ready ? <p className="gym-hint">Preparing…</p>
                  : !activeBook ? <p className="gym-hint">No active book.</p>
                  : activeBook.positions.length === 0 ? <p className="gym-hint">This book has no positions — generate them in step 1 first.</p>
                  : busy && !playing ? <p className="gym-hint">Playing this step's games…</p> : null}

                <h3>Convergence <span className="gym-hint">({traj.length} steps)</span></h3>
                <div className="gym-conv">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span className="gym-hint">strength vs shipped AI</span>
                    <span className="gym-scorebig" style={{ fontSize: 18, color: lastScore > 0.505 ? '#5ad19a' : lastScore < 0.495 ? '#e0685f' : '#e7ebf0' }}>{lastScore.toFixed(3)}</span>
                  </div>
                  <canvas ref={convRef} width={560} height={170} aria-label="convergence curve" />
                  <p className="gym-hint" style={{ marginTop: 6 }}>0.5 = even with the shipped weights. A flat line at 0.5 = the games are drawing, no signal to climb.</p>
                </div>

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
              </>
            ) : null}
          </div>
        </section>
      </aside>
    </>
  );
}
