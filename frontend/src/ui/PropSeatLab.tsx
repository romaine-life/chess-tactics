import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { tileAssets, tileFamilies, edgeTiles, muralTiles, type TileAsset } from '../art/tileset';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard, boardLabCellPosition } from '../render/BoardLabBoard';
import { PropSprite } from '../render/BoardStructure';
import { TILE_TEMPLATE } from '../art/tileTemplate';
import { PROP_DEFS, propCells, type PropDef } from '../core/props';
import { pieceSpritePath } from '../core/pieces';
import { ViewPane } from './shared/ViewPane';
import { SliderRow } from './dressing/SliderRow';
import COMMITTED_SEATS from '../core/propSeats.json';

// The prop-seat editor as an embedded Studio Viewer kind (docs/studio-control-architecture.md,
// ADR-0058): it renders into the shared studio shell — the board in `.al-lab-main`, EVERY
// control in the one `.tileset-view-controls` panel, the workspace tabs + kind selector in the
// `header` slot — exactly like NineSliceLab / PortraitLab. It is reached from the Props catalog
// category's Inspect affordance, never a standalone route. It tunes how a multi-cell prop
// (tree/house) SITS on its tiles through the real PropSprite path, then Saves the seat map to
// src/core/propSeats.json (dev endpoint) — the checked-in source PROP_DEFS composes from.

type Seat = { anchorX: number; anchorY: number; scale: number; w?: number; h?: number; base?: string; label?: string };
type Seats = Record<string, Seat>;

const FAMILIES = ['grass', 'dirt', 'stone'] as const;
type Family = (typeof FAMILIES)[number];
const COLS = 9;
const ROWS = 7;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const round2 = (n: number) => Math.round(n * 100) / 100;

// The 8-direction nudge pad, row-major (null = the inert centre dot). vx/vy are SCREEN deltas
// (vx>0 = right, vy>0 = down); `nudge` maps them to anchor deltas. `deg` rotates one up-arrow.
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

