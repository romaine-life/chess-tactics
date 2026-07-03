import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { tileAssets, tileFamilies, edgeTiles, muralTiles, type TileAsset } from '../art/tileset';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard, boardLabCellPosition } from '../render/BoardLabBoard';
import { PropSprite } from '../render/BoardStructure';
import { TILE_TEMPLATE } from '../art/tileTemplate';
import { PROP_DEFS, propCells, type PropDef } from '../core/props';
import { pieceSpritePath } from '../core/pieces';
import COMMITTED_SEATS from '../core/propSeats.json';

// Prop seat lab: eye-tune how a multi-cell prop (tree/house) SITS on its tiles. The prop
// renders through the real PropSprite/BoardStructure path on a real solved board, so what
// seats here is exactly what the game and the level editor draw. Drag the prop (or arrow
// keys) to move its contact anchor, slide Scale to grow/shrink it, then Save — the dev
// server MERGES the edited props into src/core/propSeats.json, the checked-in source
// PROP_DEFS composes from. State model: the lab holds only edit OVERRIDES on top of the
// committed JSON — when Save's write HMR-reloads the JSON module (or another tab/git pull
// changes it), untouched props follow the file instead of a stale mount-time snapshot.
// Route: /prop-lab?prop=cottage&family=grass.

type Seat = { anchorX: number; anchorY: number; scale: number };
type Seats = Record<string, Seat>;

const FAMILIES = ['grass', 'dirt', 'stone'] as const;
type Family = (typeof FAMILIES)[number];
const COLS = 9;
const ROWS = 7;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const round2 = (n: number) => Math.round(n * 100) / 100;

// Anchor number field with explicit −/+ steppers (Shift = ×10) and a per-control ↺ that
// resets JUST this field to its saved value (ADR-0057: every control resets on its own).
// The native number-input spinner is hidden: under the app's `color-scheme: dark` Chrome
// draws it so low-contrast that only the hovered half reads — it looked down-only.
function SeatNumber({ label, value, onCommit, onReset, atSaved }: {
  label: string; value: number; onCommit: (n: number) => void; onReset: () => void; atSaved: boolean;
}) {
  return (
    <label className="pl-num">{label}
      <span className="pl-num-row">
        <button type="button" className="pl-step" title="−1 (Shift: −10)" aria-label={`decrease ${label}`}
          onClick={(ev) => onCommit(value - (ev.shiftKey ? 10 : 1))}>−</button>
        <input
          type="number"
          value={value}
          onChange={(ev) => {
            // Guard the empty/mid-edit field: '' coerces to 0 and would teleport the prop.
            const v = ev.target.value;
            if (v !== '' && Number.isFinite(Number(v))) onCommit(Number(v));
          }}
        />
        <button type="button" className="pl-step" title="+1 (Shift: +10)" aria-label={`increase ${label}`}
          onClick={(ev) => onCommit(value + (ev.shiftKey ? 10 : 1))}>+</button>
        <button type="button" className="pl-mini-reset" title={`Reset ${label} to saved`} aria-label={`reset ${label}`}
          disabled={atSaved} onClick={onReset}>↺</button>
      </span>
    </label>
  );
}

