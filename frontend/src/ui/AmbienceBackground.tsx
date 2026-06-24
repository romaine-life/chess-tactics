import { useEffect, type ReactElement } from 'react';

// AmbienceBackground renders cross-client-synchronized rain behind the main menu
// by subscribing to ambience's rain-pinned `/chess` world
// (https://github.com/romaine-life/ambience). Every chess client pointed at the
// same world renders the same rain at the same moment (the authority owns the
// clock; clients replay a fixed delay behind it).
//
// The runtime is VENDORED, not loaded from ambience at runtime: a pinned
// snapshot of ambience's client (rain-scoped WASM + JS) lives in
// public/ambience/ (see scripts/vendor-ambience.mjs) and is served from our own
// origin. Only the SSE stream points at ambience. This avoids the stale-client
// drift that comes from runtime-loading an unversioned, separately-cached
// runtime. The world advertises its servedEffects and the vendored client
// asserts it supports them — a mismatch fails loudly rather than mis-rendering.

// The rain world's stream endpoint. The vendored client derives /chess/events +
// /chess/snapshot from this.
const CHESS_WORLD_URL = 'https://ambience.romaine.life/chess';

// Where the vendored runtime lives, served from our own origin.
const VENDOR_BASE = '/ambience';

let scriptsRequested = false;

// Load the vendored sim.js then client.js (order matters: client.js needs the
// AmbienceSim global). One-shot per page load — client.js binds to the first
// data-ambience canvas it finds, so the canvas must be mounted first.
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
      // Decorative — never break the menu if the vendored client is missing.
      console.warn('[ambience] rain background failed to load', err);
    });
}

export function AmbienceBackground(): ReactElement {
  useEffect(() => {
    loadVendoredClient();
  }, []);

  return (
    <canvas
      className="ambience-background"
      aria-hidden="true"
      data-ambience
      // Stream: the rain-pinned world on ambience.
      data-ambience-url={CHESS_WORLD_URL}
      // Runtime: our own vendored, version-pinned copy (not ambience's origin).
      data-ambience-wasm-url={`${VENDOR_BASE}/ambience-rain.wasm`}
      data-ambience-wasm-exec-url={`${VENDOR_BASE}/wasm_exec.js`}
      data-ambience-runtime-url={`${VENDOR_BASE}/wasm_runtime.js`}
      data-ambience-transparent="true"
      data-ambience-entropy="off"
      data-ambience-initial-fade-ms="700"
    />
  );
}
