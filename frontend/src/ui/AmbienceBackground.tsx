import { useEffect, useRef, type ReactElement } from 'react';

// AmbienceBackground renders cross-client-synchronized rain by subscribing to
// ambience's rain-pinned `/chess` world (https://github.com/romaine-life/ambience).
// Every chess client pointed at the same world renders the same rain at the same
// moment (the authority owns the clock; clients replay a fixed delay behind it).
//
// The runtime is VENDORED, not loaded from ambience at runtime: a pinned snapshot
// of ambience's client (rain-scoped WASM + JS) lives in public/ambience/ (see
// scripts/vendor-ambience.mjs) and is served from our own origin. Only the SSE
// stream points at ambience. This avoids the stale-client drift that comes from
// runtime-loading an unversioned, separately-cached runtime.
//
// PERSISTENCE (why this isn't a plain component): the rain is ONE living effect
// that must survive client-side route changes (menu <-> settings) without
// re-initializing. The vendored client binds to a single `<canvas data-ambience>`
// ONCE at page load via querySelector and never re-scans; the SPA swaps route DOM
// on navigation. So a per-route canvas goes blank after the first soft navigation
// (the bound canvas unmounts, the new one is never picked up). Instead we create
// the canvases ONCE as module singletons, let the client bind them once, and
// RE-PARENT the same nodes into whichever screen currently wants the rain. A
// canvas's 2D context and the client's draw loop survive a DOM move, so the rain
// keeps running continuously and shows on every screen that mounts this component
// (currently the main menu and settings).

// The rain world's stream endpoint. The vendored client derives /chess/events +
// /chess/snapshot from this.
const CHESS_WORLD_URL = 'https://ambience.romaine.life/chess';

// Where the vendored runtime lives, served from our own origin.
const VENDOR_BASE = '/ambience';

let scriptsRequested = false;

// Load the vendored sim.js then client.js (order matters: client.js needs the
// AmbienceSim global). One-shot per page load — client.js binds to the first
// data-ambience canvas it finds, which must exist in the DOM by then (it does:
// ensureScene parks the canvases in <body> before calling this).
function loadVendoredClient(): void {
  if (scriptsRequested) return;
  scriptsRequested = true;
  const inject = (src: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = false;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`failed to load ${src}`));
      document.head.appendChild(el);
    });

  inject(`${VENDOR_BASE}/sim.js`)
    .then(() => inject(`${VENDOR_BASE}/client.js`))
    .catch((err) => {
      // Decorative — never break a screen if the vendored client is missing.
      console.warn('[ambience] rain background failed to load', err);
    });
}

// The living singletons: created once, bound once by the client, re-parented forever.
let fieldCanvas: HTMLCanvasElement | null = null;
let overlayCanvas: HTMLCanvasElement | null = null;
let parked: HTMLDivElement | null = null;

function ensureScene(): void {
  if (fieldCanvas) return;

  // Main rain field — the canvas the world's stream paints. The vendored client
  // finds it by [data-ambience] and configures itself from these attributes.
  const field = document.createElement('canvas');
  field.className = 'ambience-background';
  field.setAttribute('aria-hidden', 'true');
  field.setAttribute('data-ambience', '');
  field.setAttribute('data-ambience-url', CHESS_WORLD_URL); // stream: the rain world
  field.setAttribute('data-ambience-wasm-url', `${VENDOR_BASE}/ambience-rain.wasm`); // runtime: our vendored copy
  field.setAttribute('data-ambience-wasm-exec-url', `${VENDOR_BASE}/wasm_exec.js`);
  field.setAttribute('data-ambience-runtime-url', `${VENDOR_BASE}/wasm_runtime.js`);
  field.setAttribute('data-ambience-transparent', 'true');
  field.setAttribute('data-ambience-entropy', 'off');
  field.setAttribute('data-ambience-initial-fade-ms', '700');

  // Near/overlay plane: a few drops the world promotes to its overlay layer, so
  // they cross IN FRONT of the screen's UI (z-index:5 vs the field's 2). The same
  // drops also render in the field, so if the client ignores this the rain is
  // unchanged.
  const overlay = document.createElement('canvas');
  overlay.className = 'ambience-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('data-ambience-overlay', '');

  // Holder where the canvases live whenever no screen is showing them. display:none
  // is safe: the client sizes the canvas from window.innerWidth (not the container)
  // and rAF keeps running, so the rain keeps simulating while parked and is ready
  // the instant it's re-parented onto the next screen.
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.setAttribute('data-ambience-parked', '');
  holder.append(field, overlay);
  document.body.appendChild(holder);

  fieldCanvas = field;
  overlayCanvas = overlay;
  parked = holder;

  // Canvas is in the DOM now (parked), so the client can bind it when it loads.
  loadVendoredClient();
}

// Mount point for the shared rain on a screen. Renders a display:contents host so
// the re-parented canvases behave as direct children of the positioned screen
// layer — their position:absolute inset:0 anchors to that layer, exactly as if the
// canvases were declared inline (the menu's z-order is unchanged).
export function AmbienceBackground(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureScene();
    const host = hostRef.current;
    if (host && fieldCanvas && overlayCanvas) host.append(fieldCanvas, overlayCanvas);
    return () => {
      // Park the singletons so they persist (and keep running) across the route
      // swap, instead of being torn down with this screen's DOM.
      if (parked && fieldCanvas && overlayCanvas) parked.append(fieldCanvas, overlayCanvas);
    };
  }, []);

  return <div ref={hostRef} style={{ display: 'contents' }} aria-hidden="true" />;
}
