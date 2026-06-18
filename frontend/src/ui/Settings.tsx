import { useEffect, useState, type CSSProperties } from 'react';

const MUTE_KEY = 'chess-tactics-bgm-muted-v1';
const MUTE_CHANGE_EVENT = 'chess-tactics:bgm-muted-change';
const btn: CSSProperties = { border: '1px solid var(--ds-line-2)', background: 'var(--ds-accent-soft)', color: 'var(--ds-ink)', borderRadius: 'var(--ds-radius-sm)', padding: '8px 14px', cursor: 'pointer' };
const headerActions: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === 'true'; } catch { return false; }
}

// Settings (ported from the legacy app.js stub). Real control: BGM mute, shared
// with bgm.js via the same localStorage key.
export function Settings() {
  const [muted, setMuted] = useState(readMuted());

  useEffect(() => {
    const sync = () => setMuted(readMuted());
    window.addEventListener('storage', sync);
    window.addEventListener(MUTE_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(MUTE_CHANGE_EVENT, sync);
    };
  }, []);

  const toggleMute = () => {
    const next = !muted;
    try { localStorage.setItem(MUTE_KEY, next ? 'true' : 'false'); } catch { /* ignore */ }
    setMuted(next);
    window.dispatchEvent(new CustomEvent(MUTE_CHANGE_EVENT, { detail: { muted: next } }));
  };
  return (
    <div data-testid="settings" style={{ padding: '32px clamp(20px,6vw,80px)', color: 'var(--ds-ink-2)', fontFamily: 'var(--ds-font-sans)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontFamily: 'var(--ds-font-serif)', color: 'var(--ds-ink)', margin: 0 }}>Settings</h1>
        <div style={headerActions}>
          <a href="/design" style={{ ...btn, textDecoration: 'none' }}>Design</a>
          <a href="/" style={{ ...btn, textDecoration: 'none' }}>← Menu</a>
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>Background music</span>
        <button type="button" data-testid="toggle-bgm" style={btn} onClick={toggleMute}>{muted ? 'Muted' : 'On'}</button>
      </div>
    </div>
  );
}
