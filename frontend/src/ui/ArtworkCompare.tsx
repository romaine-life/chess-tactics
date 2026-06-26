import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

// A live design surface for matching screens to their accepted art direction.
// Up to three panes, all rendered live (no screenshots):
//
//   ACCEPTED ART   — the concept image
//   CURRENT        — the live app route, as it is on disk right now (baseline)
//   SPECULATIVE    — the same live route with speculative CSS injected into it,
//                    so a proposed change can be seen WITHOUT being saved to the app
//
// Everything is URL-addressable:
//   /artwork-compare?image=<art-id>&route=<live-route>&css=<encoded speculative css>
//
// The speculative pane appears only when there is speculative CSS. Because the
// iframes are same-origin (served by the same dev server), the parent injects a
// <style> element into the speculative iframe's document — nothing is written to
// the codebase, so CURRENT stays the honest baseline.

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

// Render the live app at a real desktop width, scaled down to fit the pane, so a
// narrow pane never collapses into the app's mobile layout.
const DESKTOP_W = 1440;

function readParams(): { image: string; route: string; css: string } {
  const p = new URLSearchParams(window.location.search);
  const found = ART.find((a) => a.id === p.get('image')) ?? ART[0];
  const raw = p.get('css');
  return {
    image: found.id,
    route: p.get('route') || found.route,
    css: raw ? decodeURIComponent(raw) : '',
  };
}

