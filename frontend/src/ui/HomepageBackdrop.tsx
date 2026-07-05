import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { buildSceneBackdropNode } from './SceneBackdrop';

// HomepageBackdrop is the ONE shared backdrop every homepage-family surface renders
// (main menu, settings, lobbies, party, campaign, campaign editor, skirmish picker,
// level editor). It owns the animated menu scene AND the cross-client-synced rain as a
// single continuous instance, so navigating between those surfaces never re-adjusts the
// art. This is the structural lock behind ADR-0046 §G / ADR-0049 (the homepage art
// background + rain are app-continuous and must not re-fade or blink) — and the reason
// screens are forbidden (check-light-art-chrome.mjs) from importing the scene/rain
// pieces directly: there is exactly one owner.
//
// CONTINUITY (why this isn't a plain component): both halves are ONE living effect that
// must survive client-side route changes without re-initializing.
//   - The rain is a vendored WASM client bound ONCE at page load to a single
//     `<canvas data-ambience>` via querySelector; it never re-scans. A per-route canvas
//     goes blank after the first soft navigation.
//   - The scene is a `container-type: size` cover-crop with baked waterfall sheets; a
//     fresh per-screen React subtree recomputes its crop and replays its reveal on every
//     hop — the visible "re-adjust" this component exists to kill.
// So the scene node and both rain canvases are created ONCE as module singletons, and
// RE-PARENTED into whichever screen currently mounts this component. A moved node keeps
// its layout, animation, and (rain) draw loop, so the whole backdrop stays put across
// navigation. They re-parent INTO the screen (not up to the app shell) on purpose: the
// layer order is screen-relative — scene (z1) under rain field (z2) under screen UI (z3)
// under the near rain overlay (z5, drops crossing IN FRONT of the UI) — and only nesting
// the nodes inside the mounting screen's stacking context preserves that overlay layer.
//
// The vendored rain runtime is VENDORED, not loaded from ambience at runtime: a pinned
// snapshot of ambience's client (rain-scoped WASM + JS) lives in public/ambience/ (see
// scripts/vendor-ambience.mjs) and is served from our own origin. Only the SSE stream
// points at ambience. This avoids the stale-client drift of runtime-loading an
// unversioned, separately-cached runtime.

// The rain world's stream endpoint. The vendored client derives /chess/events +
// /chess/snapshot from this.
const CHESS_WORLD_URL = 'https://ambience.romaine.life/chess';

// The human-facing view of the same broadcast: ambience's live monitor pointed
// at the chess world (read-only inspector). The corner credit links here, so
// "what is this rain?" has an answer one click away — the same world, same
// authority clock, running full-screen on ambience.
const CHESS_WORLD_VIEW_URL = 'https://ambience.romaine.life/?world=chess';

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

// The living singletons: created once, bound once (rain), re-parented forever.
let sceneNode: HTMLDivElement | null = null;
let fieldCanvas: HTMLCanvasElement | null = null;
let overlayCanvas: HTMLCanvasElement | null = null;
let parked: HTMLDivElement | null = null;
// The host div currently showing the backdrop — so an outgoing screen doesn't park
// nodes a newly-mounted screen has already claimed (mount/unmount can interleave).
let currentHost: HTMLDivElement | null = null;

function ensureScene(): void {
  if (fieldCanvas) return;

  // The animated menu scene (still art + baked waterfalls + scrim). Built once as a
  // detached DOM subtree; re-parented across screens with its cover-crop intact. Sits
  // at z1, behind the rain field.
  const scene = buildSceneBackdropNode();

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

  // Holder where the nodes live whenever no screen is showing them. display:none
  // is safe: the client sizes the canvas from window.innerWidth (not the container)
  // and rAF keeps running, so the rain keeps simulating while parked and is ready
  // the instant it's re-parented onto the next screen.
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.setAttribute('data-ambience-parked', '');
  holder.append(scene, field, overlay);
  document.body.appendChild(holder);

  sceneNode = scene;
  fieldCanvas = field;
  overlayCanvas = overlay;
  parked = holder;

  // Canvas is in the DOM now (parked), so the client can bind it when it loads.
  loadVendoredClient();
}

// What the vendored client publishes on window for telemetry (client.js
// window.AmbienceClient) — only the slice the credit reads.
type AmbienceDebugState = {
  effectType?: string | null;
  scene?: { currentName?: string | null };
};

