import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { DOODAD_ASSETS } from './doodadCatalog';

// Doodad-composition composer as an embedded Studio Viewer kind (ADR-0058): arm a doodad from
// the shelf, click the tile to drop it beside a reference unit, then move/resize/flip it and tag
// it front/back. Stage in `.al-lab-main`, EVERY control (palette, placed list, scene, selected,
// save/load) in the one `.tileset-view-controls` panel, workspace tabs + kind selector in the
// `header` slot — reached from the Doodads catalog's "Compose arrangement" affordance, never a
// route. Save writes a JSON composition to disk (dev endpoint); Load is its reset-to-saved
// (cache: no-store, ADR-0057).

const FRAME_W = 96;
const FRAME_H = 180;
const ANCHOR_X = 48;
const ANCHOR_Y = 69;
const ZOOM = 4; // canvas px per frame px
const DEFAULT_SCALE = 0.35; // drop small (≈ shin height, ADR-0015), scale up by eye

const TILE_OPTIONS = ['grass-a', 'grass-c', 'dirt-a', 'stone-a', 'water-a', 'pebble-a', 'sand-a'];
const UNIT_OPTIONS = [{ id: 'pawn', label: 'Pawn' }, { id: 'knight', label: 'Knight' }, { id: 'queen', label: 'Queen' }];
const tileSrc = (id: string) => `/assets/tiles/textured/${id}.png`;
const unitSrc = (kind: string) => `/assets/units/${kind}/navy-blue/south.png`;

type Layer = 'front' | 'back';
interface El { id: string; doodadId: string; x: number; y: number; scale: number; layer: Layer; flip: boolean }

let nextId = 1;
const mkId = () => `el${nextId++}`;

