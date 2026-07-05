import { useLayoutEffect, useState, type CSSProperties } from 'react';

// Render a full-route preview iframe at TRUE window size, scaled by an explicit zoom, inside a
// scrollable panel — so a dressing room shows real proportions (roam it with scrollbars) rather
// than a shrunk-to-fit miniature.
//
// App screens lay out against the viewport — centred bodies under a viewport-relative cap (e.g.
// .settings-shell: max-inline-size: clamp(900px, 88vw, 1240px); justify-self: center) and vw-based
// gaps. `vw` inside an iframe resolves against the IFRAME's own viewport, so a panel-sized iframe
// re-centres and re-proportions everything at the wrong width — the preview drifts from what ships.
//
// Fix: size the iframe to the LIVE window (its vw basis then matches the real page) and
// transform: scale() it by the chosen zoom. A sibling "canvas" element is sized to the SCALED
// footprint (window × zoom) so the panel's overflow:auto has real content to scroll. Pair the
// returned values with the .surface-dressing-main.is-window-zoom CSS. Scaling the iframe ELEMENT
// from the parent document does NOT establish a containing block inside the child document, so
// in-iframe background-attachment: fixed (the dressing room's continuity trick) is unaffected.
export interface WindowScaledPreview {
  canvasStyle: CSSProperties; // spread onto the .surface-dressing-canvas — reserves the scaled footprint
  frameStyle: CSSProperties; // spread onto the iframe — window-sized, scaled by zoom, anchored top-left
}

export function useWindowScaledPreview(zoom = 1): WindowScaledPreview {
  // The live window size — the iframe's vw basis. Tracked so the preview stays true as the window
  // resizes (the vw basis itself changes). No panel measurement: the zoom is explicit, not fit.
  const [win, setWin] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const measure = (): void => setWin({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const z = zoom > 0 ? zoom : 1;
  return {
    canvasStyle: { width: `${win.w * z}px`, height: `${win.h * z}px` },
    frameStyle: { width: `${win.w}px`, height: `${win.h}px`, transform: `scale(${z})`, transformOrigin: 'top left' },
  };
}
