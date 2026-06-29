import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { TerrainType } from '../core/types';
import { AUTHORED_SAMPLE_KEYS, authoredSampleKeyFor, previewArrival, previewSample, previewTerrain, type SampleKey } from '../sfx';
import { sfxSampleWaveform, sfxSampleWaveformCached } from '../sfxWaveform';
import { ASSIGNABLE_TERRAINS, SFX_ASSETS, type SfxAsset } from './sfxCatalog';

// Draft SFX assignments live in localStorage so they survive reloads. They do NOT change
// the running game — they're a proposal you craft here and hand to Claude (the "Copy for
// Claude" button), who bakes the final values into TERRAIN_SAMPLE / playArrival.
const ASSIGN_STORE_KEY = 'chess-tactics-sfx-assignments-v1';
const ARRIVAL_STORE_KEY = 'chess-tactics-sfx-arrival-v1';

type FiringMode = 'per-unit' | 'once';
interface ArrivalSettings { sound: string; volume: number; firing: FiringMode }
// Current baked-in behaviour: the 'arrival' set, ~0.55 call gain, one thump per unit.
const DEFAULT_ARRIVAL: ArrivalSettings = { sound: 'arrival', volume: 55, firing: 'per-unit' };

function defaultAssignments(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of ASSIGNABLE_TERRAINS) out[t] = authoredSampleKeyFor(t) ?? '';
  return out;
}

function loadAssignments(): Record<string, string> {
  const out = defaultAssignments();
  try {
    const raw = window.localStorage.getItem(ASSIGN_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const t of ASSIGNABLE_TERRAINS) if (typeof parsed[t] === 'string') out[t] = parsed[t] as string;
    }
  } catch { /* absent / malformed → defaults */ }
  return out;
}

function loadArrival(): ArrivalSettings {
  const out = { ...DEFAULT_ARRIVAL };
  try {
    const raw = window.localStorage.getItem(ARRIVAL_STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ArrivalSettings>;
      if (typeof p.sound === 'string') out.sound = p.sound;
      if (typeof p.volume === 'number' && Number.isFinite(p.volume)) out.volume = Math.min(100, Math.max(0, p.volume));
      if (p.firing === 'per-unit' || p.firing === 'once') out.firing = p.firing;
    }
  } catch { /* absent / malformed → defaults */ }
  return out;
}