export function PropSeatLab({ propId, onPropId, header }: {
  propId: string; onPropId: (id: string) => void; header?: ReactNode;
}): ReactElement {
  const activeId = PROP_DEFS.some((d) => d.id === propId) ? propId : PROP_DEFS[0].id;
  const [family, setFamily] = useState<Family>('grass');
  const [seed, setSeed] = useState(7);
  const [zoom, setZoom] = useState(1.4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGuides, setShowGuides] = useState(true);
  const [showUnit, setShowUnit] = useState(true);
  const [showSavedGhost, setShowSavedGhost] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Seat>>({});
  const [status, setStatus] = useState('');
  const [variantName, setVariantName] = useState('');
  const [renameText, setRenameText] = useState('');
  const drag = useRef<{ px: number; py: number; anchorX: number; anchorY: number } | null>(null);

  const committedSeats = COMMITTED_SEATS as Seats;
  const seats: Seats = { ...committedSeats, ...overrides };
  const def = PROP_DEFS.find((d) => d.id === activeId) as PropDef;
  const liveSeat = seats[activeId];
  const committed = committedSeats[activeId];
  // Base vs copy (the user's model): a base OWNS its sprite (spriteId === id) and can't be deleted;
  // a copy shares another prop's sprite (spriteId !== id) and is free to rename/delete. baseDef is
  // the sprite owner either way (itself for a base), so "make/rename a copy" always roots at the base.
  const isCopy = def.spriteId !== def.id;
  const baseDef = PROP_DEFS.find((d) => d.id === def.spriteId) ?? def;
  // Live gameplay footprint — an override's w/h if set, else the committed def's cells.
  const liveW = liveSeat.w ?? def.w;
  const liveH = liveSeat.h ?? def.h;
  const sameSeat = (a: Seat | undefined, b: Seat | undefined) =>
    !!a && !!b && a.anchorX === b.anchorX && a.anchorY === b.anchorY && a.scale === b.scale && a.w === b.w && a.h === b.h;
  const dirty = Object.keys(overrides).some((id) => !sameSeat(overrides[id], committedSeats[id]));

  // Drop an override once it matches committed again (after a Save's HMR, or an external edit),
  // so a lingering equal override can't pin a prop against the next change to the file.
  useEffect(() => {
    setOverrides((o) => {
      const settled = Object.keys(o).filter((id) => sameSeat(o[id], committedSeats[id]));
      if (!settled.length) return o;
      const next = { ...o };
      for (const id of settled) delete next[id];
      return next;
    });
  });

  // Keep the Rename field showing the selected copy's current name — and re-sync after a rename
  // lands (def.label changes) so it reflects the new name rather than a stale one.
  useEffect(() => { setRenameText(isCopy ? def.label : ''); }, [activeId, def.label, isCopy]);

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
    setOverrides((o) => ({ ...o, [activeId]: { ...(o[activeId] ?? committedSeats[activeId]), ...patch } }));
  };

  const ax = Math.floor((COLS - liveW) / 2);
  const ay = Math.floor((ROWS - liveH) / 2);
  const base0 = boardLabCellPosition({ x: ax, y: ay });
  const groundLeft = base0.left + (((liveW - 1) - (liveH - 1)) / 2) * TILE_TEMPLATE.stepX;
  const groundTop = base0.top + (((liveW - 1) + (liveH - 1)) / 2) * TILE_TEMPLATE.stepY;

  // Visual-direction nudge (vx>0 right, vy>0 down). The anchor is where the frame TOUCHES the
  // ground point, so moving the sprite right/down pulls the anchor left/up — hence anchor -= v.
  const nudge = (vx: number, vy: number, step: number) => {
    setStatus('');
    setOverrides((o) => {
      const cur = o[activeId] ?? committedSeats[activeId];
      return { ...o, [activeId]: { ...cur, anchorX: cur.anchorX - vx * step, anchorY: cur.anchorY - vy * step } };
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
  }, [activeId]);

  const onDragStart = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation(); // don't let the ViewPane start a pan — this drag moves the prop
    ev.currentTarget.setPointerCapture(ev.pointerId);
    drag.current = { px: ev.clientX, py: ev.clientY, anchorX: liveSeat.anchorX, anchorY: liveSeat.anchorY };
  };
  const onDragMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = (ev.clientX - d.px) / zoom;
    const dy = (ev.clientY - d.py) / zoom;
    setSeat({ anchorX: Math.round(d.anchorX - dx / liveSeat.scale), anchorY: Math.round(d.anchorY - dy / liveSeat.scale) });
  };
  const onDragEnd = () => { drag.current = null; };

  const save = async () => {
    // POST only edited entries — the endpoint MERGES, so a save can't drop props this tab
    // didn't touch (stale-tab / two-tab safety).
    const changed = Object.fromEntries(Object.entries(overrides).filter(([id, s]) => !sameSeat(s, committedSeats[id])));
    if (!Object.keys(changed).length) return;
    setStatus('saving…');
    try {
      const res = await fetch('/__prop-seat/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed),
      });
      const json = await res.json();
      setStatus(json.ok ? `saved ${(json.updated ?? []).join(', ')} → ${json.path}` : `error: ${json.error}`);
    } catch (err) {
      setStatus(`error: ${String(err)} — use Copy JSON`);
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(`${JSON.stringify(seats, null, 2)}\n`);
    setStatus('copied propSeats.json to clipboard');
  };

  // Build the sprite seat explicitly (NOT ...liveSeat — that also carries w/h/base/label, which
  // would clobber the sprite FRAME dims). Footprint rides on the def's w/h (liveW/liveH).
  const liveDef: PropDef = { ...def, w: liveW, h: liveH, sprite: { w: def.sprite.w, h: def.sprite.h, anchorX: liveSeat.anchorX, anchorY: liveSeat.anchorY, scale: liveSeat.scale } };
  const savedDef: PropDef = { ...def, sprite: { w: def.sprite.w, h: def.sprite.h, anchorX: committed.anchorX, anchorY: committed.anchorY, scale: committed.scale } };
  const frame = {
    left: groundLeft - liveSeat.anchorX * liveSeat.scale,
    top: groundTop - liveSeat.anchorY * liveSeat.scale,
    width: def.sprite.w * liveSeat.scale,
    height: def.sprite.h * liveSeat.scale,
  };
  const unitCell = { x: ax + liveW, y: ay + liveH - 1 };
  const unitPos = boardLabCellPosition(unitCell);

  // "Share base" size variants (ADR-0059): duplicate the CURRENT prop at its current seat as a new
  // pickable prop that reuses the base sprite. Writes a propSeats.json entry with a `base`; props.ts
  // synthesizes the PROP_DEF. Base = def.spriteId, so this works even when a variant is selected.
  const saveVariant = async () => {
    const suffix = variantName.trim();
    const slug = suffix.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!slug) return;
    const baseId = def.spriteId;
    const baseDef = PROP_DEFS.find((d) => d.id === baseId) ?? def;
    const variantId = `${baseId}-${slug}`;
    // Capture the current footprint only if it differs from the base, so a variant inherits the
    // base's cells by default but keeps a changed footprint if you set one.
    const footprint = (liveW !== baseDef.w || liveH !== baseDef.h) ? { w: liveW, h: liveH } : {};
    setStatus('saving variant…');
    try {
      const res = await fetch('/__prop-seat/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [variantId]: { base: baseId, label: `${baseDef.label} — ${suffix}`, anchorX: liveSeat.anchorX, anchorY: liveSeat.anchorY, scale: liveSeat.scale, ...footprint } }),
      });
      const json = await res.json();
      if (json.ok) { setStatus(`saved variant "${variantId}" — pick it from Prop after reload`); setVariantName(''); }
      else setStatus(`error: ${json.error}`);
    } catch (err) { setStatus(`error: ${String(err)}`); }
  };

  // Rename a copy: change its display name only — id, sprite, seat and footprint are untouched (the
  // endpoint preserves base/w/h when they're omitted). Copies only; bases show no rename control.
  const renameCopy = async () => {
    const label = renameText.trim();
    if (!isCopy || !label || label === def.label) return;
    setStatus('renaming…');
    try {
      const res = await fetch('/__prop-seat/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [activeId]: { base: def.spriteId, label, anchorX: committed.anchorX, anchorY: committed.anchorY, scale: committed.scale } }),
      });
      const json = await res.json();
      setStatus(json.ok ? `renamed to "${label}"` : `error: ${json.error}`);
    } catch (err) { setStatus(`error: ${String(err)}`); }
  };

  // Delete a copy. Only copies are deletable — the base is safe both here (no button) and at the
  // endpoint (it refuses any entry without a `base`). Switch back to the base and drop the override.
  const deleteCopy = async () => {
    if (!isCopy) return;
    setStatus('deleting…');
    try {
      const res = await fetch('/__prop-seat/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeId }),
      });
      const json = await res.json();
      if (json.ok) {
        const removed = activeId;
        onPropId(def.spriteId); // fall back to the base prop
        setOverrides((o) => { const n = { ...o }; delete n[removed]; return n; });
        setStatus(`deleted "${removed}"`);
      } else setStatus(`error: ${json.error}`);
    } catch (err) { setStatus(`error: ${String(err)}`); }
  };

  const toggle = (on: boolean, set: (v: boolean) => void, label: string, title?: string) => (
    <button type="button" className={`ps-toggle ${on ? 'is-on' : ''}`} title={title} onClick={() => set(!on)}>{label}</button>
  );

  // Anchor slider bounds — a generous per-frame window (negatives reachable, well past the frame),
  // derived from the frame dims so the thumb doesn't rescale mid-drag.
  const axMin = -Math.round(def.sprite.w * 0.5);
  const axMax = Math.round(def.sprite.w * 1.5);
  const ayMin = -Math.round(def.sprite.h * 0.5);
  const ayMax = Math.round(def.sprite.h * 1.5);

  return (
    <>
      <style>{PS_CSS}</style>
      <section className="al-lab-main ps-board-main" aria-label="Prop seat preview">
        <ViewPane kind="board" ariaLabel="Prop seat viewport" zoom={zoom} pan={pan} minZoom={0.5} maxZoom={3} onZoomChange={setZoom} onPanChange={setPan}>
          <BoardLabBoard board={board} assetFrameSrc={(a) => a.src} boardZoom={zoom} boardPan={pan} className="ps-board-surface" ariaLabel="Prop seat preview board">
            {showSavedGhost ? <div className="ps-ghost"><PropSprite prop={{ x: ax, y: ay, propId: activeId }} def={savedDef} /></div> : null}
            <PropSprite prop={{ x: ax, y: ay, propId: activeId }} def={liveDef} />
            {showUnit ? (
              <span className="board-unit-seat" style={{ left: unitPos.left, top: unitPos.top, zIndex: unitCell.x + unitCell.y + 20000 }}>
                <img src={pieceSpritePath('knight')} alt="" draggable={false} />
              </span>
            ) : null}
            {showGuides ? (
              <>
                {propCells(ax, ay, liveDef).map((cell) => {
                  const p = boardLabCellPosition(cell);
                  return (
                    <svg key={`g-${cell.x}-${cell.y}`} className="ps-guide"
                      style={{ left: p.left - TILE_TEMPLATE.stepX, top: p.top - TILE_TEMPLATE.stepY }}
                      width={TILE_TEMPLATE.stepX * 2} height={TILE_TEMPLATE.stepY * 2}
                      viewBox={`0 0 ${TILE_TEMPLATE.stepX * 2} ${TILE_TEMPLATE.stepY * 2}`}>
                      <polygon points={`${TILE_TEMPLATE.stepX},0 ${TILE_TEMPLATE.stepX * 2},${TILE_TEMPLATE.stepY} ${TILE_TEMPLATE.stepX},${TILE_TEMPLATE.stepY * 2} 0,${TILE_TEMPLATE.stepY}`}
                        fill="rgba(111,210,255,0.08)" stroke="rgba(111,210,255,0.85)" strokeWidth="1" />
                    </svg>
                  );
                })}
                <div className="ps-cross" style={{ left: groundLeft, top: groundTop }} />
                <div className="ps-frame" style={frame} />
              </>
            ) : null}
            <div className="ps-drag" style={frame}
              onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
              title="Drag to move the prop. Drag empty board to pan · wheel to zoom · arrow keys nudge (Shift = ×10)." />
          </BoardLabBoard>
        </ViewPane>
      </section>

      <aside className="tileset-view-controls" aria-label="Prop seat controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <label className="tileset-category-select" title="Which prop's seat you're tuning.">
              <span>Prop</span>
              <select value={activeId} onChange={(e) => onPropId(e.target.value)} aria-label="Prop">
                {PROP_DEFS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
            <label className="tileset-category-select" title="The ground family under the prop (preview only).">
              <span>Ground</span>
              <select value={family} onChange={(e) => setFamily(e.target.value as Family)} aria-label="Ground family">
                {FAMILIES.map((f) => <option key={f} value={f}>{cap(f)}</option>)}
              </select>
            </label>
            <label className="tileset-catalog-zoom">
              <span>Zoom</span>
              <input type="range" min={0.6} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </label>
            <div className="ps-toggles">
              {toggle(showGuides, setShowGuides, 'Guides', 'Footprint diamonds + the ground point')}
              {toggle(showUnit, setShowUnit, 'Unit', 'A reference knight beside the prop')}
              {toggle(showSavedGhost, setShowSavedGhost, 'Ghost', 'Overlay the saved seat for comparison')}
              <button type="button" className="ps-toggle" onClick={() => setSeed((s) => (s % 9999) + 1)} title="Re-roll the board tiles">↻ Re-roll</button>
            </div>

            <div className="ps-block">
              <span className="ps-ctl-label">Nudge <em>Shift = ×10</em></span>
              <div className="ps-pad">
                {NUDGE_PAD.map((d, i) => d
                  ? <button key={d.key} type="button" className="ps-pad-btn" title={`Nudge ${d.name} (Shift = ×10)`} aria-label={`nudge ${d.name}`}
                      onClick={(ev) => nudge(d.vx, d.vy, ev.shiftKey ? 10 : 1)}><DirArrow deg={d.deg} /></button>
                  : <span key={`c${i}`} className="ps-pad-center" aria-hidden="true" />)}
              </div>
            </div>

            {/* Anchors + scale use the shared SliderRow (ADR-0059): slider to drag, −/+ for single
                increments, ↺ to reset to the saved value. Negatives reach via the slider/steppers. */}
            <SliderRow label={`Anchor X · ${liveSeat.anchorX}`} value={liveSeat.anchorX} set={(v) => setSeat({ anchorX: Math.round(v) })}
              min={axMin} max={axMax} step={1} nudge={1} dflt={committed.anchorX} />
            <SliderRow label={`Anchor Y · ${liveSeat.anchorY}`} value={liveSeat.anchorY} set={(v) => setSeat({ anchorY: Math.round(v) })}
              min={ayMin} max={ayMax} step={1} nudge={1} dflt={committed.anchorY} />
            <SliderRow label={`Scale · ${liveSeat.scale.toFixed(2)}×`} value={liveSeat.scale} set={(v) => setSeat({ scale: round2(v) })}
              min={0.25} max={2} step={0.01} nudge={0.05} dflt={committed.scale} />

            {/* Footprint — how many gameplay cells the prop occupies (placement + blocking rocks).
                Separate from Scale (visual only); the guides + seat reflow as you change it. */}
            <span className="ps-ctl-label" style={{ marginTop: 6 }}>Footprint <em>{liveW} × {liveH} cells</em></span>
            <SliderRow label={`Width · ${liveW}`} value={liveW} set={(v) => setSeat({ w: Math.round(v) })}
              min={1} max={6} step={1} nudge={1} dflt={def.w} />
            <SliderRow label={`Height · ${liveH}`} value={liveH} set={(v) => setSeat({ h: Math.round(v) })}
              min={1} max={6} step={1} nudge={1} dflt={def.h} />

            <p className="ps-saved">saved: ({committed.anchorX}, {committed.anchorY}) @ {committed.scale.toFixed(2)}× · {def.w}×{def.h} cells</p>
            <div className="ps-actions">
              <button type="button" className="tileset-view-action ps-primary" onClick={save} disabled={!dirty}>Save to disk</button>
              <button type="button" className="tileset-view-action" onClick={copy}>Copy JSON</button>
              <button type="button" className="tileset-view-action" onClick={() => setSeat({ ...committed })} disabled={!dirty} title="Reset all three controls to the saved seat">Reset all</button>
            </div>
            {status ? <p className={`ps-status ${status.startsWith('error') ? 'is-error' : ''}`}>{status}</p> : null}
            {dirty && !status ? <p className="ps-status">unsaved changes</p> : null}

            <div className="ps-variant">
              {isCopy ? (
                <>
                  <span className="ps-ctl-label">Copy of {baseDef.label}</span>
                  <span className="ps-variant-row">
                    <input className="ps-variant-input" value={renameText} onChange={(e) => setRenameText(e.target.value)}
                      placeholder={def.label} aria-label="Rename this copy"
                      onKeyDown={(e) => { if (e.key === 'Enter') renameCopy(); }} />
                    <button type="button" className="tileset-view-action" disabled={!renameText.trim() || renameText.trim() === def.label}
                      onClick={renameCopy} title="Rename this copy — its sprite, seat and footprint stay">Rename</button>
                  </span>
                  <span className="ps-variant-row">
                    <button type="button" className="tileset-view-action ps-danger" onClick={deleteCopy}
                      title={`Delete this copy. ${baseDef.label} (the base) is unaffected.`}>Delete this copy</button>
                  </span>
                </>
              ) : (
                <p className="ps-variant-hint"><strong>{def.label}</strong> is a base prop — it owns the sprite and can’t be deleted, only tuned. Make a copy below to vary its size or footprint.</p>
              )}
              <span className="ps-ctl-label" style={{ marginTop: 4 }}>New copy of {baseDef.label}</span>
              <span className="ps-variant-row">
                <input className="ps-variant-input" value={variantName} onChange={(e) => setVariantName(e.target.value)}
                  placeholder="name (e.g. small)" onKeyDown={(e) => { if (e.key === 'Enter') saveVariant(); }} />
                <button type="button" className="tileset-view-action" disabled={!variantName.trim()} onClick={saveVariant}
                  title={`Save the current size as a new copy of ${baseDef.label}`}>Create copy</button>
              </span>
              <p className="ps-variant-hint">A copy shares {baseDef.label}’s sprite at {liveSeat.scale.toFixed(2)}×; tune its scale + footprint on its own. Pick it above after reload.</p>
            </div>
          </div>
        </section>
      </aside>
    </>
  );
}

