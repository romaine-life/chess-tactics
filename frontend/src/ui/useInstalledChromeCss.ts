import { useEffect, useState } from 'react';
import {
  composeDividerRender,
  composeFrameDataUrl,
  dividerDefault,
  frameCss,
  roleDefault,
} from './chromeFamilyRuntime';

/** Install the accepted outer/inner chrome family for a live product surface. */
export function useInstalledChromeCss(enabled = true): string {
  const [css, setCss] = useState('');

  useEffect(() => {
    if (!enabled) {
      setCss('');
      return undefined;
    }

    let live = true;
    const outer = roleDefault('outer');
    const inner = roleDefault('inner');
    const dividers = {
      outer: dividerDefault('outer'),
      inner: dividerDefault('inner'),
    };
    Promise.all([
      composeFrameDataUrl(outer),
      composeFrameDataUrl(inner),
      composeDividerRender(outer, dividers.outer),
      composeDividerRender(inner, dividers.inner),
    ]).then(([outerFrame, innerFrame, outerDivider, innerDivider]) => {
      if (live) setCss(frameCss(outer, inner, outerFrame, innerFrame, { outer: outerDivider, inner: innerDivider }));
    }).catch(() => {
      if (live) setCss('');
    });

    return () => {
      live = false;
    };
  }, [enabled]);

  return css;
}
