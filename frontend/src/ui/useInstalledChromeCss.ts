import { useEffect, useState } from 'react';
import {
  composeDividerRender,
  composeFrameDataUrl,
  dividerDefault,
  frameCss,
  roleDefault,
} from './chromeFamilyRuntime';
import { loadingError, loadingMark, loadingMeasure } from '../diagnostics/loadingTimeline';
import { loadDecodedImage } from '../render/imageResources';

let installedChromeCss = '';
let installedChromePromise: Promise<string> | null = null;

/**
 * Every image the composed CSS references, minus the ones it inlined itself.
 *
 * The 9-slice frames are baked to `data:` URLs here, but a role's FILL surface stays a
 * plain `url()` into live media. That single omission is what made the persistent title
 * bar paint as an unfilled frame on a cold load: nothing requested the oak surface until
 * the bar mounted and asked for it, so at first paint it could not possibly be there
 * (ADR-0369).
 */
function referencedImageUrls(css: string): string[] {
  const urls = new Set<string>();
  for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    const url = match[1];
    if (url && !url.startsWith('data:')) urls.add(url);
  }
  return [...urls];
}

/**
 * Compose once per page lifetime; startup and later Studio consumers share the result.
 *
 * COMPLETE by construction: this does not resolve until every image the generated CSS
 * references is decoded. `main.tsx` awaits it before importing App, so a surface added to
 * this CSS later cannot slip outside the guarantee — no caller has to remember it.
 */
export function composeInstalledChromeCss(): Promise<string> {
  if (installedChromeCss) return Promise.resolve(installedChromeCss);
  if (installedChromePromise) return installedChromePromise;
  const startedAt = performance.now();
  loadingMark('shell', 'chrome-compose-start');
  const outer = roleDefault('outer');
  const inner = roleDefault('inner');
  const dividers = {
    outer: dividerDefault('outer'),
    inner: dividerDefault('inner'),
  };
  installedChromePromise = Promise.all([
    composeFrameDataUrl(outer),
    composeFrameDataUrl(inner),
    composeDividerRender(outer, dividers.outer),
    composeDividerRender(inner, dividers.inner),
  ]).then(async ([outerFrame, innerFrame, outerDivider, innerDivider]) => {
    const css = frameCss(outer, inner, outerFrame, innerFrame, { outer: outerDivider, inner: innerDivider });
    const referenced = referencedImageUrls(css);
    await Promise.all(referenced.map((url) => loadDecodedImage(url)));
    installedChromeCss = css;
    loadingMeasure('shell', 'chrome-composed', startedAt, { referencedImages: referenced.length });
    return installedChromeCss;
  }).catch((error) => {
    installedChromePromise = null;
    loadingError('shell', 'chrome-compose-failed', error);
    throw error;
  });
  return installedChromePromise;
}

/** Install the accepted outer/inner chrome family for a live product surface. */
export function useInstalledChromeCss(enabled = true): string {
  const [css, setCss] = useState(() => enabled ? installedChromeCss : '');

  useEffect(() => {
    if (!enabled) {
      setCss('');
      return undefined;
    }

    let live = true;
    const startedAt = performance.now();
    void composeInstalledChromeCss().then((nextCss) => {
      if (live) {
        setCss(nextCss);
        requestAnimationFrame(() => loadingMeasure('shell', 'chrome-first-painted-frame', startedAt));
      }
    }).catch(() => {
      if (live) setCss('');
    });

    return () => {
      live = false;
    };
  }, [enabled]);

  return css;
}
