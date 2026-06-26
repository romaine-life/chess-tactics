import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

// A live design surface for matching screens to their accepted art direction.
// Two side-by-side panes; each can independently be set to ANYTHING:
//
//   - an ACCEPTED ART image (any concept), or
//   - a LIVE app route (the honest on-disk baseline), or
//   - a LIVE route + speculative CSS injected into it (a proposed change shown
//     live, WITHOUT being saved to the app)
//
// So you can compare art<->live, live<->speculative, art<->art, etc. Everything
// is URL-addressable:
//   /artwork-compare?l=<src>&lcss=<css>&r=<src>&rcss=<css>
// where <src> is "art:<id>" or "live:<route>".
//
// Iframes are same-origin, so the parent injects a <style> into a live pane's
// document when that pane has speculative CSS — nothing touches the codebase.

type ArtEntry = { id: string; label: string; src: string; route: string };

const INSPO = '/assets/artwork/inspiration/ui-screen-concepts';

const ART: ArtEntry[] = [
  { id: 'settings-general', label: 'Settings · General', src: `${INSPO}/generated/settings-general-concept-v1.png`, route: '/settings/general' },
  { id: 'settings-audio', label: 'Settings · Audio', src: `${INSPO}/generated/settings-audio-concept-v1.png`, route: '/settings/audio' },
  { id: 'settings-gameplay', label: 'Settings · Gameplay', src: `${INSPO}/generated/settings-gameplay-concept-v1.png`, route: '/settings/gameplay' },
  { id: 'settings-creator-tools', label: 'Settings · Creator Tools', src: `${INSPO}/generated/settings-creator-tools-concept-v1.png`, route: '/settings/creator-tools' },
  { id: 'settings-overview', label: 'Settings · Overview', src: `${INSPO}/generated/settings-page-concept-v1.png`, route: '/settings/general' },
  { id: 'main-menu', label: 'Main Menu', src: `${INSPO}/01-main-menu-aspirational.png`, route: '/' },
  { id: 'campaign-editor', label: 'Campaign Editor', src: `${INSPO}/02-campaign-editor.png`, route: '/campaigns-next' },
  { id: 'level-editor', label: 'Level Editor', src: `${INSPO}/03-level-editor.png`, route: '/level-editor' },
  { id: 'skirmish', label: 'Skirmish', src: `${INSPO}/04-skirmish.png`, route: '/skirmish' },
];

const ROUTES = Array.from(new Set(ART.map((a) => a.route)));
const LIVE_W = 1440; // render live routes at desktop width, scaled to fit the pane
const LIVE_H = 900;

type Source = { kind: 'art'; id: string } | { kind: 'live'; route: string };
function parseSource(s: string): Source {
  if (s.startsWith('live:')) return { kind: 'live', route: s.slice(5) };
  return { kind: 'art', id: s.startsWith('art:') ? s.slice(4) : s };
}

function inject(ifr: HTMLIFrameElement | null, css: string): void {
  if (!ifr) return;
  try {
    const doc = ifr.contentDocument;
    if (!doc) return;
    let el = doc.getElementById('__ac_spec') as HTMLStyleElement | null;
    if (!el) {
      el = doc.createElement('style');
      el.id = '__ac_spec';
      doc.head.appendChild(el);
    }
    el.textContent = css;
  } catch {
    /* transient access during navigation — re-runs on next change */
  }
}

type PaneConfig = { src: string; css: string };