// The SFX assignment editor (terrain→sound + the arrival thump) shown above the grid.
function SfxAssignmentPanel(): ReactElement {
  const soundKeys = useMemo(() => AUTHORED_SAMPLE_KEYS.filter((k) => k !== 'arrival'), []);
  const [assign, setAssign] = useState<Record<string, string>>(() => loadAssignments());
  const [arrival, setArrival] = useState<ArrivalSettings>(() => loadArrival());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try { window.localStorage.setItem(ASSIGN_STORE_KEY, JSON.stringify(assign)); } catch { /* ignore */ }
  }, [assign]);
  useEffect(() => {
    try { window.localStorage.setItem(ARRIVAL_STORE_KEY, JSON.stringify(arrival)); } catch { /* ignore */ }
  }, [arrival]);

  const setOne = (terrain: string, key: string) => setAssign((a) => ({ ...a, [terrain]: key }));
  const setArr = (patch: Partial<ArrivalSettings>) => setArrival((a) => ({ ...a, ...patch }));
  const reset = () => { setAssign(defaultAssignments()); setArrival({ ...DEFAULT_ARRIVAL }); };
  const copy = () => {
    const w = Math.max(...ASSIGNABLE_TERRAINS.map((t) => t.length));
    const terrainLines = ASSIGNABLE_TERRAINS.map((t) => `  ${t.padEnd(w)} -> ${assign[t] ? assign[t] : '(silent)'}`);
    const text = [
      'SFX assignments (apply in frontend/src/sfx.ts + game/store.ts):',
      '',
      'Terrains (TERRAIN_SAMPLE):',
      ...terrainLines,
      '',
      'Arrival / deploy thump (playArrival):',
      `  sound  -> ${arrival.sound || 'none (off)'}`,
      `  volume -> ${arrival.volume}%`,
      `  firing -> ${arrival.firing}`,
    ].join('\n');
    void navigator.clipboard?.writeText(text)
      .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })
      .catch(() => { /* clipboard blocked — the user can still read the rows */ });
  };

  const label: CSSProperties = { color: 'var(--ds-ink-1, #ecedf2)', textTransform: 'capitalize' };

  return (
    <section className="tileset-inspector-section" style={{ marginBottom: 16 }} aria-label="Sound assignments">
      <h2>Assign sounds to terrains</h2>
      <p className="tileset-catalog-note">
        Pick which recorded sound voices each terrain, ▶ to hear it. These are a draft — they don’t change the
        running game. Hit <strong>Copy for Claude</strong>, paste it into chat, and I’ll bake it into the game.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '6px 12px', alignItems: 'center', maxWidth: 460 }}>
        {ASSIGNABLE_TERRAINS.map((t) => (
          <Fragment key={t}>
            <span style={label}>{t}</span>
            <select value={assign[t] ?? ''} onChange={(e) => setOne(t, e.target.value)} aria-label={`Sound for ${t}`} style={{ width: '100%' }}>
              <option value="">— silent —</option>
              {soundKeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <button
              type="button"
              className="tileset-view-action"
              disabled={!assign[t]}
              onClick={() => { if (assign[t]) previewSample(assign[t] as SampleKey); }}
              aria-label={`Play the sound assigned to ${t}`}
            >▶</button>
          </Fragment>
        ))}
      </div>

      <h2 style={{ marginTop: 18 }}>Arrival (on deploy)</h2>
      <p className="tileset-catalog-note">The thump layered over the terrain sound as a unit lands on the board.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '6px 12px', alignItems: 'center', maxWidth: 460 }}>
        <span style={label}>Sound</span>
        <select value={arrival.sound} onChange={(e) => setArr({ sound: e.target.value })} aria-label="Arrival sound" style={{ width: '100%' }}>
          <option value="">— none (no thump) —</option>
          {AUTHORED_SAMPLE_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button
          type="button"
          className="tileset-view-action"
          disabled={!arrival.sound}
          onClick={() => { if (arrival.sound) previewSample(arrival.sound as SampleKey, arrival.volume / 100); }}
          aria-label="Play the arrival sound at its volume"
        >▶</button>

        <span style={label}>Volume</span>
        <input
          type="range" min={0} max={100} value={arrival.volume}
          onChange={(e) => setArr({ volume: Number(e.target.value) })}
          aria-label="Arrival volume" style={{ width: '100%' }}
        />
        <span style={{ color: 'var(--ds-ink-2, #aeb4c2)', minWidth: 34, textAlign: 'right' }}>{arrival.volume}%</span>

        <span style={label}>Firing</span>
        <select value={arrival.firing} onChange={(e) => setArr({ firing: e.target.value as FiringMode })} aria-label="Arrival firing mode" style={{ width: '100%' }}>
          <option value="per-unit">per-unit (staggered)</option>
          <option value="once">once (whole squad)</option>
        </select>
        <span />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="button" className="tileset-view-action" onClick={copy}>{copied ? 'Copied ✓' : 'Copy for Claude'}</button>
        <button type="button" className="tileset-view-action" onClick={reset}>Reset to current</button>
      </div>
    </section>
  );
}

// Read-only catalog for the landing sound effects (ADR-0029 catalog requirements). Each
// card shows the sound's real recorded waveform and auditions it on click; the Viewer
// plays it big with a Details readout. "Read-only" constrains editability, not liveness —
// the whole point is to hear it. Every effect is authored foley (the recorded take's
// envelope is the card art). Reuses the shared studio card classes so it matches the grids.

/** Audition an asset live: the arrival thump, or the terrain's recorded landing sound. */
function auditionAsset(asset: SfxAsset): void {
  if (asset.sampleKey === 'arrival') previewArrival();
  else if (asset.terrain) previewTerrain(asset.terrain);
}

/** Normalized peaks for an asset, from the longest decoded take of its sample set. */
function useSfxPeaks(asset: SfxAsset, bars: number): number[] {
  const [peaks, setPeaks] = useState<number[]>(() => sfxSampleWaveformCached(asset.sampleKey, bars) ?? []);
  useEffect(() => {
    const ready = sfxSampleWaveformCached(asset.sampleKey, bars);
    if (ready) { setPeaks(ready); return; }
    let alive = true;
    void sfxSampleWaveform(asset.sampleKey, bars).then((p) => { if (alive) setPeaks(p); });
    return () => { alive = false; };
  }, [asset.sampleKey, bars]);
  return peaks;
}

