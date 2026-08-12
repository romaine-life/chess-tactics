import { useCallback, useEffect, useMemo, useState } from 'react';

import { replaceAppHistoryState, subscribeAppLocation } from './navigation';
import { useSceneParticipant } from './shell/SceneBoundary';

/**
 * Mobile review lab (`/mobile-lab`).
 *
 * Mobile work is unreviewable on the machine it is built on: the dev server is
 * loopback-only so it cannot be opened on a phone, and a desktop browser window shows
 * the desktop layout of the very screens under test. This mounts the REAL routes in
 * same-origin iframes sized to exact device viewports, so the app's own width-based
 * chrome responds exactly as it does on the device, side by side and at a glance.
 *
 * It paints no surface of its own — the frames are outlines and the controls reuse the
 * Studio's existing action class — so it adds no chrome the UI surface contract owns.
 *
 * State is entirely in the URL so a specific device + screen is one link:
 *   /mobile-lab?device=phone-portrait&route=%2Fsettings
 *   /mobile-lab?device=all&route=%2Fplay%2Fselect%2Frun
 *
 * NOTE: these frames report a desktop pointer and take desktop input, so they show LAYOUT,
 * not touch behaviour. Anything gated on `pointer: coarse`, and every gesture question
 * (pinch, drag, tap targets), belongs to `npm run verify:mobile`, which drives a real
 * touch-emulated device.
 */

interface Device {
  id: string;
  label: string;
  width: number;
  height: number;
}

// The same viewports `scripts/verify-mobile.mjs` audits, so what you look at here is what
// the gate measures.
const DEVICES: Device[] = [
  { id: 'phone-portrait', label: 'Phone portrait', width: 390, height: 844 },
  { id: 'phone-landscape', label: 'Phone landscape', width: 844, height: 390 },
  { id: 'phone-landscape-max', label: 'Large phone landscape', width: 932, height: 430 },
  { id: 'tablet-portrait', label: 'Tablet portrait', width: 768, height: 1024 },
  { id: 'tablet-landscape', label: 'Tablet landscape', width: 1024, height: 768 },
];

interface Surface {
  label: string;
  path: string;
}

// In-scope surfaces: gameplay and the screens around it. The Level Editor is out of scope
// for mobile, so it is not listed — paste any address into the route box to view it anyway.
const SURFACES: Surface[] = [
  { label: 'Main menu', path: '/' },
  { label: 'Play — Run', path: '/play/select/run' },
  { label: 'Play — Continue', path: '/play/select/continue' },
  { label: 'Play — Levels', path: '/play/select/levels' },
  { label: 'Settings', path: '/settings' },
  { label: 'Enchiridion', path: '/enchiridion' },
  { label: 'Battle board', path: '/play?campaignId=off-c-crown-valoria&levelId=off-l-hold-bridge' },
  { label: 'Run — Commendatio', path: '/run?craft=commendatio' },
  { label: 'Run — Sectio', path: '/run?craft=sectio&battle=3&gold=250&army=knight,rook&offers=q,pb-front,rr-vertical' },
  { label: 'Run — Deployment', path: '/run?craft=deployment&battle=2&army=rook,rook,bishop,pawn&gold=120' },
  { label: 'Run — Battle', path: '/run?craft=battle&battle=4&lipsana=royal-tent' },
  { label: 'Run — Battle victory', path: '/run?craft=battle-victory&battle=4&lipsana=royal-tent' },
  { label: 'Run — Aftermath', path: '/run?craft=aftermath&battle=3&turns=21&seconds=402&fallen=2' },
  { label: 'Run — War victory', path: '/run?craft=victory&gold=400' },
];

const DEFAULT_ROUTE = '/';
const DEFAULT_DEVICE = 'phone-portrait';

function readParams(): { device: string; route: string; zoom: number } {
  const params = new URLSearchParams(window.location.search);
  const zoom = Number(params.get('zoom'));
  return {
    device: params.get('device') || DEFAULT_DEVICE,
    route: params.get('route') || DEFAULT_ROUTE,
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 0,
  };
}