const PS_CSS = `
/* Fill the main pane and let the shared ViewPane own pan/zoom/fit — same board viewport the
   skirmish board uses, so it pans and never clips (was a bespoke fixed-height overflow:hidden box). */
.ps-board-main { padding: 0; grid-template-rows: minmax(0, 1fr); align-content: stretch; overflow: hidden; }
.ps-board-surface .tileset-generated-board-tile img { image-rendering: pixelated; }
.ps-ghost { display: contents; }
.ps-ghost img { opacity: 0.35; filter: saturate(0.4); }
.ps-guide { position: absolute; pointer-events: none; z-index: 40000; }
.ps-cross { position: absolute; width: 0; height: 0; pointer-events: none; z-index: 40001; }
.ps-cross::before, .ps-cross::after { content: ''; position: absolute; background: rgba(255,196,88,0.95); }
.ps-cross::before { left: -9px; top: -0.5px; width: 18px; height: 1px; }
.ps-cross::after { left: -0.5px; top: -9px; width: 1px; height: 18px; }
.ps-frame { position: absolute; pointer-events: none; z-index: 40000; outline: 1px dashed rgba(140,170,220,0.45); }
.ps-drag { position: absolute; z-index: 45000; cursor: move; }

/* Toggles — a tight wrap of quiet chips (studio instrument idiom, not fat buttons). */
.ps-toggles { display: flex; flex-wrap: wrap; gap: 5px; }
.ps-toggle { box-sizing: border-box; height: 28px; padding: 0 10px; font: inherit; font-size: 12px; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.ps-toggle:hover { background: #17223a; }
.ps-toggle.is-on { background: #1d3354; border-color: #3f74c0; color: #eaf3ff; }

.ps-block { display: grid; gap: 6px; }
.ps-ctl-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #8fa8cc; }
.ps-ctl-label em { font-style: normal; color: #eaf3ff; margin-left: 4px; font-variant-numeric: tabular-nums; font-weight: 600; }

/* 8-direction nudge pad. Explicit border-box cells so the 1px border can't overlap the gap. */
.ps-pad { display: grid; grid-template-columns: repeat(3, 42px); gap: 6px; }
.ps-pad-btn, .ps-pad-center { box-sizing: border-box; width: 42px; height: 38px; display: grid; place-items: center; }
.ps-pad-btn { padding: 0; cursor: pointer; color: #bcd4f2; background: #16233f; border: 1px solid #2a3c5e; border-radius: 6px; }
.ps-pad-btn:hover { background: #1e3054; color: #eaf3ff; }
.ps-pad-btn:active { background: #244071; }
.ps-pad-center::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #33415e; }

.ps-saved { margin: 0; font-size: 11px; color: #6b83a8; font-variant-numeric: tabular-nums; }
.ps-actions { display: flex; gap: 6px; }
.ps-actions .tileset-view-action { flex: 1; }
.ps-primary { background: rgba(29,74,46,0.9) !important; border-color: rgba(63,156,98,0.7) !important; color: #e7ffe9 !important; }
.ps-primary:disabled { opacity: 0.45; }
.ps-status { margin: 0; font-size: 12px; color: #8fd0a0; }
.ps-status.is-error { color: #f0a0a0; }

/* Delete a copy — a quiet danger tone so it reads as destructive without shouting. */
.ps-danger { flex: 1; background: rgba(74,29,29,0.9) !important; border-color: rgba(156,63,63,0.7) !important; color: #ffe7e7 !important; }
.ps-danger:hover { background: rgba(96,36,36,0.95) !important; }

.ps-variant { display: grid; gap: 6px; margin-top: 6px; padding-top: 12px; border-top: 1px solid #1b2740; }
.ps-variant-row { display: flex; gap: 6px; }
.ps-variant-row .tileset-view-action { flex: none; }
.ps-variant-input { flex: 1; min-width: 0; box-sizing: border-box; height: 32px; padding: 0 8px; font: inherit; font-size: 13px;
  color: #eaf3ff; background: #101a2e; border: 1px solid #2a3c5e; border-radius: 5px; }
.ps-variant-hint { margin: 0; font-size: 11px; color: #6b83a8; line-height: 1.4; }
`;
