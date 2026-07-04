// Route warm-up on intent (ADR-0052). Split from App.tsx so BOTH consumers share one
// warm path: App's document-level pointerover/focusin delegate (for the anchors that
// remain — brand lockup, auth, external) and NavButton's own pointerenter/focus (the
// converted game controls). The module registry dedupes import(), so warming here IS
// the click-time download.

import { ensureCampaignsHydrated } from '../campaign/hydrate';

// The Pixi-heavy / larger surfaces are code-split so the menu, lobbies, etc. don't
// pull the renderer bundle (preserving app.js's lazy-mount behaviour). The raw
// import() thunks are named so the same chunk can be *prefetched* on hover/focus and
// consumed by App's lazy() at click time.
export const importSkirmish = () => import('./Skirmish');
export const importSkirmishMapPicker = () => import('./SkirmishMapPicker');
export const importCampaignEditor = () => import('./CampaignEditor');
export const importTilePreview = () => import('./TilePreview');
export const importLevelEditor = () => import('./LevelEditor');
export const importPortraitEditor = () => import('./PortraitEditor');
export const importDoodadEditor = () => import('./DoodadEditor');

// Mirror of renderRoute's lazy routes: which chunk a path needs, if any. Eager
// routes (Campaign, Lobbies, Settings…) return null — they're already in the main
// bundle, nothing to warm.
function chunkForPath(path: string): (() => Promise<unknown>) | null {
  if (path === '/play') return importSkirmish;
  if (path === '/skirmish') return importSkirmishMapPicker;
  if (path === '/tileset-studio' || path === '/unit-studio' || path === '/nine-slice-editor' || path === '/prop-lab' || path === '/tile-compare' || path === '/surface-lab') return importTilePreview;
  if (path === '/edit' || path === '/level-editor') return importLevelEditor;
  if (path === '/portrait-editor') return importPortraitEditor;
  if (path === '/doodad-editor') return importDoodadEditor;
  if (path === '/campaigns-next' || path === '/campaigns') return importCampaignEditor;
  return null;
}

// Warm a route's JS chunk on intent (hover/focus) so the click doesn't wait on a
// cold download. The set keeps us from re-invoking the thunk on every pointer move
// (the import() itself is already idempotent, but this avoids the churn).
const prefetched = new Set<() => Promise<unknown>>();
export function prefetchRoute(path: string): void {
  const thunk = chunkForPath(path);
  if (thunk && !prefetched.has(thunk)) {
    prefetched.add(thunk);
    void thunk();
  }
  // Warm route DATA the same way (ADR-0051): the Campaign play screen holds its reveal
  // on the campaign store hydrating, and the skirmish map picker's "Loading maps."
  // window shrinks with it — so start that fetch at hover/focus intent; by click time
  // the store is usually populated. ensureCampaignsHydrated is self-deduping, so
  // repeat intent events are free.
  if (path === '/campaign' || path.startsWith('/campaign/') || path === '/skirmish') {
    void ensureCampaignsHydrated();
  }
}