export function DoodadCompLab({ compositionName, onCompositionName, header }: {
  compositionName: string; onCompositionName: (name: string) => void; header?: ReactNode;
}): ReactElement {
  const [tileId, setTileId] = useState('grass-a');
  const [unitKind, setUnitKind] = useState('knight');
  const [showUnit, setShowUnit] = useState(true);
  const [els, setEls] = useState<El[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const name = compositionName;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: string; px: number; py: number; ox: number; oy: number } | null>(null);

  const selected = els.find((e) => e.id === selectedId) ?? null;
  const update = (id: string, patch: Partial<El>) => setEls((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => { setEls((list) => list.filter((e) => e.id !== id)); setSelectedId((s) => (s === id ? null : s)); };

  const placeAt = (fx: number, fy: number) => {
    if (!armed) return;
    const id = mkId();
    setEls((list) => [...list, { id, doodadId: armed, x: fx, y: fy, scale: DEFAULT_SCALE, layer: 'front', flip: false }]);
    setSelectedId(id);
  };
  const duplicate = () => {
    if (!selected) return;
    const id = mkId();
    setEls((list) => [...list, { ...selected, id, x: selected.x + 10, y: selected.y + 6 }]);
    setSelectedId(id);
  };

  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      update(d.id, { x: d.ox + (ev.clientX - d.px) / ZOOM, y: d.oy + (ev.clientY - d.py) / ZOOM });
    };
    const up = () => { drag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = document.activeElement?.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') { if (ev.key === 'Escape') (document.activeElement as HTMLElement).blur(); return; }
      if (ev.key === 'Escape') { setArmed(null); setSelectedId(null); return; }
      if (!selectedId) return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); remove(selectedId); return; }
      const step = ev.shiftKey ? 5 : 1;
      const nudge: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const delta = nudge[ev.key];
      if (delta) { ev.preventDefault(); setEls((list) => list.map((e) => (e.id === selectedId ? { ...e, x: e.x + delta[0], y: e.y + delta[1] } : e))); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const startDrag = (e: El) => (ev: React.PointerEvent) => {
    ev.preventDefault(); ev.stopPropagation();
    setSelectedId(e.id);
    drag.current = { id: e.id, px: ev.clientX, py: ev.clientY, ox: e.x, oy: e.y };
  };
  const onStagePointerDown = (ev: React.PointerEvent) => {
    if (ev.target !== ev.currentTarget) return;
    if (armed && stageRef.current) {
      const r = stageRef.current.getBoundingClientRect();
      placeAt((ev.clientX - r.left) / ZOOM, (ev.clientY - r.top) / ZOOM);
    } else {
      setSelectedId(null);
    }
  };

  const composition = () => ({ tile: tileId, frame: { w: FRAME_W, h: FRAME_H, anchorX: ANCHOR_X, anchorY: ANCHOR_Y }, elements: els.map(({ id: _id, ...rest }) => rest) });
  const save = async () => {
    setStatus('saving…');
    try {
      const res = await fetch('/__save-doodad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, data: composition() }) });
      const json = await res.json();
      setStatus(json.ok ? `saved → ${json.path}` : `error: ${json.error}`);
    } catch (err) { setStatus(`error: ${String(err)} — use Download`); }
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(composition(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${name || 'untitled'}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const load = async () => {
    setStatus('loading…');
    try {
      const safe = name.replace(/[^a-z0-9_-]/gi, '-');
      // Load IS this editor's reset-to-saved (ADR-0057), so read the current file uncached.
      const res = await fetch(`/assets/doodads/compositions/${safe}.json`, { cache: 'no-store' });
      if (!res.ok) { setStatus(`not found: ${safe}.json`); return; }
      const data = await res.json();
      if (data.tile) setTileId(data.tile);
      setEls((data.elements ?? []).map((e: Omit<El, 'id'>) => ({ ...e, flip: Boolean(e.flip), id: mkId() })));
      setSelectedId(null);
      setStatus(`loaded ${safe}.json`);
    } catch (err) { setStatus(`error: ${String(err)}`); }
  };

  const renderEl = (e: El): ReactElement => {
    const d = DOODAD_ASSETS.find((a) => a.id === e.doodadId);
    const box: CSSProperties = {
      position: 'absolute', left: e.x * ZOOM, top: e.y * ZOOM,
      width: FRAME_W * ZOOM * e.scale, height: FRAME_H * ZOOM * e.scale,
      transform: `translate(${(-ANCHOR_X / FRAME_W) * 100}%, ${(-ANCHOR_Y / FRAME_H) * 100}%) scaleX(${e.flip ? -1 : 1})`,
      cursor: 'move', outline: e.id === selectedId ? '1px dashed rgba(70,200,255,0.5)' : 'none',
    };
    return (
      <div key={e.id} style={box} onPointerDown={startDrag(e)}>
        {d ? <><img src={d.back} alt="" draggable={false} style={imgFill} /><img src={d.front} alt="" draggable={false} style={imgFill} /></> : null}
      </div>
    );
  };

  const back = els.filter((e) => e.layer === 'back');
  const front = els.filter((e) => e.layer === 'front');
  const shinY = (ANCHOR_Y - 86 * 0.22) * ZOOM;

  return (
    <>
      <style>{DC_CSS}</style>
      <section className="al-lab-main" aria-label="Doodad composition stage">
        <div className="dc-stage-wrap">
          <div ref={stageRef} data-testid="doodad-stage" className="dc-stage"
            style={{ width: FRAME_W * ZOOM, height: FRAME_H * ZOOM, cursor: armed ? 'copy' : 'default' }} onPointerDown={onStagePointerDown}>
            <div className="dc-layer" style={{ zIndex: 0 }}><img src={tileSrc(tileId)} alt="" draggable={false} style={imgAnchored} /></div>
            {back.map(renderEl)}
            {showUnit ? (
              <>
                <div style={{ position: 'absolute', left: ANCHOR_X * ZOOM, top: ANCHOR_Y * ZOOM, width: 72 * ZOOM, height: 86 * ZOOM, transform: 'translate(-50%,-78%)', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                  <img src={unitSrc(unitKind)} alt="" draggable={false} style={{ maxHeight: 92 * ZOOM, maxWidth: 78 * ZOOM, objectFit: 'contain' }} />
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: shinY, height: 0, borderTop: '1px dashed rgba(111,210,255,0.55)', pointerEvents: 'none' }} />
                <span style={{ position: 'absolute', left: 4, top: shinY - 14, fontSize: 10, color: '#6fd2ff', pointerEvents: 'none' }}>shin line — keep doodads below</span>
              </>
            ) : null}
            {front.map(renderEl)}
          </div>
        </div>
      </section>

      <aside className="tileset-view-controls" aria-label="Doodad composition controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}

            <div className="dc-group">
              <span className="dc-label">Doodads {armed ? '· click the tile to drop (Esc to stop)' : '· click to arm'}</span>
              <div className="dc-palette">
                {DOODAD_ASSETS.map((d) => (
                  <button key={d.id} type="button" className={`dc-swatch ${armed === d.id ? 'is-on' : ''}`} title={`Arm ${d.label}`} onClick={() => setArmed((a) => (a === d.id ? null : d.id))}>
                    <span className="dc-thumb"><img src={d.front} alt="" /></span>
                    <span className="dc-swatch-label">{d.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="dc-group">
              <span className="dc-label">Placed ({els.length})</span>
              {els.length === 0 ? <p className="dc-hint">Nothing yet.</p> : (
                <div className="dc-list">
                  {[...els].reverse().map((e) => {
                    const d = DOODAD_ASSETS.find((a) => a.id === e.doodadId);
                    return (
                      <button key={e.id} type="button" className={`dc-row ${e.id === selectedId ? 'is-on' : ''}`} onClick={() => setSelectedId(e.id)}>
                        <span>{d?.label ?? e.doodadId}</span>
                        <span className="dc-row-tag">{e.layer}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="dc-group">
              <span className="dc-label">Scene</span>
              <label className="tileset-category-select"><span>Tile</span>
                <select value={tileId} onChange={(ev) => setTileId(ev.target.value)}>{TILE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              </label>
              <label className="tileset-category-select"><span>Unit</span>
                <select value={unitKind} onChange={(ev) => setUnitKind(ev.target.value)}>{UNIT_OPTIONS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
              </label>
              <button type="button" className={`dc-toggle ${showUnit ? 'is-on' : ''}`} onClick={() => setShowUnit((v) => !v)}>Unit + shin line</button>
            </div>

            <div className="dc-group">
              <span className="dc-label">Selected</span>
              {selected ? (
                <>
                  <div className="dc-hint">{DOODAD_ASSETS.find((a) => a.id === selected.doodadId)?.label}</div>
                  <div className="dc-seg">
                    {(['back', 'front'] as Layer[]).map((l) => <button key={l} type="button" className={`dc-toggle ${selected.layer === l ? 'is-on' : ''}`} onClick={() => update(selected.id, { layer: l })}>{l === 'back' ? 'Behind unit' : 'In front'}</button>)}
                  </div>
                  <label className="tileset-catalog-zoom"><span>Size {selected.scale.toFixed(2)}×</span>
                    <input type="range" min={0.1} max={1.5} step={0.01} value={selected.scale} onChange={(ev) => update(selected.id, { scale: Number(ev.target.value) })} />
                  </label>
                  <div className="dc-seg">
                    <button type="button" className="dc-toggle" onClick={() => update(selected.id, { flip: !selected.flip })}>Flip ⇄</button>
                    <button type="button" className="dc-toggle" onClick={duplicate}>Duplicate</button>
                    <button type="button" className="dc-toggle dc-danger" onClick={() => remove(selected.id)}>Delete</button>
                  </div>
                  <div className="dc-hint">drag on tile to move · arrows nudge · Del removes</div>
                </>
              ) : <p className="dc-hint">Pick a doodad on the tile or in the Placed list.</p>}
            </div>

            <div className="dc-group">
              <span className="dc-label">Composition</span>
              <input className="dc-name" value={name} onChange={(ev) => onCompositionName(ev.target.value)} placeholder="composition name" />
              <div className="dc-seg">
                <button type="button" className="tileset-view-action" onClick={save}>Save to disk</button>
                <button type="button" className="tileset-view-action" onClick={load}>Load</button>
                <button type="button" className="tileset-view-action" onClick={download}>Download</button>
              </div>
              {status ? <p className={`dc-status ${status.startsWith('error') || status.startsWith('not found') ? 'is-error' : ''}`}>{status}</p> : null}
            </div>
          </div>
        </section>
      </aside>
    </>
  );
}

const imgFill: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'auto' };
const imgAnchored: CSSProperties = { width: '100%', height: '100%' };

const DC_CSS = `
.dc-stage-wrap { align-self: stretch; display: grid; place-items: center; min-height: 60vh; overflow: auto;
  border-radius: 4px; background: rgba(5,16,25,0.6); }
.dc-stage { position: relative; border-radius: 6px; background-color: #0a1622;
  background-image: linear-gradient(45deg,rgba(120,170,214,0.08) 25%,transparent 25%,transparent 75%,rgba(120,170,214,0.08) 75%),linear-gradient(45deg,rgba(120,170,214,0.08) 25%,transparent 25%,transparent 75%,rgba(120,170,214,0.08) 75%);
  background-size: 24px 24px; background-position: 0 0,12px 12px; }
.dc-layer { position: absolute; left: ${ANCHOR_X * ZOOM}px; top: ${ANCHOR_Y * ZOOM}px; width: ${FRAME_W * ZOOM}px; height: ${FRAME_H * ZOOM}px; transform: translate(-50%,-38.333%); pointer-events: none; }
.dc-group { display: grid; gap: 6px; }
.dc-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #8fa8cc; }
.dc-hint { margin: 0; font-size: 12px; color: #8197ad; }
.dc-palette { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.dc-swatch { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px; cursor: pointer;
  background: #101a2e; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 6px; }
.dc-swatch:hover { background: #17223a; }
.dc-swatch.is-on { background: #1d3354; border-color: #3f74c0; }
.dc-thumb { width: 54px; height: 54px; display: grid; place-items: center; overflow: hidden; }
.dc-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
.dc-swatch-label { font-size: 11px; }
.dc-list { display: grid; gap: 4px; }
.dc-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; cursor: pointer;
  background: #101a2e; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 4px; font-size: 12px; }
.dc-row.is-on { background: #1d3354; border-color: #3f74c0; }
.dc-row-tag { font-size: 10px; opacity: 0.8; }
.dc-seg { display: flex; gap: 6px; flex-wrap: wrap; }
.dc-toggle { box-sizing: border-box; flex: 1; min-width: 0; height: 30px; padding: 0 10px; font: inherit; font-size: 12px; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.dc-toggle:hover { background: #17223a; }
.dc-toggle.is-on { background: #1d3354; border-color: #3f74c0; color: #eaf3ff; }
.dc-danger { background: rgba(58,18,18,0.6); border-color: rgba(216,92,92,0.5); color: #f0c0c0; }
.dc-name { box-sizing: border-box; width: 100%; height: 32px; padding: 0 8px; font: inherit; font-size: 13px;
  color: #eaf3ff; background: #101a2e; border: 1px solid #2a3c5e; border-radius: 5px; }
.dc-status { margin: 0; font-size: 12px; color: #8fd0a0; }
.dc-status.is-error { color: #f0a0a0; }
`;