export function ArtworkCompare(): ReactElement {
  const [{ image, route, css }, setState] = useState(readParams);
  const [aspect, setAspect] = useState(0.625);
  const [frame, setFrame] = useState({ scale: 1, height: DESKTOP_W * 0.625 });
  const [reloadKey, setReloadKey] = useState(0);
  const measureFrame = useRef<HTMLDivElement>(null);
  const specIframe = useRef<HTMLIFrameElement>(null);

  const art = useMemo(() => ART.find((a) => a.id === image) ?? ART[0], [image]);
  const showSpec = css.trim().length > 0;

  // Keep the URL in step with the selection so any comparison is linkable.
  useEffect(() => {
    const p = new URLSearchParams();
    p.set('image', image);
    p.set('route', route);
    if (css.trim()) p.set('css', encodeURIComponent(css));
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p.toString()}`);
  }, [image, route, css]);

  // Match the live panes to the art's aspect so every pane is the same box.
  useEffect(() => {
    const el = measureFrame.current;
    if (!el) return;
    const recompute = () => setFrame({ scale: el.clientWidth / DESKTOP_W, height: DESKTOP_W * aspect });
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, showSpec]);

  // Inject (or update) the speculative CSS inside the speculative iframe. Same
  // origin, so the parent can reach the iframe's document directly.
  const injectSpec = () => {
    const ifr = specIframe.current;
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
  };
  useEffect(injectSpec, [css, route, reloadKey, showSpec]);

  const pickArt = (id: string) => {
    const next = ART.find((a) => a.id === id) ?? ART[0];
    setState((s) => ({ ...s, image: next.id, route: next.route }));
  };
  const pickRoute = (r: string) => setState((s) => ({ ...s, route: r }));
  const setCss = (v: string) => setState((s) => ({ ...s, css: v }));

  const boxH = Math.round(frame.scale * frame.height);
  const iframeStyle = {
    width: DESKTOP_W,
    height: frame.height,
    transform: `scale(${frame.scale})`,
    transformOrigin: 'top left' as const,
    border: 0,
  };

  return (
    <section className="ac">
      <style>{AC_CSS}</style>

      <div className="ac-panes">
        <div className="ac-pane">
          <header className="ac-bar">
            <span className="ac-tag">ACCEPTED ART</span>
            <select value={image} onChange={(e) => pickArt(e.target.value)} aria-label="Concept art">
              {ART.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </header>
          <div className="ac-stage">
            <div className="ac-frame" style={{ height: boxH }}>
              <img
                className="ac-art-img"
                src={art.src}
                alt={`${art.label} concept art`}
                onLoad={(e) => setAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)}
              />
            </div>
          </div>
        </div>

        <div className="ac-pane">
          <header className="ac-bar">
            <span className="ac-tag">CURRENT</span>
            <select value={route} onChange={(e) => pickRoute(e.target.value)} aria-label="Live route">
              {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
              {!ROUTES.includes(route) ? <option value={route}>{route}</option> : null}
            </select>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} title="Reload both live panes">↻ Reload</button>
          </header>
          <div className="ac-stage">
            <div className="ac-frame" ref={measureFrame} style={{ height: boxH }}>
              <iframe key={`cur-${reloadKey}`} title="Current" src={route} style={iframeStyle} />
            </div>
          </div>
        </div>

        {showSpec ? (
          <div className="ac-pane">
            <header className="ac-bar">
              <span className="ac-tag ac-tag-spec">SPECULATIVE</span>
            </header>
            <div className="ac-stage">
              <div className="ac-frame ac-frame-spec" style={{ height: boxH }}>
                <iframe key={`spec-${reloadKey}`} ref={specIframe} title="Speculative" src={route} onLoad={injectSpec} style={iframeStyle} />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="ac-editor">
        <label className="ac-tag" htmlFor="ac-css">SPECULATIVE CSS — live, never saved to the app (add a rule to see the third pane)</label>
        <textarea
          id="ac-css"
          value={css}
          onChange={(e) => setCss(e.target.value)}
          spellCheck={false}
          placeholder=".brand-lockup-mark { height: 40px; width: 40px; }"
        />
      </footer>
    </section>
  );
}

const AC_CSS = `
.ac { position: fixed; inset: 0; z-index: 5; display: flex; flex-direction: column;
  background: #06080d; color: #cfe3ff; font-family: var(--ds-font-sans, system-ui, sans-serif); }
.ac-panes { flex: 1 1 auto; min-height: 0; display: flex; }
.ac-pane { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; border-right: 1px solid #1b2740; }
.ac-pane:last-child { border-right: 0; }
.ac-bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #0b1220; border-bottom: 1px solid #1b2740; }
.ac-tag { font-size: 11px; letter-spacing: .12em; font-weight: 700; color: #7fd4ff; }
.ac-tag-spec { color: #ffd479; }
.ac-bar select, .ac-bar button { appearance: none; -webkit-appearance: none;
  font-family: var(--ds-font-sans, system-ui, sans-serif); font-size: 12px; line-height: 1;
  min-height: 0; height: 30px; margin: 0; padding: 0 10px;
  background: #111a2c; background-image: none; color: #dbe9ff;
  border: 1px solid #2a3c5e; border-radius: 4px; box-shadow: none; text-shadow: none; cursor: pointer; }
.ac-bar button:hover { background: #17223a; border-color: #2a3c5e; box-shadow: none; }
.ac-stage { position: relative; flex: 1 1 auto; overflow: auto; background: #06080d;
  display: flex; justify-content: center; align-items: flex-start; padding: 18px; }
.ac-frame { width: 100%; box-sizing: border-box; overflow: hidden; position: relative;
  background: #06080d; border: 2px solid #79c4ff; border-radius: 5px;
  box-shadow: 0 0 0 1px rgba(2, 7, 11, .9), 0 10px 28px rgba(0, 0, 0, .55); }
.ac-frame-spec { border-color: #ffd479; }
.ac-art-img { width: 100%; height: 100%; object-fit: contain; display: block; }
.ac-editor { flex: 0 0 auto; display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px; background: #0b1220; border-top: 1px solid #1b2740; }
.ac-editor textarea { width: 100%; height: 72px; resize: vertical; box-sizing: border-box;
  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.4;
  color: #dbe9ff; background: #0a0f1c; border: 1px solid #2a3c5e; border-radius: 4px; padding: 8px; }
`;
