import type { CSSProperties } from 'react';

const MODES = [
  { href: '/play', label: 'Solo Skirmish', desc: 'Tactical chess battle on the isometric board.' },
  { href: '/campaigns-next', label: 'Campaign Editor', desc: 'Author campaigns and order their levels.' },
  { href: '/edit', label: 'Level Editor', desc: 'Paint isometric terrain, elevation, and units.' },
  { href: '/design/catalog', label: 'Design Catalog', desc: 'Component & asset styleguide.' },
];

const card: CSSProperties = {
  display: 'block', textDecoration: 'none', background: 'var(--ds-surface)', border: '1px solid var(--ds-line)',
  borderRadius: 'var(--ds-radius-md)', padding: '16px 18px', color: 'var(--ds-ink)',
};

// React main menu hub for the new stack (Phase 5). Links to the ported surfaces.
export function MainMenu() {
  return (
    <div
      data-testid="main-menu-next"
      style={{ position: 'relative', zIndex: 5, pointerEvents: 'auto', padding: '40px clamp(20px, 6vw, 80px)', color: 'var(--ds-ink-2)', fontFamily: 'var(--ds-font-sans)' }}
    >
      <p style={{ letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', fontSize: 'var(--ds-text-xs)', margin: 0 }}>Tactical Breach Console</p>
      <h1 style={{ fontFamily: 'var(--ds-font-serif)', fontSize: 'clamp(2rem, 5vw, 3.2rem)', color: 'var(--ds-ink)', margin: '4px 0' }}>Chess Tactics</h1>
      <p style={{ color: 'var(--ds-accent)', margin: '0 0 28px' }}>Tactical chess. Infinite possibilities.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, maxWidth: 900 }}>
        {MODES.map((m) => (
          <a key={m.href} href={m.href} data-testid={`menu-${m.href}`} style={card}>
            <div style={{ fontSize: '1.15rem', color: 'var(--ds-ink)' }}>{m.label}</div>
            <div style={{ fontSize: 'var(--ds-text-sm)', color: 'var(--ds-ink-3)', marginTop: 4 }}>{m.desc}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
