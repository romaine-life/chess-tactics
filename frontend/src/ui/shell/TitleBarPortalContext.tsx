import { createContext } from 'react';

// Lets a stateful screen paint its OWN dynamic title-bar content (Skirmish's live
// status, the editors' save-state + action buttons) into the single persistent
// AppTitleBar without lifting that state up to App. AppTitleBar owns the center/right
// target DOM nodes and publishes them here; screens portal into them via <TitleBarSlot>.
// Targets are DOM nodes (not refs) held in App state, so a consumer re-renders the
// instant a target becomes available (avoids the createPortal "target not ready" no-op).
export interface TitleBarPortals {
  centerNode: HTMLElement | null;
  rightNode: HTMLElement | null;
}

export const TitleBarPortalContext = createContext<TitleBarPortals>({ centerNode: null, rightNode: null });
