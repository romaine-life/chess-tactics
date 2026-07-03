// --layout-vw: the width (px) the window would have at the reference (load-time) zoom.
//
// Why: the shared menu/settings/campaign chrome centres itself against the viewport.
// CSS cannot tell browser zoom from a window resize — both just change the CSS viewport
// width — so viewport-relative centring re-computes under zoom and the rail slides
// sideways (inward on zoom-out, off the left edge on zoom-in) instead of magnifying.
// Every OTHER placement in this chrome is plain px, which the browser scales natively
// under zoom; the mixture of the two is what tore the layout apart. Centring against
// --layout-vw instead makes browser zoom a pure magnification of the load-time layout.
//
// Detection — devicePixelRatio, the reliable signal. Browser zoom MULTIPLIES
// window.devicePixelRatio (100%→1.0, 125%→1.25×base, …); a real window resize or a
// column reflow leaves it untouched. So dpr / (dpr at load) IS the zoom factor, and
// innerWidth × that factor is the width the window would have at the load zoom — held
// constant while you zoom, and updated only when you genuinely resize. At the load zoom
// the factor is exactly 1, so --layout-vw == innerWidth and the layout is byte-identical
// to centring against 100vw (no behaviour change at rest, on any screen).
//
// This replaces an outerWidth/innerWidth heuristic that was guarded so defensively it
// returned "no zoom" on real high-DPI Windows setups — i.e. silently did nothing, so the
// original drift survived. If dpr somehow never moves, the factor stays 1 and this simply
// degrades to the pre-fix behaviour; it can never be worse.

let installed = false;
let baseDpr = 0;

export function installLayoutViewportVar(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const apply = (): void => {
    const dpr = window.devicePixelRatio || 1;
    if (!baseDpr) baseDpr = dpr; // load-time zoom = the reference the composition is drawn at
    const zoom = dpr / baseDpr;
    document.documentElement.style.setProperty('--layout-vw', `${Math.round(window.innerWidth * zoom)}px`);
  };
  // innerWidth changes on both resize and zoom (zoom also flips dpr); a bare dpr change
  // with no width change (rare) is caught by the resolution media query.
  window.addEventListener('resize', apply, { passive: true });
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  mq.addEventListener?.('change', apply);
  apply();
}