export function PropLab(): ReactElement {
  const params = new URLSearchParams(window.location.search);
  const [propId, setPropId] = useState<string>(() => {
    const p = params.get('prop');
    return PROP_DEFS.some((d) => d.id === p) ? (p as string) : 'cottage';
  });
  const [family, setFamily] = useState<Family>(() => {
    const f = params.get('family') as Family;
    return FAMILIES.includes(f) ? f : 'grass';
  });
  const [seed, setSeed] = useState(() => {
    const s = parseInt(params.get('seed') ?? '', 10);
    return Number.isFinite(s) ? s : 7;
  });
  const [zoom, setZoom] = useState(1.5);
  const [showGuides, setShowGuides] = useState(true);
  const [showUnit, setShowUnit] = useState(true);
  const [showSavedGhost, setShowSavedGhost] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Seat>>({});
  const [status, setStatus] = useState('');
  const drag = useRef<{ px: number; py: number; anchorX: number; anchorY: number } | null>(null);

  const committedSeats = COMMITTED_SEATS as Seats;
  const seats: Seats = { ...committedSeats, ...overrides };
  const def = PROP_DEFS.find((d) => d.id === propId) as PropDef;
  const liveSeat = seats[propId];
  const committed = committedSeats[propId];
  const sameSeat = (a: Seat | undefined, b: Seat | undefined) =>
    !!a && !!b && a.anchorX === b.anchorX && a.anchorY === b.anchorY && a.scale === b.scale;
  const dirty = Object.keys(overrides).some((id) => !sameSeat(overrides[id], committedSeats[id]));

  // After a Save lands (or the file changes externally) the JSON module hot-reloads and an
  // override may now MATCH the committed value. Drop it — a lingering equal override would
  // pin that prop against the next external change to the file.
  useEffect(() => {
    setOverrides((o) => {
      const settled = Object.keys(o).filter((id) => sameSeat(o[id], committedSeats[id]));
      if (!settled.length) return o;
      const next = { ...o };
      for (const id of settled) delete next[id];
      return next;
    });
  });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('prop', propId); p.set('family', family); p.set('seed', String(seed));
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p.toString()}`);
  }, [propId, family, seed]);

  const board = useMemo(
    () => solveSocketBoard({
      assets: tileAssets as readonly TileAsset[],
      terrainMap: Array.from({ length: COLS * ROWS }, () => family),
      seed,
      columns: COLS,
      rows: ROWS,
      familyAssets: tileFamilies,
      edgeAssets: edgeTiles,
      muralEdges: muralTiles,
    }),
    [family, seed],
  );

  const setSeat = (patch: Partial<Seat>) => {
    setStatus('');
    setOverrides((o) => ({ ...o, [propId]: { ...(o[propId] ?? committedSeats[propId]), ...patch } }));
  };

  // Anchor cell: centre the footprint on the board. The seat's fixed ground point is the
  // footprint centre — same math as StructureSprite, re-derived here only to place guides.
  const ax = Math.floor((COLS - def.w) / 2);
  const ay = Math.floor((ROWS - def.h) / 2);
  const base0 = boardLabCellPosition({ x: ax, y: ay });
  const groundLeft = base0.left + (((def.w - 1) - (def.h - 1)) / 2) * TILE_TEMPLATE.stepX;
  const groundTop = base0.top + (((def.w - 1) + (def.h - 1)) / 2) * TILE_TEMPLATE.stepY;

  // Visual-direction nudges: the anchor is where the frame TOUCHES the fixed ground point,
  // so moving the sprite right/down means pulling the anchor left/up within the frame.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = document.activeElement?.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      const step = ev.shiftKey ? 10 : 1;
      const move: Record<string, [number, number]> = {
        ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
      };
      const delta = move[ev.key];
      if (!delta) return;
      ev.preventDefault();
      setStatus('');
      setOverrides((o) => {
        const cur = o[propId] ?? (COMMITTED_SEATS as Seats)[propId];
        return { ...o, [propId]: { ...cur, anchorX: cur.anchorX + delta[0], anchorY: cur.anchorY + delta[1] } };
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [propId]);

  const onDragStart = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    drag.current = { px: ev.clientX, py: ev.clientY, anchorX: liveSeat.anchorX, anchorY: liveSeat.anchorY };
  };
  const onDragMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // Client px → board px is the board zoom only (pans/centering are pure translation).
    const dx = (ev.clientX - d.px) / zoom;
    const dy = (ev.clientY - d.py) / zoom;
    setSeat({
      anchorX: Math.round(d.anchorX - dx / liveSeat.scale),
      anchorY: Math.round(d.anchorY - dy / liveSeat.scale),
    });
  };
  const onDragEnd = () => { drag.current = null; };

  const save = async () => {
    // POST only the edited entries — the endpoint MERGES into the file, so a save can never
    // drop or revert props this tab didn't touch (stale-tab / two-tab safety).
    const changed = Object.fromEntries(
      Object.entries(overrides).filter(([id, s]) => !sameSeat(s, committedSeats[id])),
    );
    if (!Object.keys(changed).length) return;
    setStatus('saving…');
    try {
      const res = await fetch('/__prop-seat/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changed),
      });
      const json = await res.json();
      setStatus(json.ok ? `saved ${(json.updated ?? []).join(', ')} → ${json.path} (commit it to keep it)` : `error: ${json.error}`);
    } catch (err) {
      setStatus(`error: ${String(err)} — use Copy JSON`);
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(`${JSON.stringify(seats, null, 2)}\n`);
    setStatus('copied propSeats.json to clipboard');
  };

  const liveDef: PropDef = { ...def, sprite: { w: def.sprite.w, h: def.sprite.h, ...liveSeat } };
  const savedDef: PropDef = { ...def, sprite: { w: def.sprite.w, h: def.sprite.h, ...committed } };
  // The frame bbox in board px — the drag handle, and the dashed frame guide.
  const frame = {
    left: groundLeft - liveSeat.anchorX * liveSeat.scale,
    top: groundTop - liveSeat.anchorY * liveSeat.scale,
    width: def.sprite.w * liveSeat.scale,
    height: def.sprite.h * liveSeat.scale,
  };
  const unitCell = { x: ax + def.w, y: ay + def.h - 1 };
  const unitPos = boardLabCellPosition(unitCell);

  return (
    <section className="pl">
      <style>{PL_CSS}</style>
      <header className="pl-bar">
        <nav className="pl-seg">
          {PROP_DEFS.map((d) => (
            <button key={d.id} type="button" className={`pl-tab ${d.id === propId ? 'is-active' : ''}`} onClick={() => setPropId(d.id)}>{d.label}</button>
          ))}
        </nav>
        <div className="pl-seg">
          {FAMILIES.map((f) => (
            <button key={f} type="button" className={`pl-tab ${f === family ? 'is-active' : ''}`} onClick={() => setFamily(f)}>{cap(f)}</button>
          ))}
          <button type="button" className="pl-tab" onClick={() => setSeed((s) => (s % 9999) + 1)}>↻ Re-roll</button>
        </div>
        <div className="pl-seg">
          <button type="button" className="pl-tab" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>−</button>
          <span className="pl-zoom">{zoom.toFixed(2)}×</span>
          <button type="button" className="pl-tab" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>+</button>
          <button type="button" className={`pl-tab ${showGuides ? 'is-active' : ''}`} onClick={() => setShowGuides((v) => !v)}>Guides</button>
          <button type="button" className={`pl-tab ${showUnit ? 'is-active' : ''}`} onClick={() => setShowUnit((v) => !v)}>Unit</button>
          <button type="button" className={`pl-tab ${showSavedGhost ? 'is-active' : ''}`} onClick={() => setShowSavedGhost((v) => !v)} title="Overlay the saved seat for comparison">Ghost</button>
        </div>
      </header>

      <div className="pl-body">
        <div className="pl-board">
          <BoardLabBoard board={board} assetFrameSrc={(a) => a.src} boardZoom={zoom} ariaLabel="Prop seat preview board">
            {showSavedGhost ? (
              <div className="pl-ghost"><PropSprite prop={{ x: ax, y: ay, propId }} def={savedDef} /></div>
            ) : null}
            <PropSprite prop={{ x: ax, y: ay, propId }} def={liveDef} />
            {showUnit ? (
              <span className="board-unit-seat" style={{ left: unitPos.left, top: unitPos.top, zIndex: unitCell.x + unitCell.y + 20000 }}>
                <img src={pieceSpritePath('knight')} alt="" draggable={false} />
              </span>
            ) : null}
            {showGuides ? (
              <>
                {propCells(ax, ay, def).map((cell) => {
                  const p = boardLabCellPosition(cell);
                  return (
                    <svg
                      key={`g-${cell.x}-${cell.y}`}
                      className="pl-guide"
                      style={{ left: p.left - TILE_TEMPLATE.stepX, top: p.top - TILE_TEMPLATE.stepY }}
                      width={TILE_TEMPLATE.stepX * 2}
                      height={TILE_TEMPLATE.stepY * 2}
                      viewBox={`0 0 ${TILE_TEMPLATE.stepX * 2} ${TILE_TEMPLATE.stepY * 2}`}
                    >
                      <polygon
                        points={`${TILE_TEMPLATE.stepX},0 ${TILE_TEMPLATE.stepX * 2},${TILE_TEMPLATE.stepY} ${TILE_TEMPLATE.stepX},${TILE_TEMPLATE.stepY * 2} 0,${TILE_TEMPLATE.stepY}`}
                        fill="rgba(111,210,255,0.08)"
                        stroke="rgba(111,210,255,0.85)"
                        strokeWidth="1"
                      />
                    </svg>
                  );
                })}
                <div className="pl-cross" style={{ left: groundLeft, top: groundTop }} />
                <div className="pl-frame" style={frame} />
              </>
            ) : null}
            <div
              className="pl-drag"
              style={frame}
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
              title="Drag to move the prop. Arrow keys nudge (Shift = ×10)."
            />
          </BoardLabBoard>
        </div>

        <aside className="pl-panel">
          <h2>{def.label}</h2>
          <p className="pl-hint">Drag the prop, or nudge with arrow keys (Shift = ×10). The blue diamonds are the tiles the prop occupies; the cross is the ground point its anchor seats on.</p>

          <div className="pl-fields">
            <SeatNumber label="anchor X" value={liveSeat.anchorX} onCommit={(n) => setSeat({ anchorX: n })}
              onReset={() => setSeat({ anchorX: committed.anchorX })} atSaved={liveSeat.anchorX === committed.anchorX} />
            <SeatNumber label="anchor Y" value={liveSeat.anchorY} onCommit={(n) => setSeat({ anchorY: n })}
              onReset={() => setSeat({ anchorY: committed.anchorY })} atSaved={liveSeat.anchorY === committed.anchorY} />
          </div>

          <label className="pl-scale">Scale {liveSeat.scale.toFixed(2)}×
            <span className="pl-scale-row">
              <input
                type="range" min={0.25} max={2} step={0.01} value={liveSeat.scale}
                onChange={(ev) => setSeat({ scale: round2(Number(ev.target.value)) })}
              />
              <button type="button" className="pl-mini-reset" title="Reset scale to saved" aria-label="reset scale"
                disabled={liveSeat.scale === committed.scale} onClick={() => setSeat({ scale: committed.scale })}>↺</button>
            </span>
          </label>
          <div className="pl-fields">
            <label>exact
              <input
                type="number" min={0.25} max={2} step={0.01} value={liveSeat.scale}
                onChange={(ev) => { const v = Number(ev.target.value); if (Number.isFinite(v) && v > 0) setSeat({ scale: round2(v) }); }}
              />
            </label>
            <div className="pl-committed">
              saved: ({committed.anchorX}, {committed.anchorY}) @ {committed.scale.toFixed(2)}×
            </div>
          </div>

          <div className="pl-actions">
            <button type="button" className="pl-btn pl-btn--primary" onClick={save} disabled={!dirty}>Save to disk</button>
            <button type="button" className="pl-btn" onClick={copy}>Copy JSON</button>
            <button type="button" className="pl-btn" onClick={() => setSeat({ ...committed })} disabled={!dirty} title="Reset all three controls to the saved seat">Reset all</button>
          </div>
          {status ? <p className={`pl-status ${status.startsWith('error') ? 'is-error' : ''}`}>{status}</p> : null}
          {dirty && !status ? <p className="pl-status">unsaved changes</p> : null}
        </aside>
      </div>
    </section>
  );
}

const PL_CSS = `
.pl { position: fixed; inset: var(--app-header-h) 0 0 0; z-index: 5; display: flex; flex-direction: column;
  background: #0a0c12; color: #d7e6ff; font-family: var(--ds-font-sans, system-ui, sans-serif); }
.pl-bar { display: flex; align-items: center; gap: 14px; padding: 9px 16px; background: #0d1626; border-bottom: 1px solid #1b2740; flex-wrap: wrap; }
.pl-seg { display: flex; gap: 4px; align-items: center; }
.pl-zoom { font-size: 12px; color: #8fa8cc; min-width: 44px; text-align: center; }
.pl-tab { appearance: none; height: 30px; padding: 0 12px; font-size: 13px; font-family: inherit; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.pl-tab:hover { background: #17223a; }
.pl-tab.is-active { background: #1d3354; border-color: #3f74c0; color: #eaf3ff; }
.pl-body { display: flex; flex: 1 1 auto; min-height: 0; }
.pl-board { position: relative; flex: 1 1 auto; min-width: 0; overflow: hidden;
  background: radial-gradient(120% 90% at 50% 18%, #16202f 0%, #0b1018 70%); }
.pl-board .tileset-generated-board-tile img { image-rendering: pixelated; }
.pl-ghost { display: contents; }
.pl-ghost img { opacity: 0.35; filter: saturate(0.4); }
.pl-guide { position: absolute; pointer-events: none; z-index: 40000; }
.pl-cross { position: absolute; width: 0; height: 0; pointer-events: none; z-index: 40001; }
.pl-cross::before, .pl-cross::after { content: ''; position: absolute; background: rgba(255,196,88,0.95); }
.pl-cross::before { left: -9px; top: -0.5px; width: 18px; height: 1px; }
.pl-cross::after { left: -0.5px; top: -9px; width: 1px; height: 18px; }
.pl-frame { position: absolute; pointer-events: none; z-index: 40000; outline: 1px dashed rgba(140,170,220,0.45); }
.pl-drag { position: absolute; z-index: 45000; cursor: move; }
.pl-panel { flex: 0 0 260px; padding: 14px; background: #0c1322; border-left: 1px solid #1b2740;
  display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.pl-panel h2 { margin: 0; font-size: 16px; color: #eaf3ff; }
.pl-hint { margin: 0; font-size: 12px; color: #8197ad; line-height: 1.45; }
.pl-fields { display: flex; gap: 8px; align-items: end; }
.pl-fields label { display: grid; gap: 3px; font-size: 12px; color: #9fb6cc; flex: 1; }
.pl-fields input, .pl-scale input[type=number] { width: 100%; box-sizing: border-box; padding: 6px 8px; background: #101a2e;
  color: #d8eaff; border: 1px solid #2a3c5e; border-radius: 4px; font: inherit; font-size: 13px; }
/* The −/+ buttons are the stepper; the native spinner reads down-only on the dark scheme. */
.pl-fields input::-webkit-outer-spin-button, .pl-fields input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.pl-fields input[type=number] { appearance: textfield; -moz-appearance: textfield; }
.pl-num-row { display: flex; gap: 4px; }
.pl-num-row input { flex: 1; min-width: 0; text-align: center; }
.pl-step { flex: none; width: 28px; padding: 0; font-size: 15px; line-height: 1; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 4px; }
.pl-step:hover { background: #17223a; }
/* Per-control ↺ (ADR-0057): resets just this control to its saved value; disabled when
   already saved so it doubles as a per-control dirty indicator. */
.pl-mini-reset { flex: none; width: 26px; padding: 0; font-size: 13px; line-height: 1; cursor: pointer;
  background: #0f1930; color: #9fd0ff; border: 1px solid #2a3c5e; border-radius: 4px; }
.pl-mini-reset:hover:not(:disabled) { background: #17223a; }
.pl-mini-reset:disabled { opacity: 0.35; cursor: default; }
.pl-scale { display: grid; gap: 4px; font-size: 12px; color: #9fb6cc; }
.pl-scale-row { display: flex; gap: 6px; align-items: center; }
.pl-scale-row input[type=range] { flex: 1; min-width: 0; }
.pl-committed { font-size: 11px; color: #5f769b; padding-bottom: 8px; }
.pl-actions { display: flex; gap: 6px; }
.pl-btn { flex: 1; padding: 7px 8px; font-size: 12px; font-family: inherit; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.pl-btn:hover { background: #17223a; }
.pl-btn:disabled { opacity: 0.45; cursor: default; }
.pl-btn--primary { background: #1d4a2e; border-color: #3f9c62; color: #e7ffe9; }
.pl-btn--primary:hover:not(:disabled) { background: #226038; }
.pl-status { margin: 0; font-size: 12px; color: #8fd0a0; }
.pl-status.is-error { color: #f0a0a0; }
`;
