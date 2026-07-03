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

// The 8-direction nudge pad, row-major (null = the inert centre dot). vx/vy are SCREEN
// deltas (vx>0 = right, vy>0 = down); `nudge` maps them to anchor deltas. `deg` rotates
// one up-pointing arrow to the compass direction, so all eight arrows are one crisp shape.
const NUDGE_PAD: Array<{ key: string; name: string; vx: number; vy: number; deg: number } | null> = [
  { key: 'nw', name: 'up-left', vx: -1, vy: -1, deg: 315 },
  { key: 'n', name: 'up', vx: 0, vy: -1, deg: 0 },
  { key: 'ne', name: 'up-right', vx: 1, vy: -1, deg: 45 },
  { key: 'w', name: 'left', vx: -1, vy: 0, deg: 270 },
  null,
  { key: 'e', name: 'right', vx: 1, vy: 0, deg: 90 },
  { key: 'sw', name: 'down-left', vx: -1, vy: 1, deg: 225 },
  { key: 's', name: 'down', vx: 0, vy: 1, deg: 180 },
  { key: 'se', name: 'down-right', vx: 1, vy: 1, deg: 135 },
];

// One up-pointing arrow, drawn (not a font glyph) so every rotation is pixel-identical.
function DirArrow({ deg }: { deg: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ display: 'block', transform: `rotate(${deg}deg)` }}>
      <path d="M12 4 L19 13 L14.5 13 L14.5 20 L9.5 20 L9.5 13 L5 13 Z" fill="currentColor" />
    </svg>
  );
}

