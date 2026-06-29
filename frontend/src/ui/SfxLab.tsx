import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { TerrainType } from '../core/types';
import { previewTerrain, primeSfx } from '../sfx';

// Audition surface for the procedural terrain SFX (frontend/src/sfx.ts). Every
// landable material has a hand-tuned Web Audio recipe that fires when a unit lands
// on / moves onto / spawns on that tile; this page lets you hear each in isolation
// (plus play-all) to tune the kit. Route: /sfx-lab. Master audio + effects volume
// come from Settings → Audio (this page plays through the same gain path as the
// live game, so what you hear here matches in-game). cliff/rock are impassable —
// pieces never land on them, so they have no sound and aren't listed.

interface SfxEntry {
  id: TerrainType;
  label: string;
  blurb: string;
}

const ENTRIES: SfxEntry[] = [
  { id: 'grass', label: 'Grass', blurb: 'Soft dry rustle/swish of blades.' },
  { id: 'dirt', label: 'Dirt', blurb: 'Muffled low pat of packed earth.' },
  { id: 'stone', label: 'Stone', blurb: "Crisp hard flagstone 'tok'." },
  { id: 'pebble', label: 'Pebble', blurb: 'Granular gravel crunch.' },
  { id: 'sand', label: 'Sand', blurb: "Airy 'shff' shuffle, no low end." },
  { id: 'water', label: 'Water', blurb: "Small splash / 'ploop'." },
  { id: 'road', label: 'Road', blurb: 'Packed cobble footstep scuff.' },
  { id: 'bridge', label: 'Bridge', blurb: 'Hollow wooden plank knock.' },
];

// Spacing between auditions when playing the whole kit, so each reads distinctly
// instead of smearing into one wash.
const PLAY_ALL_GAP_MS = 360;

// Hover/active/selected affordances for the material buttons. Module-scoped so the
// <style> node's text is a stable constant (not re-built on every render).
const CARD_CSS = `
  .sfx-card:hover { border-color: var(--ds-line-2, rgba(255,255,255,0.30)); background: var(--ds-surface-3, rgba(255,255,255,0.08)); }
  .sfx-card:active { transform: translateY(1px); }
  .sfx-card.is-last { border-color: var(--ds-accent, #8db4ff); }
`;

const page: CSSProperties = {
  minHeight: '100%',
  padding: '40px clamp(20px, 5vw, 64px) 64px',
  fontFamily: 'var(--ds-font-sans, system-ui, sans-serif)',
  color: 'var(--ds-ink-1, #ecedf2)',
  boxSizing: 'border-box',
};

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: 14,
  maxWidth: 920,
};

const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  alignItems: 'flex-start',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid var(--ds-line-1, rgba(255,255,255,0.14))',
  background: 'var(--ds-surface-2, rgba(255,255,255,0.04))',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

export function SfxLab(): ReactElement {
  const [last, setLast] = useState<TerrainType | null>(null);
  // Track scheduled play-all timers so unmount (or a re-trigger) cancels them
  // instead of firing into a torn-down page.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Arm the AudioContext on the page's first gesture (the button clicks below are
    // gestures too, but this also covers keyboard/touch). Idempotent + SSR-safe.
    primeSfx();
    return () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    };
  }, []);

  const play = (id: TerrainType) => {
    setLast(id);
    previewTerrain(id);
  };

  const playAll = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = ENTRIES.map((entry, i) =>
      setTimeout(() => play(entry.id), i * PLAY_ALL_GAP_MS),
    );
  };

  return (
    <div style={page}>
      <style>{CARD_CSS}</style>

      <h1 style={{ margin: '0 0 6px', fontSize: 26, letterSpacing: 0.2 }}>Terrain SFX Lab</h1>
      <p style={{ margin: '0 0 22px', maxWidth: 660, color: 'var(--ds-ink-3, #aeb0bd)', lineHeight: 1.5 }}>
        Procedural Web Audio footsteps — one per landable terrain, fired in-game when a unit
        lands on, moves onto, or spawns on that tile. Click a material to audition it. Volume
        and mute follow <strong>Settings → Audio</strong> (Master Audio + Effects Volume).
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={playAll}
          style={{ ...card, flexDirection: 'row', alignItems: 'center', padding: '10px 18px', cursor: 'pointer', fontWeight: 600 }}
        >
          ▶ Play all
        </button>
        <span style={{ alignSelf: 'center', color: 'var(--ds-ink-3, #aeb0bd)', fontSize: 13 }}>
          {last ? `Last: ${last}` : 'cliff / rock are impassable — no landing sound.'}
        </span>
      </div>

      <div style={grid}>
        {ENTRIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`sfx-card${last === entry.id ? ' is-last' : ''}`}
            style={card}
            onClick={() => play(entry.id)}
            aria-label={`Play the ${entry.label} landing sound`}
          >
            <span style={{ fontSize: 16, fontWeight: 600 }}>{entry.label}</span>
            <span style={{ fontSize: 13, color: 'var(--ds-ink-3, #aeb0bd)', lineHeight: 1.4 }}>{entry.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
