import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { DOODAD_ASSETS } from './doodadCatalog';

// Hands-on doodad composer: drop whole doodads onto a tile, move/resize them, and tag each
// as front (in front of the unit) or back (behind it). Splitting a single doodad into halves
// is a later concern — here a placed item is a whole doodad assigned to one side of the unit.
// Save writes a JSON composition to disk via the dev server's /__save-doodad endpoint.

// Frame the whole board shares: a 96x180 sprite with the ground-contact anchor at (48,69).
const FRAME_W = 96;
const FRAME_H = 180;
const ANCHOR_X = 48;
const ANCHOR_Y = 69;
const ZOOM = 4; // canvas pixels per frame pixel

const TILE_OPTIONS = ['grass-a', 'grass-c', 'dirt-a', 'stone-a', 'water-a', 'pebble-a', 'sand-a'];
const UNIT_SRC = '/assets/units/knight/navy-blue/south.png';
const tileSrc = (id: string) => `/assets/tiles/textured/${id}.png`;

type Layer = 'front' | 'back';
interface El {
  id: string;
  doodadId: string;
  x: number; // anchor position in frame px
  y: number;
  scale: number;
  layer: Layer;
}

let nextId = 1;

export function DoodadEditor(): ReactElement {
  const [tileId, setTileId] = useState('grass-a');
  const [showUnit, setShowUnit] = useState(true);
  const [els, setEls] = useState<El[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('untitled');
  const [status, setStatus] = useState('');
  const drag = useRef<{ id: string; px: number; py: number; ox: number; oy: number } | null>(null);

  const selected = els.find((e) => e.id === selectedId) ?? null;
  const update = (id: string, patch: Partial<El>) => setEls((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const addDoodad = (doodadId: string) => {
    const id = `el${nextId++}`;
    setEls((list) => [...list, { id, doodadId, x: ANCHOR_X, y: ANCHOR_Y, scale: 1, layer: 'front' }]);
    setSelectedId(id);
  };
  const removeSelected = () => {
    if (!selectedId) return;
    setEls((list) => list.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  };

  // Drag a placed doodad by its anchor; convert canvas delta back to frame px.
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

  const startDrag = (e: El) => (ev: React.PointerEvent) => {
    ev.preventDefault();
    setSelectedId(e.id);
    drag.current = { id: e.id, px: ev.clientX, py: ev.clientY, ox: e.x, oy: e.y };
  };

  const composition = () => ({ tile: tileId, frame: { w: FRAME_W, h: FRAME_H, anchorX: ANCHOR_X, anchorY: ANCHOR_Y }, elements: els.map(({ id: _id, ...rest }) => rest) });

  const save = async () => {
    setStatus('saving…');
    try {
      const res = await fetch('/__save-doodad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, data: composition() }) });
      const json = await res.json();
      setStatus(json.ok ? `saved → ${json.path}` : `error: ${json.error}`);
    } catch (err) {
      setStatus(`error: ${String(err)} (use Download instead)`);
    }
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(composition(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name || 'untitled'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const renderEl = (e: El): ReactElement => {
    const d = DOODAD_ASSETS.find((a) => a.id === e.doodadId);
    const box: CSSProperties = {
      position: 'absolute',
      left: e.x * ZOOM,
      top: e.y * ZOOM,
      width: FRAME_W * ZOOM * e.scale,
      height: FRAME_H * ZOOM * e.scale,
      transform: `translate(${(-ANCHOR_X / FRAME_W) * 100}%, ${(-ANCHOR_Y / FRAME_H) * 100}%)`,
      cursor: 'move',
      outline: e.id === selectedId ? '2px solid #46c8ff' : 'none',
      outlineOffset: 0,
    };
    return (
      <div key={e.id} style={box} onPointerDown={startDrag(e)}>
        {d ? <>
          <img src={d.back} alt="" draggable={false} style={imgFill} />
          <img src={d.front} alt="" draggable={false} style={imgFill} />
        </> : null}
      </div>
    );
  };

  const back = els.filter((e) => e.layer === 'back');
  const front = els.filter((e) => e.layer === 'front');

  return (
    <div style={shell}>
      <aside style={panel}>
        <h2 style={h2}>Doodads</h2>
        <p style={hint}>Click to drop on the tile.</p>
        <div style={paletteGrid}>
          {DOODAD_ASSETS.map((d) => (
            <button key={d.id} type="button" style={paletteBtn} title={`Add ${d.label}`} onClick={() => addDoodad(d.id)}>
              <span style={paletteThumb}><img src={d.front} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /></span>
              <span style={{ fontSize: 11 }}>{d.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <main style={stageWrap}>
        <div style={{ ...stage, width: FRAME_W * ZOOM, height: FRAME_H * ZOOM }} onPointerDown={(ev) => { if (ev.target === ev.currentTarget) setSelectedId(null); }}>
          <div style={{ ...layerBox, zIndex: 0 }}><img src={tileSrc(tileId)} alt="" draggable={false} style={imgAnchored} /></div>
          {back.map(renderEl)}
          {showUnit ? (
            <div style={{ position: 'absolute', left: ANCHOR_X * ZOOM, top: ANCHOR_Y * ZOOM, width: 72 * ZOOM, height: 86 * ZOOM, transform: 'translate(-50%,-78%)', display: 'grid', placeItems: 'center', pointerEvents: 'none', opacity: 0.92 }}>
              <img src={UNIT_SRC} alt="" draggable={false} style={{ maxHeight: 92 * ZOOM, maxWidth: 78 * ZOOM, objectFit: 'contain' }} />
            </div>
          ) : null}
          {front.map(renderEl)}
        </div>
      </main>

      <aside style={panel}>
        <h2 style={h2}>Tile</h2>
        <select value={tileId} onChange={(ev) => setTileId(ev.target.value)} style={input}>
          {TILE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={row}><input type="checkbox" checked={showUnit} onChange={(ev) => setShowUnit(ev.target.checked)} /> Show unit (feet reference)</label>

        <h2 style={h2}>Selected</h2>
        {selected ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#9fb6cc' }}>{DOODAD_ASSETS.find((a) => a.id === selected.doodadId)?.label}</div>
            <div style={segRow}>
              {(['back', 'front'] as Layer[]).map((l) => (
                <button key={l} type="button" style={{ ...seg, ...(selected.layer === l ? segActive : {}) }} onClick={() => update(selected.id, { layer: l })}>{l === 'back' ? 'Behind unit' : 'In front'}</button>
              ))}
            </div>
            <label style={{ fontSize: 12 }}>Size: {selected.scale.toFixed(2)}×
              <input type="range" min={0.15} max={2} step={0.01} value={selected.scale} onChange={(ev) => update(selected.id, { scale: Number(ev.target.value) })} style={{ width: '100%' }} />
            </label>
            <div style={{ fontSize: 11, color: '#8197ad' }}>pos {selected.x.toFixed(0)}, {selected.y.toFixed(0)} — drag on the tile to move</div>
            <button type="button" style={dangerBtn} onClick={removeSelected}>Delete</button>
          </div>
        ) : <p style={hint}>Click a doodad on the tile.</p>}

        <h2 style={h2}>Save</h2>
        <input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="composition name" style={input} />
        <div style={segRow}>
          <button type="button" style={primaryBtn} onClick={save}>Save to disk</button>
          <button type="button" style={seg} onClick={download}>Download JSON</button>
        </div>
        {status ? <p style={{ ...hint, color: status.startsWith('error') ? '#f0a0a0' : '#8fd0a0' }}>{status}</p> : null}
      </aside>
    </div>
  );
}

const imgFill: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'auto' };
const layerBox: CSSProperties = { position: 'absolute', left: ANCHOR_X * ZOOM, top: ANCHOR_Y * ZOOM, width: FRAME_W * ZOOM, height: FRAME_H * ZOOM, transform: 'translate(-50%,-38.333%)', pointerEvents: 'none' };
const imgAnchored: CSSProperties = { width: '100%', height: '100%' };
const shell: CSSProperties = { display: 'grid', gridTemplateColumns: '210px minmax(0,1fr) 250px', gap: 12, height: '100dvh', padding: 14, boxSizing: 'border-box', background: '#071019', color: '#d9e7f7', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' };
const panel: CSSProperties = { background: 'rgba(5,16,25,0.92)', border: '1px solid rgba(67,127,179,0.28)', borderRadius: 8, padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 };
const stageWrap: CSSProperties = { display: 'grid', placeItems: 'center', overflow: 'auto', background: 'rgba(5,16,25,0.6)', border: '1px solid rgba(67,127,179,0.2)', borderRadius: 8 };
const stage: CSSProperties = { position: 'relative', backgroundColor: '#0a1622', backgroundImage: 'linear-gradient(45deg,rgba(120,170,214,0.08) 25%,transparent 25%,transparent 75%,rgba(120,170,214,0.08) 75%),linear-gradient(45deg,rgba(120,170,214,0.08) 25%,transparent 25%,transparent 75%,rgba(120,170,214,0.08) 75%)', backgroundSize: '24px 24px', backgroundPosition: '0 0,12px 12px', borderRadius: 6 };
const h2: CSSProperties = { margin: '6px 0 2px', fontSize: 15 };
const hint: CSSProperties = { margin: 0, fontSize: 12, color: '#8197ad' };
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '6px 8px', background: 'rgba(12,31,48,0.92)', color: '#d8eaff', border: '1px solid rgba(91,157,216,0.38)', borderRadius: 4, font: 'inherit' };
const row: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 };
const paletteGrid: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
const paletteBtn: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 6, background: 'rgba(12,31,48,0.92)', border: '1px solid rgba(91,157,216,0.3)', borderRadius: 6, color: '#cfe3ef', cursor: 'pointer' };
const paletteThumb: CSSProperties = { width: 64, height: 64, display: 'grid', placeItems: 'center', overflow: 'hidden' };
const segRow: CSSProperties = { display: 'flex', gap: 6 };
const seg: CSSProperties = { flex: 1, padding: '6px 8px', background: 'rgba(12,31,48,0.92)', border: '1px solid rgba(91,157,216,0.34)', borderRadius: 4, color: '#cfe3ef', cursor: 'pointer', fontSize: 12 };
const segActive: CSSProperties = { background: 'rgba(25,94,132,0.95)', borderColor: 'rgba(111,210,255,0.76)', color: '#f3fbff' };
const primaryBtn: CSSProperties = { ...seg, background: 'rgba(25,94,132,0.95)', borderColor: 'rgba(111,210,255,0.6)', color: '#f3fbff' };
const dangerBtn: CSSProperties = { ...seg, flex: 'none', background: 'rgba(58,18,18,0.6)', borderColor: 'rgba(216,92,92,0.5)', color: '#f0c0c0' };