// Anchor value row: a left label, an exact-entry number box (nudging is the pad's job), and
// a per-control ↺ that resets JUST this axis to its saved value (ADR-0057). The native number
// spinner is hidden — under `color-scheme: dark` Chrome draws it near-invisible and down-only.
function SeatNumber({ label, value, onCommit, onReset, atSaved }: {
  label: string; value: number; onCommit: (n: number) => void; onReset: () => void; atSaved: boolean;
}) {
  return (
    <div className="pl-axis">
      <span className="pl-axis-name">{label}</span>
      <input
        type="number"
        className="pl-axis-input"
        value={value}
        aria-label={label}
        onChange={(ev) => {
          // Guard the empty/mid-edit field: '' coerces to 0 and would teleport the prop.
          const v = ev.target.value;
          if (v !== '' && Number.isFinite(Number(v))) onCommit(Number(v));
        }}
      />
      <button type="button" className="pl-mini-reset" title={`Reset ${label} to saved`} aria-label={`reset ${label}`}
        disabled={atSaved} onClick={onReset}>↺</button>
    </div>
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

  // Visual-direction nudge: move the sprite by (vx, vy) SCREEN steps (vx>0 right, vy>0 down).
  // The anchor is where the frame TOUCHES the fixed ground point, so moving the sprite right/
  // down means pulling the anchor LEFT/UP within the frame — hence anchor -= v. Shared by the
  // pad and the arrow keys so both agree.
  const nudge = (vx: number, vy: number, step: number) => {
    setStatus('');
    setOverrides((o) => {
      const cur = o[propId] ?? (COMMITTED_SEATS as Seats)[propId];
      return { ...o, [propId]: { ...cur, anchorX: cur.anchorX - vx * step, anchorY: cur.anchorY - vy * step } };
    });
  };
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = document.activeElement?.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      const move: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      const dir = move[ev.key];
      if (!dir) return;
      ev.preventDefault();
      nudge(dir[0], dir[1], ev.shiftKey ? 10 : 1);
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
          <p className="pl-hint">Nudge with the pad (or arrow keys), or drag the prop. The blue diamonds are the tiles the prop occupies; the cross is the ground point its anchor seats on.</p>

          <div className="pl-controls">
            <div className="pl-num">
              <span className="pl-ctl-label">Nudge <em>Shift = ×10</em></span>
              <div className="pl-pad">
                {NUDGE_PAD.map((d, i) => d
                  ? (
                    <button key={d.key} type="button" className="pl-pad-btn" title={`Nudge ${d.name} (Shift = ×10)`} aria-label={`nudge ${d.name}`}
                      onClick={(ev) => nudge(d.vx, d.vy, ev.shiftKey ? 10 : 1)}><DirArrow deg={d.deg} /></button>
                  )
                  : <span key={`c${i}`} className="pl-pad-center" aria-hidden="true" />)}
              </div>
            </div>

            <div className="pl-axes">
              <SeatNumber label="Anchor X" value={liveSeat.anchorX} onCommit={(n) => setSeat({ anchorX: n })}
                onReset={() => setSeat({ anchorX: committed.anchorX })} atSaved={liveSeat.anchorX === committed.anchorX} />
              <SeatNumber label="Anchor Y" value={liveSeat.anchorY} onCommit={(n) => setSeat({ anchorY: n })}
                onReset={() => setSeat({ anchorY: committed.anchorY })} atSaved={liveSeat.anchorY === committed.anchorY} />
            </div>

            <div className="pl-num">
              <span className="pl-ctl-label">Scale <em>{liveSeat.scale.toFixed(2)}×</em></span>
              <span className="pl-num-row">
                <span className="pl-slider">
                  <input
                    type="range" min={0.25} max={2} step={0.01} value={liveSeat.scale} aria-label="Scale"
                    onChange={(ev) => setSeat({ scale: round2(Number(ev.target.value)) })}
                  />
                  <input
                    type="number" min={0.25} max={2} step={0.05} value={liveSeat.scale} aria-label="Scale exact"
                    className="pl-scale-exact"
                    onChange={(ev) => { const v = Number(ev.target.value); if (Number.isFinite(v) && v > 0) setSeat({ scale: round2(v) }); }}
                  />
                </span>
                <button type="button" className="pl-mini-reset" title="Reset scale to saved" aria-label="reset scale"
                  disabled={liveSeat.scale === committed.scale} onClick={() => setSeat({ scale: committed.scale })}>↺</button>
              </span>
            </div>
          </div>

          <p className="pl-committed">saved: ({committed.anchorX}, {committed.anchorY}) @ {committed.scale.toFixed(2)}×</p>

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

/* Control stack: each control is a labelled block. Interactive rows are 34px tall so the
   column reads as a tidy stack (ADR-0057 per-control grain — every control has its own ↺). */
.pl-controls { display: grid; gap: 16px; }
.pl-num { display: grid; gap: 6px; min-width: 0; }
.pl-ctl-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #8fa8cc; }
.pl-ctl-label em { font-style: normal; color: #eaf3ff; margin-left: 4px; font-variant-numeric: tabular-nums; font-weight: 600; }
.pl-num-row { display: flex; gap: 8px; align-items: stretch; }

/* 8-direction nudge pad: a 3×3 grid of arrow buttons around an inert centre dot. */
.pl-pad { display: grid; grid-template-columns: repeat(3, 40px); grid-auto-rows: 32px; gap: 5px; }
.pl-pad-btn { display: grid; place-items: center; padding: 0; cursor: pointer; color: #bcd4f2;
  background: #16233f; border: 1px solid #2a3c5e; border-radius: 6px; }
.pl-pad-btn:hover { background: #1e3054; color: #eaf3ff; }
.pl-pad-btn:active { background: #244071; }
.pl-pad-center { display: grid; place-items: center; }
.pl-pad-center::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #33415e; }

/* Anchor X / Y: label-left rows (exact entry — nudging is the pad's job), each with its own
   reset so the ↺ unambiguously belongs to that axis. */
.pl-axes { display: grid; gap: 8px; }
.pl-axis { display: grid; grid-template-columns: 68px 1fr 34px; gap: 8px; align-items: center; }
.pl-axis-name { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #8fa8cc; }
.pl-axis-input { min-width: 0; height: 34px; box-sizing: border-box; text-align: center;
  font: inherit; font-size: 15px; color: #eaf3ff; background: #101a2e; border: 1px solid #2a3c5e; border-radius: 6px; }
.pl-axis-input::-webkit-outer-spin-button, .pl-axis-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.pl-axis-input[type=number] { appearance: textfield; -moz-appearance: textfield; }

/* Slider + a small exact-entry box. */
.pl-slider { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px; height: 34px; }
.pl-slider input[type=range] { flex: 1 1 auto; min-width: 0; }
.pl-scale-exact { flex: none; width: 52px; height: 30px; box-sizing: border-box; text-align: center;
  font: inherit; font-size: 13px; color: #eaf3ff; background: #101a2e; border: 1px solid #2a3c5e; border-radius: 6px; }
.pl-scale-exact::-webkit-outer-spin-button, .pl-scale-exact::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.pl-scale-exact[type=number] { appearance: textfield; -moz-appearance: textfield; }

/* Per-control ↺ (ADR-0057): resets ONLY this control to its saved value; set apart from
   the stepper and disabled when already saved, so it doubles as a per-control dirty light. */
.pl-mini-reset { flex: none; width: 34px; height: 34px; padding: 0; font-size: 15px; line-height: 1; cursor: pointer;
  background: #0f1930; color: #9fd0ff; border: 1px solid #2a3c5e; border-radius: 6px; display: grid; place-items: center; }
.pl-mini-reset:hover:not(:disabled) { background: #17233f; color: #d7ecff; }
.pl-mini-reset:disabled { opacity: 0.3; cursor: default; }

.pl-committed { margin: 0; font-size: 11px; color: #6b83a8; font-variant-numeric: tabular-nums; }
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