/** Live amplitude envelope of an effect, drawn as centered SVG bars. */
function SfxWaveform({ asset, bars = 56 }: { asset: SfxAsset; bars?: number }): ReactElement {
  const peaks = useSfxPeaks(asset, bars);
  const n = peaks.length || bars;
  return (
    <svg
      className="sfx-wave"
      viewBox={`0 0 ${n} 100`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      {peaks.length === 0 ? (
        <line x1="0" y1="50" x2={n} y2="50" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      ) : (
        peaks.map((p, i) => {
          const h = Math.max(p * 96, 1.5);
          return <rect key={i} x={i + 0.12} y={(100 - h) / 2} width={0.76} height={h} fill="currentColor" />;
        })
      )}
    </svg>
  );
}

export function SfxLibraryStudio({
  search,
  zoom,
  selected,
  onSelect,
}: {
  search: string;
  zoom: number;
  selected?: string;
  onSelect: (name: string) => void;
}): ReactElement {
  const q = search.trim().toLowerCase();
  const visible = SFX_ASSETS.filter((s) => !q || [s.label, s.terrain ?? '', s.character, s.build].join(' ').toLowerCase().includes(q));
  return (
    <>
    <SfxAssignmentPanel />
    <div className="tileset-studio-grid surface-grid" aria-label="Sound Effects">
      {visible.map((s) => (
        <button
          key={s.name}
          type="button"
          className={`tileset-studio-card ${s.name === selected ? 'is-selected' : ''}`.trim()}
          onClick={() => { onSelect(s.name); auditionAsset(s); }}
          aria-pressed={s.name === selected}
          title={`${s.label} — click to hear`}
        >
          <span
            className="tileset-studio-card-image sfx-card-wave"
            style={{ '--tile-zoom': zoom, color: 'var(--ds-accent, #7ea2ff)', height: `${Math.round(80 * zoom)}px` } as CSSProperties}
          >
            <SfxWaveform asset={s} />
          </span>
          <span className="tileset-studio-card-meta">
            <span className="tileset-studio-card-text">
              <strong>{s.label}</strong>
              <em>{s.character}</em>
            </span>
          </span>
        </button>
      ))}
      {visible.length === 0 ? <p className="tileset-studio-empty">No sound effects match.</p> : null}
    </div>
    </>
  );
}

// The read-only Viewer for a single sound effect — shown big with its waveform and a
// Play control, plus a Details readout. Mirrors SurfaceViewer. "Optimal interactivity"
// per ADR-0029 means you actually HEAR it (the live thing), never a dead image: the
// stage auditions on open and on click, and volume/mute follow Settings → Audio.
export function SfxViewer({ name, header }: { name?: string; header?: ReactNode }): ReactElement {
  const s = SFX_ASSETS.find((x) => x.name === name) ?? SFX_ASSETS[0];
  const play = () => auditionAsset(s);
  // Audition once when the stage opens (you reached it via a click — a user gesture —
  // so the AudioContext is armed). Re-fires when you switch to a different effect.
  useEffect(() => {
    const t = setTimeout(() => auditionAsset(s), 180);
    return () => clearTimeout(t);
  }, [s]);

  const stage: CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
    width: '100%', height: '100%', minHeight: 280, background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--ds-accent, #7ea2ff)',
  };
  const takes = `${s.variantCount} authored take${s.variantCount === 1 ? '' : 's'} · recording`;
  return (
    <>
      <section className="al-lab-main surface-view-main" aria-label="Sound effect preview">
        <button type="button" style={stage} onClick={play} aria-label={`Play the ${s.label} sound`}>
          <span style={{ width: 'min(82%, 680px)', height: '44%', minHeight: 130 }}>
            <SfxWaveform asset={s} />
          </span>
          <span style={{ font: '600 18px var(--ds-font-sans, system-ui, sans-serif)', color: 'var(--ds-ink-1, #ecedf2)', letterSpacing: 0.3 }}>
            ▶ Play
          </span>
        </button>
      </section>
      <aside className="tileset-view-controls" aria-label="Sound effect details">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <button type="button" className="tileset-view-action" onClick={play}>▶ Play sound</button>
            <p className="tileset-catalog-note">Volume + mute follow Settings → Audio (Master Audio + Effects Volume).</p>
            <dl className="al-meta">
              <div><dt>Effect</dt><dd>{s.label}</dd></div>
              <div><dt>Terrain</dt><dd>{s.terrain ?? 'spawn / arrival'}</dd></div>
              <div><dt>Character</dt><dd>{s.character}</dd></div>
              <div><dt>Build</dt><dd>{s.build}</dd></div>
              <div><dt>Source</dt><dd>{takes}</dd></div>
            </dl>
          </div>
        </section>
      </aside>
    </>
  );
}
