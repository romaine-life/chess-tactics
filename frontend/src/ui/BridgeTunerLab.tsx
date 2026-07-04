import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { tileAssets, tileFamilies, edgeTiles, muralTiles, type TileAsset } from '../art/tileset';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard } from '../render/BoardLabBoard';
import { BRIDGE_MATERIALS, FEATURE_MATERIAL_LABELS, type BridgeMaterial, type FeatureMaterial, type BridgeOrientation } from '../core/featureAutotile';
import { committedBridgeTune, type BridgeTune } from '../core/bridgeTune';
import { ViewPane } from './shared/ViewPane';
import { SliderRow } from './dressing/SliderRow';

// The bridge SEATING tuner as an embedded Studio Viewer kind (ADR-0058): it renders into the shared
// studio shell (board in .al-lab-main, controls in the one .tileset-view-controls panel, workspace
// tabs in the `header` slot) — like PropSeatLab. The baked bridge sprites tile by construction; this
// eye-tunes how they SIT (scale + screen offset) on the board, then Saves the per-material seating to
// src/core/bridgeTune.json (dev endpoint) — the same committed baseline every board renderer reads.
// Reset derives from that committed baseline (ADR-0057), never a hand-copied literal.

const COLS = 11;
const ROWS = 9;
const round2 = (n: number) => Math.round(n * 100) / 100;

// A preview board that exercises EVERY autotile case the tune must look right in: a vertical run
// (thru + both caps), a horizontal run, and a lone single — all crossing water.
function bridgeFeatureMap(material: BridgeMaterial): Map<string, { kind: 'bridge'; material: FeatureMaterial; orientation: BridgeOrientation }> {
  const m = new Map<string, { kind: 'bridge'; material: FeatureMaterial; orientation: BridgeOrientation }>();
  const put = (x: number, y: number, o: BridgeOrientation) => m.set(`${x},${y}`, { kind: 'bridge', material, orientation: o });
  for (let y = 1; y <= 6; y += 1) put(2, y, 'v');   // vertical run: capS at y1, thru, capN at y6
  for (let x = 4; x <= 9; x += 1) put(x, 1, 'h');   // horizontal run: capW..thru..capE
  put(8, 5, 'v');                                    // a lone single cell
  return m;
}

const sameTune = (a: BridgeTune | undefined, b: BridgeTune): boolean =>
  !!a && a.scale === b.scale && a.offsetX === b.offsetX && a.offsetY === b.offsetY;

