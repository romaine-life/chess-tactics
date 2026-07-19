import { useEffect, useState } from 'react';
import {
  composeDividerRender,
  composeFrameDataUrl,
  dividerDefault,
  frameCss,
  roleDefault,
} from './chromeFamilyRuntime';
import { loadingError, loadingMark, loadingMeasure } from '../diagnostics/loadingTimeline';

let installedChromeCss = '';
let installedChromePromise: Promise<string> | null = null;

/** Compose once per page lifetime; startup and later Studio consumers share the result. */
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
  ]).then(([outerFrame, innerFrame, outerDivider, innerDivider]) => {
    installedChromeCss = frameCss(outer, inner, outerFrame, innerFrame, { outer: outerDivider, inner: innerDivider });
    loadingMeasure('shell', 'chrome-composed', startedAt);
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
