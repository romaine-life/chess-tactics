import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

// A live design surface for matching screens to their accepted art direction.
// Panes, all rendered live (no screenshots):
//
//   ACCEPTED ART   — the concept image
//   CURRENT        — the live app route as it is on disk now (the honest baseline)
//   SPEC A / SPEC B — the same live route with speculative CSS injected into it,
//                     so proposed changes are shown live WITHOUT being saved
//
// URL-addressable: /artwork-compare?image=<id>&route=<path>&css=<A>&css2=<B>
//
// Panes auto-fill a grid (2 -> a row; 3 -> a row; 4 -> 2x2). The speculative
// panes appear only when their CSS box is non-empty, so the plain two-pane
// art<->live mode is preserved. Iframes are same-origin, so the parent injects a
// <style> into each speculative iframe's document — nothing touches the codebase.

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
const DESKTOP_W = 1440; // render the app at desktop width, scaled to fit the cell

function readParams(): { image: string; route: string; cssA: string; cssB: string } {
  const p = new URLSearchParams(window.location.search);
  const found = ART.find((a) => a.id === p.get('image')) ?? ART[0];
  const dec = (v: string | null) => (v ? decodeURIComponent(v) : '');
  return { image: found.id, route: p.get('route') || found.route, cssA: dec(p.get('css')), cssB: dec(p.get('css2')) };
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

export function ArtworkCompare(): ReactElement {
  const [{ image, route, cssA, cssB }, setState] = useState(readParams);
  const [aspect, setAspect] = useState(0.625);
  const [box, setBox] = useState({ w: 600, h: 380, scale: 0.4 });
  const [reloadKey, setReloadKey] = useState(0);
  const measureStage = useRef<HTMLDivElement>(null);
  const specA = useRef<HTMLIFrameElement>(null);
  const specB = useRef<HTMLIFrameElement>(null);

  const art = useMemo(() => ART.find((a) => a.id === image) ?? ART[0], [image]);
  const showA = cssA.trim().length > 0;
  const showB = cssB.trim().length > 0;
  const count = 2 + (showA ? 1 : 0) + (showB ? 1 : 0);
  const cols = count <= 3 ? count : 2;
  const rows = Math.ceil(count / cols);

  // Keep the URL in step so any comparison is linkable.
  useEffect(() => {
    const p = new URLSearchParams();
    p.set('image', image);
    p.set('route', route);
    if (cssA.trim()) p.set('css', encodeURIComponent(cssA));
    if (cssB.trim()) p.set('css2', encodeURIComponent(cssB));
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p.toString()}`);
  }, [image, route, cssA, cssB]);

  // Fit each pane's content (app or art) inside its grid cell, preserving the
  // art's aspect. Measure one cell's stage — all cells are equal.
  useEffect(() => {
    const el = measureStage.current;
    if (!el) return;
    const recompute = () => {
      const pad = 24;
      const availW = Math.max(1, el.clientWidth - pad);
      const availH = Math.max(1, el.clientHeight - pad);
      const desktopH = DESKTOP_W * aspect;
      const scale = Math.min(availW / DESKTOP_W, availH / desktopH);
      setBox({ w: Math.round(DESKTOP_W * scale), h: Math.round(desktopH * scale), scale });
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, count]);

  // Inject the speculative CSS into each spec iframe.
  useEffect(() => {
    inject(specA.current, cssA);
    inject(specB.current, cssB);
  }, [cssA, cssB, route, reloadKey, showA, showB]);

  const pickArt = (id: string) => {
    const next = ART.find((a) => a.id === id) ?? ART[0];
    setState((s) => ({ ...s, image: next.id, route: next.route }));
  };
  const pick = (patch: Partial<{ route: string; cssA: string; cssB: string }>) => setState((s) => ({ ...s, ...patch }));

  const desktopH = Math.round(DESKTOP_W * aspect);
  const iframeStyle = { width: DESKTOP_W, height: desktopH, transform: `scale(${box.scale})`, transformOrigin: 'top left' as const, border: 0 };
  const frameStyle = { width: box.w, height: box.h };

  return (
    <section className="ac">
      <style>{AC_CSS}</style>

      <div className="ac-panes" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {/* ACCEPTED ART */}
        <div className="ac-pane">
          <header className="ac-bar">
            <span className="ac-tag">ACCEPTED ART</span>
            <select value={image} onChange={(e) => pickArt(e.target.value)} aria-label="Concept art">
              {ART.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </header>
          <div className="ac-stage">
            <div className="ac-frame" style={frameStyle}>
              <img className="ac-art-img" src={art.src} alt={`${art.label} concept art`}
                onLoad={(e) => setAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)} />
            </div>
          </div>
        </div>

        {/* CURRENT (measured cell) */}
        <div className="ac-pane">
          <header className="ac-bar">
            <span className="ac-tag">CURRENT</span>
            <select value={route} onChange={(e) => pick({ route: e.target.value })} aria-label="Live route">
              {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
              {!ROUTES.includes(route) ? <option value={route}>{route}</option> : null}
            </select>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} title="Reload live panes">↻</button>
          </header>
          <div className="ac-stage" ref={measureStage}>
            <div className="ac-frame" style={frameStyle}>
              <iframe key={`cur-${reloadKey}`} title="Current" src={route} style={iframeStyle} />
            </div>
          </div>
        </div>

        {showA ? (
          <div className="ac-pane">
            <header className="ac-bar"><span className="ac-tag ac-tag-a">SPEC A</span></header>
            <div className="ac-stage">
              <div className="ac-frame ac-frame-a" style={frameStyle}>
                <iframe key={`a-${reloadKey}`} ref={specA} title="Spec A" src={route} onLoad={() => inject(specA.current, cssA)} style={iframeStyle} />
              </div>
            </div>
          </div>
        ) : null}

        {showB ? (
          <div className="ac-pane">
            <header className="ac-bar"><span className="ac-tag ac-tag-b">SPEC B</span></header>
            <div className="ac-stage">
              <div className="ac-frame ac-frame-b" style={frameStyle}>
                <iframe key={`b-${reloadKey}`} ref={specB} title="Spec B" src={route} onLoad={() => inject(specB.current, cssB)} style={iframeStyle} />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="ac-editor">
        <div className="ac-edit-col">
          <label className="ac-tag ac-tag-a" htmlFor="ac-cssA">SPEC A — live CSS, never saved</label>
          <textarea id="ac-cssA" value={cssA} onChange={(e) => pick({ cssA: e.target.value })} spellCheck={false}
            placeholder=".brand-lockup-mark { height: 46px; width: 46px; }" />
        </div>
        <div className="ac-edit-col">
          <label className="ac-tag ac-tag-b" htmlFor="ac-cssB">SPEC B — live CSS, never saved</label>
          <textarea id="ac-cssB" value={cssB} onChange={(e) => pick({ cssB: e.target.value })} spellCheck={false}
            placeholder=".brand-lockup-mark { height: 50px; width: 50px; }" />
        </div>
      </footer>
    </section>
  );
}

const AC_CSS = `
.ac { position: fixed; inset: 0; z-index: 5; display: flex; flex-direction: column;
  background: #06080d; color: #cfe3ff; font-family: var(--ds-font-sans, system-ui, sans-serif); }
.ac-panes { flex: 1 1 auto; min-height: 0; display: grid; }
.ac-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column;
  border-right: 1px solid #1b2740; border-bottom: 1px solid #1b2740; }
.ac-bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #0b1220; border-bottom: 1px solid #1b2740; }
.ac-tag { font-size: 11px; letter-spacing: .12em; font-weight: 700; color: #7fd4ff; white-space: nowrap; }
.ac-tag-a { color: #ffd479; }
.ac-tag-b { color: #9ff5b0; }
.ac-bar select, .ac-bar button { appearance: none; -webkit-appearance: none;
  font-family: var(--ds-font-sans, system-ui, sans-serif); font-size: 12px; line-height: 1;
  min-height: 0; height: 30px; margin: 0; padding: 0 10px;
  background: #111a2c; background-image: none; color: #dbe9ff;
  border: 1px solid #2a3c5e; border-radius: 4px; box-shadow: none; text-shadow: none; cursor: pointer; }
.ac-bar button { width: 34px; padding: 0; }
.ac-bar button:hover { background: #17223a; }
.ac-stage { position: relative; flex: 1 1 auto; min-height: 0; overflow: auto; background: #06080d;
  display: flex; justify-content: center; align-items: center; padding: 12px; }
.ac-frame { box-sizing: border-box; overflow: hidden; position: relative; flex: 0 0 auto;
  background: #06080d; border: 2px solid #79c4ff; border-radius: 5px;
  box-shadow: 0 0 0 1px rgba(2, 7, 11, .9), 0 8px 22px rgba(0, 0, 0, .5); }
.ac-frame-a { border-color: #ffd479; }
.ac-frame-b { border-color: #9ff5b0; }
.ac-art-img { width: 100%; height: 100%; object-fit: contain; display: block; }
.ac-editor { flex: 0 0 auto; display: flex; gap: 12px; padding: 10px 12px; background: #0b1220; border-top: 1px solid #1b2740; }
.ac-edit-col { flex: 1 1 0; display: flex; flex-direction: column; gap: 6px; }
.ac-editor textarea { width: 100%; height: 60px; resize: vertical; box-sizing: border-box;
  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.4;
  color: #dbe9ff; background: #0a0f1c; border: 1px solid #2a3c5e; border-radius: 4px; padding: 8px; }
`;