export function BridgeTunerLab({ header }: { header?: ReactNode }): ReactElement {
  const materials = BRIDGE_MATERIALS.length ? BRIDGE_MATERIALS : (['stone'] as const);
  const [material, setMaterial] = useState<BridgeMaterial>(materials[0]);
  const [seed, setSeed] = useState(5);
  const [zoom, setZoom] = useState(1.5);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [overrides, setOverrides] = useState<Record<string, BridgeTune>>({});
  const [status, setStatus] = useState('');

  const committed = committedBridgeTune(material);
  const live: BridgeTune = { ...committed, ...overrides[material] };
  const dirty = !!overrides[material] && !sameTune(overrides[material], committed);

  // Once an override matches committed again (after a Save's HMR reload of the JSON), drop it so a
  // stale-but-equal override can't pin the tune against the next external edit. (PropSeatLab pattern.)
  useEffect(() => {
    setOverrides((o) => {
      const settled = Object.keys(o).filter((mat) => sameTune(o[mat], committedBridgeTune(mat)));
      if (!settled.length) return o;
      const next = { ...o };
      for (const mat of settled) delete next[mat];
      return next;
    });
  });

  const board = useMemo(
    () => solveSocketBoard({
      assets: tileAssets as readonly TileAsset[],
      terrainMap: Array.from({ length: COLS * ROWS }, () => 'water'),
      seed,
      columns: COLS,
      rows: ROWS,
      familyAssets: tileFamilies,
      edgeAssets: edgeTiles,
      muralEdges: muralTiles,
      featureMap: bridgeFeatureMap(material),
    }),
    [material, seed],
  );

  const setTune = (patch: Partial<BridgeTune>) => {
    setStatus('');
    setOverrides((o) => ({ ...o, [material]: { ...(o[material] ?? committed), ...patch } }));
  };

  const save = async () => {
    if (!dirty) return;
    setStatus('saving…');
    try {
      const res = await fetch('/__bridge-tuner/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [material]: live }),
      });
      const json = await res.json();
      setStatus(json.ok ? `saved ${(json.updated ?? []).join(', ')} → ${json.path}` : `error: ${json.error}`);
    } catch (err) {
      setStatus(`error: ${String(err)} — use Copy JSON`);
    }
  };
  const copy = async () => {
    const table = { ...(materials.reduce((acc, mat) => ({ ...acc, [mat]: committedBridgeTune(mat) }), {})), [material]: live };
    await navigator.clipboard.writeText(`${JSON.stringify(table, null, 2)}\n`);
    setStatus('copied bridgeTune.json to clipboard');
  };

  return (
    <>
      <style>{BT_CSS}</style>
      <section className="al-lab-main bt-board-main" aria-label="Bridge seating preview">
        <ViewPane kind="board" ariaLabel="Bridge tuner viewport" zoom={zoom} pan={pan} minZoom={0.5} maxZoom={3} onZoomChange={setZoom} onPanChange={setPan}>
          <BoardLabBoard board={board} assetFrameSrc={(a) => a.src} boardZoom={zoom} boardPan={pan}
            className="bt-board-surface" ariaLabel="Bridge tuner preview board" bridgeTuneOverride={live} />
        </ViewPane>
      </section>

      <aside className="tileset-view-controls" aria-label="Bridge tuner controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <label className="tileset-category-select" title="Which bridge material's seating you're tuning.">
              <span>Bridge</span>
              <select value={material} onChange={(e) => setMaterial(e.target.value as BridgeMaterial)} aria-label="Bridge material">
                {materials.map((m) => <option key={m} value={m}>{FEATURE_MATERIAL_LABELS[m as FeatureMaterial] ?? m}</option>)}
              </select>
            </label>
            <label className="tileset-catalog-zoom">
              <span>Zoom</span>
              <input type="range" min={0.6} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </label>
            <div className="bt-toggles">
              <button type="button" className="bt-toggle" onClick={() => setSeed((s) => (s % 9999) + 1)} title="Re-roll the water tiles">↻ Re-roll</button>
            </div>

            {/* Scale + screen-offset use the shared SliderRow (ADR-0059): slider to drag, −/+ to step,
                ↺ to reset to the committed value. Scale grows the deck about the tile centre (>1 keeps
                the run overlapping — never a gap); offsets nudge the whole span into alignment. */}
            <SliderRow label={`Scale · ${live.scale.toFixed(2)}×`} value={live.scale} set={(v) => setTune({ scale: round2(v) })}
              min={0.5} max={2} step={0.01} nudge={0.05} dflt={committed.scale} />
            <SliderRow label={`Offset X · ${live.offsetX}px`} value={live.offsetX} set={(v) => setTune({ offsetX: Math.round(v) })}
              min={-40} max={40} step={1} nudge={1} dflt={committed.offsetX} />
            <SliderRow label={`Offset Y · ${live.offsetY}px`} value={live.offsetY} set={(v) => setTune({ offsetY: Math.round(v) })}
              min={-40} max={40} step={1} nudge={1} dflt={committed.offsetY} />

            <p className="bt-saved">saved: {committed.scale.toFixed(2)}× · ({committed.offsetX}, {committed.offsetY})px</p>
            <div className="bt-actions">
              <button type="button" className="tileset-view-action bt-primary" onClick={save} disabled={!dirty}>Save to disk</button>
              <button type="button" className="tileset-view-action" onClick={copy}>Copy JSON</button>
              <button type="button" className="tileset-view-action" onClick={() => setTune({ ...committed })} disabled={!dirty} title="Reset scale + offsets to the saved seating">Reset all</button>
            </div>
            {status ? <p className={`bt-status ${status.startsWith('error') ? 'is-error' : ''}`}>{status}</p> : null}
            {dirty && !status ? <p className="bt-status">unsaved changes</p> : null}
            <p className="bt-hint">The preview shows a vertical run, a horizontal run and a lone span over water — the seating applies to every bridge tile identically, so what tiles here tiles in play.</p>
          </div>
        </section>
      </aside>
    </>
  );
}

const BT_CSS = `
.bt-board-main { padding: 0; grid-template-rows: minmax(0, 1fr); align-content: stretch; overflow: hidden; }
.bt-board-surface .tileset-generated-board-tile img { image-rendering: pixelated; }
.bt-toggles { display: flex; flex-wrap: wrap; gap: 5px; }
.bt-toggle { box-sizing: border-box; height: 28px; padding: 0 10px; font: inherit; font-size: 12px; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.bt-toggle:hover { background: #17223a; }
.bt-saved { margin: 0; font-size: 11px; color: #6b83a8; font-variant-numeric: tabular-nums; }
.bt-actions { display: flex; gap: 6px; }
.bt-actions .tileset-view-action { flex: 1; }
.bt-primary { background: rgba(29,74,46,0.9) !important; border-color: rgba(63,156,98,0.7) !important; color: #e7ffe9 !important; }
.bt-primary:disabled { opacity: 0.45; }
.bt-status { margin: 0; font-size: 12px; color: #8fd0a0; }
.bt-status.is-error { color: #f0a0a0; }
.bt-hint { margin: 0; font-size: 11px; color: #6b83a8; line-height: 1.4; }
`;
