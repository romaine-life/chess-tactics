import { useEffect, useRef, type ReactElement } from 'react';

// AmbienceBackground embeds ambience's shared-world effect runtime as a
// transparent canvas behind the main menu. It is a consumer of the ambience
// authority (https://github.com/romaine-life/ambience): the canvas subscribes
// over SSE, runs a local Go/WASM sim replica, and renders a fixed delay behind
// the authority clock so every chess client pointed at the same authority
// shows the SAME rain at the SAME moment (cross-client sync).
//
// It loads ambience's own `sim.js` + `client.js` from the authority origin at
// runtime and lets `client.js` auto-init on the `data-ambience` canvas. The
// authority serves its own (rain-only) `/ambience.wasm`, so nothing about the
// effect set is decided here — `client.js` renders whatever the authority
// broadcasts.
//
// The target is the DEDICATED rain authority: a rotation-disabled ambience
// deployment that runs rain forever and serves the small rain-only WASM (built
// with `--build-arg WASM_TAGS=rainonly`). It is NOT the public prod world,
// which rotates through every effect.
//
// Fails gracefully: if the authority is unreachable, the menu just shows no
// rain (the canvas stays transparent) — the background is decorative.

// Default target. Override per-instance via the `authorityUrl` prop. Must match
// the deployed rain authority host (see chart/ambience/values-rain.yaml).
const DEFAULT_AUTHORITY_URL = 'https://rain.ambience.dev.romaine.life';

let scriptsRequested = false;

// Load ambience's sim.js then client.js (order matters: client.js requires the
// AmbienceSim global). Idempotent across mounts within a single page load —
// client.js is a one-shot IIFE that binds to the first `data-ambience` canvas
// it finds, which is why the canvas must already be in the DOM before it runs.
function loadAmbienceScripts(authorityUrl: string): void {
  if (scriptsRequested) return;
  scriptsRequested = true;
  const base = authorityUrl.replace(/\/+$/, '');
  const inject = (src: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = false;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`failed to load ${src}`));
      document.head.appendChild(el);
    });

  inject(`${base}/sim.js`)
    .then(() => inject(`${base}/client.js`))
    .catch((err) => {
      // Surface in console but never break the menu — the background is decorative.
      console.warn('[ambience] background failed to load', err);
    });
}

export function AmbienceBackground({
  authorityUrl = DEFAULT_AUTHORITY_URL,
}: {
  authorityUrl?: string;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // The canvas is mounted by the time this effect runs, so client.js will
    // find it when injected.
    loadAmbienceScripts(authorityUrl);
  }, [authorityUrl]);

  return (
    <canvas
      ref={canvasRef}
      className="ambience-background"
      aria-hidden="true"
      data-ambience
      data-ambience-url={authorityUrl}
      data-ambience-transparent="true"
      data-ambience-entropy="off"
      data-ambience-initial-fade-ms="700"
    />
  );
}
