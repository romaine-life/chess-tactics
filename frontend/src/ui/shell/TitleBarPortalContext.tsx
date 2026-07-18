import { createContext } from 'react';

// Lets a stateful screen contribute its OWN dynamic title-bar state (Skirmish's live
// status, editor save-state, and routed controls) to the single persistent AppTitleBar
// without lifting that state up to App. AppTitleBar owns every portal target and
// publishes them here. Center/stud content uses <TitleBarSlot>;
// routed controls use the closed <TitleBarControlContribution> API so callers cannot
// choose the title bar's button markup or placement (ADR-0104).
// Targets are DOM nodes (not refs) held in App state, so a consumer re-renders the
// instant a target becomes available (avoids the createPortal "target not ready" no-op).
export interface TitleBarPortals {
  centerNode: HTMLElement | null;
  beforeDividerNode: HTMLElement | null;
  /** Bottom-centre "stud" target (the ornament diamond) — filled only by a single-player
   *  Skirmish with its Retry button. Absolutely positioned, so it never shifts the layout. */
  studNode: HTMLElement | null;
}

export const TitleBarPortalContext = createContext<TitleBarPortals>({ centerNode: null, beforeDividerNode: null, studNode: null });
