import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { TerrainType } from '../core/types';
import { previewTerrain } from '../sfx';
import { sfxWaveform, sfxWaveformCached } from '../sfxWaveform';
import { SFX_ASSETS } from './sfxCatalog';

// Read-only catalog for the terrain landing sound effects (ADR-0029). Each card shows
// the sound's real waveform (offline-rendered from the same recipe the game plays — see
// sfxWaveform) and auditions it on click; the Viewer plays it big with a Details readout.
// "Read-only" constrains editability, not liveness — the whole point is to hear it. The
// sounds are synthesized in code (no asset files), so the card art is generated, never an
// authored image. Reuses the shared studio card classes so it matches the other grids.

/** Live amplitude envelope of a terrain's SFX, drawn as centered SVG bars. */
function SfxWaveform({ terrain, bars = 56 }: { terrain: TerrainType; bars?: number }): ReactElement {
  const [peaks, setPeaks] = useState<number[]>(() => sfxWaveformCached(terrain, bars) ?? []);
  useEffect(() => {
    const ready = sfxWaveformCached(terrain, bars);
    if (ready) { setPeaks(ready); return; }
    let alive = true;
    void sfxWaveform(terrain, bars).then((p) => { if (alive) setPeaks(p); });
    return () => { alive = false; };
  }, [terrain, bars]);

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
  const visible = SFX_ASSETS.filter((s) => !q || [s.label, s.terrain, s.character, s.build].join(' ').toLowerCase().includes(q));
  return (
    <div className="tileset-studio-grid surface-grid" aria-label="Sound Effects">
      {visible.map((s) => (
        <button
          key={s.name}
          type="button"
          className={`tileset-studio-card ${s.name === selected ? 'is-selected' : ''}`.trim()}
          onClick={() => { onSelect(s.name); previewTerrain(s.terrain); }}
          aria-pressed={s.name === selected}
          title={`${s.label} — click to hear`}
        >
          <span
            className="tileset-studio-card-image sfx-card-wave"
            style={{ '--tile-zoom': zoom, color: 'var(--ds-accent, #7ea2ff)', height: `${Math.round(80 * zoom)}px` } as CSSProperties}
          >
            <SfxWaveform terrain={s.terrain} />
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
  );
}

// The read-only Viewer for a single sound effect — shown big with its waveform and a
// Play control, plus a Details readout. Mirrors SurfaceViewer. "Optimal interactivity"
// per ADR-0029 means you actually HEAR it (the live thing), never a dead image: the
// stage auditions on open and on click, and volume/mute follow Settings → Audio.
export function SfxViewer({ name, header }: { name?: string; header?: ReactNode }): ReactElement {
  const s = SFX_ASSETS.find((x) => x.name === name) ?? SFX_ASSETS[0];
  const play = () => previewTerrain(s.terrain);
  // Audition once when the stage opens (you reached it via a click — a user gesture —
  // so the AudioContext is armed). Re-fires when you switch to a different effect.
  useEffect(() => {
    const t = setTimeout(() => previewTerrain(s.terrain), 180);
    return () => clearTimeout(t);
  }, [s.terrain]);

  const stage: CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
    width: '100%', height: '100%', minHeight: 280, background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--ds-accent, #7ea2ff)',
  };
  return (
    <>
      <section className="al-lab-main surface-view-main" aria-label="Sound effect preview">
        <button type="button" style={stage} onClick={play} aria-label={`Play the ${s.label} sound`}>
          <span style={{ width: 'min(82%, 680px)', height: '44%', minHeight: 130 }}>
            <SfxWaveform terrain={s.terrain} />
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
              <div><dt>Terrain</dt><dd>{s.terrain}</dd></div>
              <div><dt>Character</dt><dd>{s.character}</dd></div>
              <div><dt>Build</dt><dd>{s.build}</dd></div>
              <div><dt>Duration</dt><dd>{s.durationMs}ms · procedural (Web Audio)</dd></div>
            </dl>
          </div>
        </section>
      </aside>
    </>
  );
}
