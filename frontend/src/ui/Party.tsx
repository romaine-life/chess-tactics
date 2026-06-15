import { useState, type CSSProperties } from 'react';
import type { PieceType } from '../core/types';

const OPTIONS: PieceType[] = ['knight', 'bishop', 'rook'];
const btn = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? 'var(--ds-accent)' : 'var(--ds-line-2)'}`,
  background: active ? 'var(--ds-accent-soft)' : 'transparent',
  color: 'var(--ds-ink)', borderRadius: 'var(--ds-radius-sm)', padding: '8px 14px', cursor: 'pointer',
});

// Squad picker (ported from legacy app.js): pawn is locked; choose two more
// pieces, then deploy into a skirmish.
export function Party() {
  const [picks, setPicks] = useState<PieceType[]>([]);
  const toggle = (p: PieceType) => setPicks((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : cur.length < 2 ? [...cur, p] : cur);
  return (
    <div data-testid="party" style={{ padding: '32px clamp(20px,6vw,80px)', color: 'var(--ds-ink-2)', fontFamily: 'var(--ds-font-sans)' }}>
      <h1 style={{ fontFamily: 'var(--ds-font-serif)', color: 'var(--ds-ink)' }}>Assemble your squad</h1>
      <p style={{ color: 'var(--ds-ink-3)' }}>Pawn is locked in. Choose two more ({picks.length}/2).</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <span style={{ ...btn(true), cursor: 'default', opacity: 0.8 }}>pawn (locked)</span>
        {OPTIONS.map((p) => (
          <button key={p} type="button" data-testid={`party-${p}`} style={btn(picks.includes(p))} onClick={() => toggle(p)}>{p}</button>
        ))}
      </div>
      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        <a
          href="/play"
          data-testid="party-deploy"
          aria-disabled={picks.length !== 2}
          style={{ ...btn(picks.length === 2), textDecoration: 'none', pointerEvents: picks.length === 2 ? 'auto' : 'none', opacity: picks.length === 2 ? 1 : 0.5 }}
        >Deploy →</a>
        <a href="/" style={{ ...btn(false), textDecoration: 'none' }}>← Menu</a>
      </div>
    </div>
  );
}