// Module-level so it never remounts (which would reload the iframe on every keystroke).
function ComparePane({ config, onSrc, onReload, reloadKey }: {
  config: PaneConfig;
  onSrc: (src: string) => void;
  onReload: () => void;
  reloadKey: number;
}): ReactElement {
  const src = parseSource(config.src);
  const stage = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [imgAspect, setImgAspect] = useState(LIVE_H / LIVE_W);
  const [box, setBox] = useState({ w: 400, h: 250, scale: 0.28 });

  const aspect = src.kind === 'live' ? LIVE_H / LIVE_W : imgAspect;
  const liveRoute = src.kind === 'live' ? src.route : '';

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const recompute = () => {
      const pad = 20;
      const availW = Math.max(1, el.clientWidth - pad);
      const availH = Math.max(1, el.clientHeight - pad);
      const w = Math.min(availW, availH / aspect);
      setBox({ w: Math.round(w), h: Math.round(w * aspect), scale: w / LIVE_W });
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  useEffect(() => {
    if (src.kind === 'live') inject(iframe.current, config.css);
  }, [config.css, liveRoute, reloadKey, src.kind]);

  const art = src.kind === 'art' ? (ART.find((a) => a.id === src.id) ?? ART[0]) : null;
  const isSpec = src.kind === 'live' && config.css.trim().length > 0;

  return (
    <div className="ac-pane">
      <header className="ac-bar">
        <select value={config.src} onChange={(e) => onSrc(e.target.value)} aria-label="Pane source">
          <optgroup label="Accepted art">
            {ART.map((a) => <option key={`art:${a.id}`} value={`art:${a.id}`}>ART · {a.label}</option>)}
          </optgroup>
          <optgroup label="Live route">
            {ROUTES.map((r) => <option key={`live:${r}`} value={`live:${r}`}>LIVE · {r}</option>)}
          </optgroup>
        </select>
        {src.kind === 'live' ? <button type="button" onClick={onReload} title="Reload live panes">↻</button> : null}
        {isSpec ? <span className="ac-tag ac-tag-spec">+ CSS</span> : null}
      </header>
      <div className="ac-stage" ref={stage}>
        <div className={`ac-frame ${isSpec ? 'ac-frame-spec' : ''}`} style={{ width: box.w, height: box.h }}>
          {src.kind === 'art' && art ? (
            <img
              className="ac-art-img"
              src={art.src}
              alt={`${art.label} concept art`}
              onLoad={(e) => setImgAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)}
            />
          ) : src.kind === 'live' ? (
            <iframe
              key={`${src.route}-${reloadKey}`}
              ref={iframe}
              title="Live"
              src={src.route}
              onLoad={() => inject(iframe.current, config.css)}
              style={{ width: LIVE_W, height: LIVE_H, transform: `scale(${box.scale})`, transformOrigin: 'top left', border: 0 }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function readParams(): { left: PaneConfig; right: PaneConfig } {
  const p = new URLSearchParams(window.location.search);
  const dec = (v: string | null) => (v ? decodeURIComponent(v) : '');
  return {
    left: { src: p.get('l') || 'art:settings-general', css: dec(p.get('lcss')) },
    right: { src: p.get('r') || 'live:/settings/general', css: dec(p.get('rcss')) },
  };
}

export function ArtworkCompare(): ReactElement {
  const [{ left, right }, setState] = useState(readParams);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const p = new URLSearchParams();
    p.set('l', left.src);
    if (left.css.trim()) p.set('lcss', encodeURIComponent(left.css));
    p.set('r', right.src);
    if (right.css.trim()) p.set('rcss', encodeURIComponent(right.css));
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p.toString()}`);
  }, [left, right]);

  const setLeft = (patch: Partial<PaneConfig>) => setState((s) => ({ ...s, left: { ...s.left, ...patch } }));
  const setRight = (patch: Partial<PaneConfig>) => setState((s) => ({ ...s, right: { ...s.right, ...patch } }));
  const reload = () => setReloadKey((k) => k + 1);

  const leftLive = useMemo(() => parseSource(left.src).kind === 'live', [left.src]);
  const rightLive = useMemo(() => parseSource(right.src).kind === 'live', [right.src]);

  return (
    <section className="ac">
      <style>{AC_CSS}</style>

      <div className="ac-panes">
        <ComparePane config={left} onSrc={(src) => setLeft({ src })} onReload={reload} reloadKey={reloadKey} />
        <ComparePane config={right} onSrc={(src) => setRight({ src })} onReload={reload} reloadKey={reloadKey} />
      </div>

      <footer className="ac-editor">
        <div className="ac-edit-col">
          <label className="ac-tag" htmlFor="ac-lcss">LEFT CSS {leftLive ? '' : '(left pane is art — switch it to a Live route to apply)'}</label>
          <textarea id="ac-lcss" value={left.css} onChange={(e) => setLeft({ css: e.target.value })} spellCheck={false}
            placeholder=".brand-lockup-mark { height: 46px; width: 46px; }" />
        </div>
        <div className="ac-edit-col">
          <label className="ac-tag" htmlFor="ac-rcss">RIGHT CSS {rightLive ? '' : '(right pane is art — switch it to a Live route to apply)'}</label>
          <textarea id="ac-rcss" value={right.css} onChange={(e) => setRight({ css: e.target.value })} spellCheck={false}
            placeholder=".brand-lockup-mark { height: 50px; width: 50px; }" />
        </div>
      </footer>
    </section>
  );
}

const AC_CSS = `
.ac { position: fixed; inset: 0; z-index: 5; display: flex; flex-direction: column;
  background: #06080d; color: #cfe3ff; font-family: var(--ds-font-sans, system-ui, sans-serif); }
.ac-panes { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; }
.ac-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; border-right: 1px solid #1b2740; }
.ac-pane:last-child { border-right: 0; }
.ac-bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #0b1220; border-bottom: 1px solid #1b2740; }
.ac-tag { font-size: 11px; letter-spacing: .12em; font-weight: 700; color: #7fd4ff; white-space: nowrap; }
.ac-tag-spec { color: #ffd479; }
.ac-bar select, .ac-bar button { appearance: none; -webkit-appearance: none;
  font-family: var(--ds-font-sans, system-ui, sans-serif); font-size: 12px; line-height: 1;
  min-height: 0; height: 30px; margin: 0; padding: 0 10px;
  background: #111a2c; background-image: none; color: #dbe9ff;
  border: 1px solid #2a3c5e; border-radius: 4px; box-shadow: none; text-shadow: none; cursor: pointer; }
.ac-bar select { flex: 1 1 auto; min-width: 0; }
.ac-bar button { width: 34px; padding: 0; flex: 0 0 auto; }
.ac-bar button:hover { background: #17223a; }
.ac-stage { position: relative; flex: 1 1 auto; min-height: 0; overflow: auto; background: #06080d;
  display: flex; justify-content: center; align-items: center; padding: 12px; }
.ac-frame { box-sizing: border-box; overflow: hidden; position: relative; flex: 0 0 auto;
  background: #06080d; border: 2px solid #79c4ff; border-radius: 5px;
  box-shadow: 0 0 0 1px rgba(2, 7, 11, .9), 0 8px 22px rgba(0, 0, 0, .5); }
.ac-frame-spec { border-color: #ffd479; }
.ac-art-img { width: 100%; height: 100%; object-fit: contain; display: block; }
.ac-editor { flex: 0 0 auto; display: flex; gap: 12px; padding: 10px 12px; background: #0b1220; border-top: 1px solid #1b2740; }
.ac-edit-col { flex: 1 1 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ac-editor textarea { width: 100%; height: 60px; resize: vertical; box-sizing: border-box;
  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.4;
  color: #dbe9ff; background: #0a0f1c; border: 1px solid #2a3c5e; border-radius: 4px; padding: 8px; }
`;
