import { useLayoutEffect, useState } from 'react';

// Lets a stateful screen contribute its OWN dynamic title-bar state (Skirmish's live
// status, editor save-state, and routed controls) to the single persistent AppTitleBar
// without lifting DOM nodes into the scene director. Center/stud content uses <TitleBarSlot>;
// routed controls use the closed <TitleBarControlContribution> API so callers cannot
// choose the title bar's button markup or placement (ADR-0104).
export type TitleBarPortalRegion = 'center' | 'before-divider' | 'stud';

const SELECTORS: Record<TitleBarPortalRegion, string> = {
  center: '[data-titlebar-portal="center"]',
  'before-divider': '[data-titlebar-portal="before-divider"]',
  stud: '[data-titlebar-portal="stud"]',
};

export function useTitleBarPortalTarget(region: TitleBarPortalRegion): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const find = (): HTMLElement | null => document.querySelector<HTMLElement>(SELECTORS[region]);
    const found = find();
    setTarget((current) => current === found ? current : found);
    if (found) return undefined;
    // The persistent bar creates a route-owned portal host only once the destination
    // commits, while the destination screen mounts during scene preparation. A single
    // sample would leave the slot permanently empty, so watch until the host exists.
    const observer = new MutationObserver(() => {
      const next = find();
      if (!next) return;
      observer.disconnect();
      setTarget(next);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [region]);
  return target;
}