export default function MobileLab() {
  const [{ device, route, zoom }, setState] = useState(readParams);
  // The address IS the state, so a specific device + screen is always one link.
  const write = useCallback((next: Partial<{ device: string; route: string; zoom: number }>) => {
    setState((previous) => {
      const merged = { ...previous, ...next };
      const params = new URLSearchParams();
      params.set('device', merged.device);
      params.set('route', merged.route);
      if (merged.zoom) params.set('zoom', String(merged.zoom));
      replaceAppHistoryState(null, `/mobile-lab?${params}`);
      return merged;
    });
  }, []);

  useEffect(() => subscribeAppLocation(() => setState(readParams())), []);

  const shown = useMemo(
    () => (device === 'all' ? DEVICES : DEVICES.filter((d) => d.id === device)),
    [device],
  );
  // Reloading the frames is the only way to re-run a `?craft=` route, and it is the
  // difference between reviewing a Run state and reviewing a stale one.
  const [reloadKey, setReloadKey] = useState(0);

  // The lab's own chrome is painted as soon as it renders; each framed route runs its own
  // scene lifecycle inside its iframe and is not this scene's business.
  useSceneParticipant('mobile-lab', 'painted');

  return (
    <main className="mobile-lab">
      <header className="mobile-lab-bar">
        <h1 className="mobile-lab-title">Mobile review</h1>
        <p className="mobile-lab-note">
          Real routes at exact device viewports, portrait and landscape. These frames report a
          desktop pointer and desktop input, so they show layout, not touch behaviour —{' '}
          <code>npm run verify:mobile</code> is what drives a real touch device.
        </p>
      </header>

      <section className="mobile-lab-controls" aria-label="Device">
        <span className="mobile-lab-legend">Device</span>
        <button
          type="button"
          className="tileset-view-action"
          aria-pressed={device === 'all'}
          onClick={() => write({ device: 'all' })}
        >
          All
        </button>
        {DEVICES.map((d) => (
          <button
            key={d.id}
            type="button"
            className="tileset-view-action"
            aria-pressed={device === d.id}
            onClick={() => write({ device: d.id })}
          >
            {d.label} <span className="mobile-lab-dim">{d.width}×{d.height}</span>
          </button>
        ))}
      </section>

      <section className="mobile-lab-controls" aria-label="Screen">
        <span className="mobile-lab-legend">Screen</span>
        {SURFACES.map((s) => (
          <button
            key={s.path}
            type="button"
            className="tileset-view-action"
            aria-pressed={route === s.path}
            onClick={() => write({ route: s.path })}
          >
            {s.label}
          </button>
        ))}
        <button type="button" className="tileset-view-action" onClick={() => setReloadKey((n) => n + 1)}>
          Reload frames
        </button>
      </section>

      <section className="mobile-lab-controls" aria-label="Address">
        <span className="mobile-lab-legend">Address</span>
        <input
          className="mobile-lab-address"
          value={route}
          spellCheck={false}
          aria-label="Route to preview"
          onChange={(event) => write({ route: event.target.value })}
        />
        <span className="mobile-lab-legend">Scale</span>
        {[0, 0.75, 0.5].map((z) => (
          <button
            key={z}
            type="button"
            className="tileset-view-action"
            aria-pressed={zoom === z}
            onClick={() => write({ zoom: z })}
          >
            {z ? `${Math.round(z * 100)}%` : 'Actual size'}
          </button>
        ))}
      </section>

      <div className="mobile-lab-stage">
        {shown.map((d) => (
          <figure key={d.id} className="mobile-lab-device">
            <figcaption className="mobile-lab-caption">
              {d.label} <span className="mobile-lab-dim">{d.width}×{d.height}</span>
            </figcaption>
            {/* The frame reserves the SCALED footprint so neighbours never overlap; the
                iframe keeps its true pixel size and is scaled from its top-left corner, so
                its own layout viewport — and every width media query — stays honest. */}
            <div
              className="mobile-lab-viewport"
              style={{
                width: `${d.width * (zoom || 1)}px`,
                height: `${d.height * (zoom || 1)}px`,
              }}
            >
              <iframe
                key={`${d.id}-${route}-${reloadKey}`}
                className="mobile-lab-frame"
                title={`${d.label} — ${route}`}
                src={route}
                style={{
                  width: `${d.width}px`,
                  height: `${d.height}px`,
                  ...(zoom ? { transform: `scale(${zoom})`, transformOrigin: 'top left' } : null),
                }}
              />
            </div>
          </figure>
        ))}
      </div>
    </main>
  );
}
