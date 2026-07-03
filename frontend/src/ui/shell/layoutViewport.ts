// --layout-vw: the width (in px) the window WOULD have at 100% browser zoom.
//
// Why: the shared menu/settings/campaign chrome centres itself against the viewport.
// CSS cannot tell browser zoom from a window resize — both just shrink or grow the
// CSS viewport — so viewport-relative centring re-computes under zoom and the rail
// slides sideways instead of magnifying (every other placement in this chrome is
// plain px, which zoom scales natively; the mixture is what tore the layout apart).
// Centring the shell against --layout-vw instead makes browser zoom a pure
// magnification of the 100% layout: real resizes and monitor changes still update
// the var, zoom does not. At 100% the var equals the live viewport width, so the
// layout is pixel-identical to centring against 100vw.
//
// Detection: window.outerWidth is reported in OS pixels and is NOT affected by page
// zoom, while innerWidth shrinks as zoom grows — so outer/inner approximates the
// zoom factor. The ratio is snapped to the browsers' discrete zoom steps (absorbing
// window-border noise, and guaranteeing EXACTLY 1 anywhere near 100%), then the
// candidate must survive two physical-plausibility checks that a REAL zoomed window
// always passes and junk input (iframed Studio previews, headless viewport
// overrides, docked devtools) cannot:
//   1. implied window chrome  = outer − inner×zoom  — must be a small non-negative
//      sliver (real window borders; never negative, never hundreds of px);
//   2. implied OS display scale = devicePixelRatio ÷ zoom — must be an actual OS
//      scale (1, 1.25, 1.5, … — never below 1). Browser zoom multiplies dPR, so a
//      true zoom always leaves the OS base behind; a devtools dock faking the ratio
//      leaves an impossible base (e.g. 0.75) and is rejected.
// Any rejection falls back to 1 — i.e. the pre-fix layout, never garbage.
const ZOOM_STEPS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
const OS_SCALES = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3];

function zoomFactor(): number {
  const { outerWidth: ow, innerWidth: iw, devicePixelRatio: dpr } = window;
  if (!ow || !iw) return 1;
  const raw = ow / iw;
  let best = 1;
  let bestOff = Infinity;
  for (const step of ZOOM_STEPS) {
    const off = Math.abs(raw - step) / step;
    if (off < bestOff) { bestOff = off; best = step; }
  }
  if (bestOff > 0.08 || best === 1) return 1;
  const chrome = ow - iw * best;
  if (chrome < 0 || chrome > 40) return 1;
  const osBase = dpr / best;
  if (!OS_SCALES.some((b) => Math.abs(osBase - b) / b <= 0.02)) return 1;
  return best;
}

let installed = false;

// Installed once, from ArtRouteChrome — every screen in the chrome family mounts it.
// The listener lives for the app's lifetime (zoom changes fire `resize`).
export function installLayoutViewportVar(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const apply = (): void => {
    document.documentElement.style.setProperty('--layout-vw', `${Math.round(window.innerWidth * zoomFactor())}px`);
  };
  window.addEventListener('resize', apply, { passive: true });
  apply();
}
