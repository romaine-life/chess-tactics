import { useEffect, useState } from 'react';

const MUTE_KEY = 'chess-tactics-bgm-muted-v1';
const MUTE_CHANGE_EVENT = 'chess-tactics:bgm-muted-change';

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
    <div data-testid="settings" className="utility-screen utility-settings">
      <header className="utility-page-header">
        <span className="utility-header-icon icon-gear" aria-hidden="true" />
        <div className="utility-title-copy">
          <h1>Settings</h1>
          <p>Audio and utility controls.</p>
        </div>
        <div className="utility-header-actions">
          <a href="/design" className="utility-button utility-button-neutral">Design</a>
          <a href="/" className="utility-button utility-button-neutral">Menu</a>
        </div>
      </header>
      <section className="utility-panel utility-settings-panel">
        <div className="utility-setting-row">
          <span className="utility-row-icon icon-speaker" aria-hidden="true" />
          <div className="utility-setting-copy">
            <strong>Background music</strong>
            <span>{muted ? 'Muted' : 'On'}</span>
          </div>
          <button type="button" data-testid="toggle-bgm" className={`utility-toggle ${muted ? '' : 'is-on'}`.trim()} onClick={toggleMute} aria-pressed={!muted}>
            <span>{muted ? 'Muted' : 'On'}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