// The label lives at MODULE scope, like the nodes, and for the same reason:
// the backdrop layer must be continuous across route swaps (ADR-0046 B/G). A
// screen that remounts HomepageBackdrop seeds its state from this cache in
// its first commit, so the credit never blinks out or re-fades on navigation —
// only its very first appearance (client just loaded) fades in.
let lastEffectName: string | null = null;
let creditHasAppeared = false;

// The live name of what the rain world is running, read off the vendored
// client's debug surface. The chess world pins the "rain" effect but rotates
// named scenes within it on the authority clock (e.g. "blue-fast-drizzle",
// hours each) — the scene name is the world's own name for the current
// broadcast, so prefer it and fall back to the effect type until scene data
// lands.
function readEffectName(): string | null {
  const client = (window as { AmbienceClient?: { getDebugState?: () => AmbienceDebugState } })
    .AmbienceClient;
  const state = client?.getDebugState?.();
  if (state) {
    const raw = state.scene?.currentName || state.effectType || '';
    // Ambience's own label treatment (chrome.js effectLabel): hyphenated
    // scene ids read as plain words.
    const label = raw.replace(/-/g, ' ').trim();
    if (label) lastEffectName = label;
  }
  return lastEffectName;
}

// Polled because the client exposes state, not events; the read is a local
// object access (no network), so a short interval costs nothing and also
// covers the client's async load. Scene changes are hours apart.
function useAmbienceEffectName(): string | null {
  const [name, setName] = useState<string | null>(readEffectName);
  useEffect(() => {
    const read = (): void => {
      const label = readEffectName();
      if (label) setName(label);
    };
    read();
    const timer = window.setInterval(read, 2000);
    return () => window.clearInterval(timer);
  }, []);
  return name;
}

// First-EVER appearance fade: render one frame at opacity 0 (.ambience-credit-start),
// then drop the class so the opacity transition plays. After that the module flag keeps
// every later mount steady; route-level chrome entrance is owned separately by
// ArtRouteChrome/useScreenEntrance.
function useCreditEntrance(effectName: string | null): boolean {
  const [entered, setEntered] = useState(() => creditHasAppeared);
  useEffect(() => {
    if (!effectName || entered) return undefined;
    creditHasAppeared = true;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [effectName, entered]);
  return entered;
}

// Mount point for the shared backdrop on a screen. Renders a display:contents host so
// the re-parented nodes behave as direct children of the positioned screen layer — their
// position:absolute inset:0 anchors to that layer, exactly as if the scene/canvases were
// declared inline (the screen's z-order is unchanged: scene z1, field z2, overlay z5).
//
// Alongside the backdrop it renders the ambience credit: a quiet bottom-right
// link naming the scene the world is running right now, opening ambience's
// read-only monitor for the same broadcast. It lives here (not per screen) so
// every surface that shows the shared backdrop carries the credit automatically.
export function HomepageBackdrop(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const effectName = useAmbienceEffectName();
  const creditEntered = useCreditEntrance(effectName);

  // useLayoutEffect (not useEffect): re-parent the nodes BEFORE the browser paints the
  // new screen. With useEffect the backdrop is detached for one painted frame during a
  // route swap (the old host is gone, the new one not yet filled), which reads as the
  // scene/rain blinking or restarting when you change screens.
  useLayoutEffect(() => {
    ensureScene();
    const host = hostRef.current;
    if (host && sceneNode && fieldCanvas && overlayCanvas) {
      host.append(sceneNode, fieldCanvas, overlayCanvas);
      currentHost = host;
    }
    return () => {
      // Park the singletons so they persist (and keep running) across the route
      // swap — but only if we still own them; a screen that mounted before this one
      // unmounted may have already claimed them.
      if (currentHost === host && parked && sceneNode && fieldCanvas && overlayCanvas) {
        parked.append(sceneNode, fieldCanvas, overlayCanvas);
        currentHost = null;
      }
    };
  }, []);

  return (
    <>
      <div ref={hostRef} style={{ display: 'contents' }} aria-hidden="true" />
      {effectName ? (
        // A button, not an anchor (ADR-0052): still opens the ambience world view in a
        // new tab, but the game shell shows no URL on hover.
        <button
          type="button"
          className={`ambience-credit${creditEntered ? '' : ' ambience-credit-start'}`}
          data-testid="ambience-credit"
          onClick={() => window.open(CHESS_WORLD_VIEW_URL, '_blank', 'noopener,noreferrer')}
          aria-label={`Ambience: ${effectName} — watch this effect live (opens in new tab)`}
          title={`Live from ambience — watch “${effectName}” running (opens in new tab)`}
        >
          {effectName}
        </button>
      ) : null}
    </>
  );
}
