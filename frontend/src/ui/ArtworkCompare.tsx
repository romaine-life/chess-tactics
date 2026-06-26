import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

// A two-panel design surface: the accepted concept art on the left, the live
// app route on the right, so we can check how faithfully a screen matches its
// art direction. The whole view is URL-addressable:
//
//   /artwork-compare?image=<art-id>&route=<live-route>
//
// The left dropdown picks the art (and pairs it with that screen's route by
// default); the right dropdown points the live panel at any app route. Both are
// reflected in the query string, so any comparison is linkable and reloadable.

type ArtEntry = { id: string; label: string; src: string; route: string };

// Source of truth for the concept art is docs/art/ui-screen-concepts/. These
// point at the served copy under public/ (mirrored there for the artwork
// gallery) so no second copy is needed.
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

// Render the live app at a real desktop width and scale it down to fit the
// panel — otherwise a ~half-screen iframe collapses into the app's mobile layout
// and the comparison is meaningless.
const DESKTOP_W = 1440;

function readParams(): { image: string; route: string } {
  const p = new URLSearchParams(window.location.search);
  const found = ART.find((a) => a.id === p.get('image')) ?? ART[0];
  return { image: found.id, route: p.get('route') || found.route };
}

export function ArtworkCompare(): ReactElement {
  const [{ image, route }, setState] = useState(readParams);
  const [aspect, setAspect] = useState(0.625);
  const [frame, setFrame] = useState({ scale: 1, height: DESKTOP_W * 0.625 });
  const [reloadKey, setReloadKey] = useState(0);
  const liveFrame = useRef<HTMLDivElement>(null);

  const art = useMemo(() => ART.find((a) => a.id === image) ?? ART[0], [image]);

  // Keep the URL in step with the selection so the view stays linkable.
  useEffect(() => {
    const p = new URLSearchParams();
    p.set('image', image);
    p.set('route', route);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p.toString()}`);
  }, [image, route]);

  // Match the live panel to the art's aspect ratio so both panes show an
  // identically sized viewing box. The app renders at desktop width, then scales
  // down to fit the panel.
  useEffect(() => {
    const el = liveFrame.current;
    if (!el) return;
    const recompute = () => {
      setFrame({ scale: el.clientWidth / DESKTOP_W, height: DESKTOP_W * aspect });
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  const pickArt = (id: string) => {
    const next = ART.find((a) => a.id === id) ?? ART[0];
    setState({ image: next.id, route: next.route });
  };
  const pickRoute = (r: string) => setState((s) => ({ ...s, route: r }));

  // Both panes draw an identical bordered box of this height so the viewing
  // area reads the same on each side.
  const boxH = Math.round(frame.scale * frame.height);

  return (
    <section className="ac">
      <style>{AC_CSS}</style>

      <div className="ac-pane">
        <header className="ac-bar">
          <span className="ac-tag">ACCEPTED ART</span>
          <select value={image} onChange={(e) => pickArt(e.target.value)} aria-label="Concept art">
            {ART.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
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
          <span className="ac-tag">LIVE</span>
          <select value={route} onChange={(e) => pickRoute(e.target.value)} aria-label="Live route">
            {ROUTES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
            {!ROUTES.includes(route) ? <option value={route}>{route}</option> : null}
          </select>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} title="Reload the live panel">
            ↻ Reload
          </button>
        </header>
        <div className="ac-stage">
          <div className="ac-frame" ref={liveFrame} style={{ height: boxH }}>
            <iframe
              key={reloadKey}
              title="Live app"
              src={route}
              style={{
                width: DESKTOP_W,
                height: frame.height,
                transform: `scale(${frame.scale})`,
                transformOrigin: 'top left',
                border: 0,
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const AC_CSS = `
.ac { position: fixed; inset: 0; z-index: 5; display: flex;
  background: #06080d; color: #cfe3ff; font-family: var(--ds-font-sans, system-ui, sans-serif); }
.ac-pane { flex: 1 1 50%; min-width: 0; display: flex; flex-direction: column;
  border-right: 1px solid #1b2740; }
.ac-pane:last-child { border-right: 0; }
.ac-bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  background: #0b1220; border-bottom: 1px solid #1b2740; }
.ac-tag { font-size: 11px; letter-spacing: .12em; font-weight: 700; color: #7fd4ff; }
.ac-bar select, .ac-bar button {
  appearance: none; -webkit-appearance: none;
  font-family: var(--ds-font-sans, system-ui, sans-serif); font-size: 12px; line-height: 1;
  min-height: 0; height: 30px; margin: 0; padding: 0 10px;
  background: #111a2c; background-image: none; color: #dbe9ff;
  border: 1px solid #2a3c5e; border-radius: 4px;
  box-shadow: none; text-shadow: none; cursor: pointer; }
.ac-bar button:hover { background: #17223a; border-color: #2a3c5e; box-shadow: none; }
.ac-stage { position: relative; flex: 1 1 auto; overflow: auto; background: #06080d;
  display: flex; justify-content: center; align-items: flex-start; padding: 14px; }
.ac-frame { width: 100%; box-sizing: border-box; overflow: hidden; position: relative;
  background: #06080d; border: 2px solid #3a557f; border-radius: 4px; }
.ac-art-img { width: 100%; height: 100%; object-fit: contain; display: block; }
`;
