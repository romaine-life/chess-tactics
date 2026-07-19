// The app's main pages, as read-only Studio catalog entries (ADR-0029). Each page is a
// card; "View Selected" opens its live Viewer. Routes mirror App.tsx renderRoute. Adding a
// page = one entry here. Functional viewers mount the real component with in-place tweak
// controls (Main Menu = live sizing; Settings = the dressing room); the rest are stubs that
// iframe the live route until their controls land.
import { drawableAssets } from '@chess-tactics/board-render';

export interface PageEntry {
  name: string; // stable selection id
  label: string;
  route: string; // the real app route
  status: 'functional' | 'stub';
  blurb: string; // Details-readout line
  thumb: string; // card thumbnail — a hero shot of the live route (scripts/shot-page-thumbs.mjs)
}

const currentPages = (): PageEntry[] => drawableAssets('studio-page').map((asset) => {
  const name = String(asset.behavior.value ?? '');
  const route = String(asset.behavior.route ?? '');
  const status = asset.behavior.viewerStatus;
  const thumb = asset.media.thumbnail?.media.immutableUrl;
  if (!name || !route || (status !== 'functional' && status !== 'stub') || !thumb) throw new Error(`studio page ${asset.id} is incomplete`);
  return { name, label: asset.label, route, status, blurb: String(asset.metadata.blurb ?? ''), thumb };
});
export const PAGE_ENTRIES: PageEntry[] = new Proxy([], { get: (_target, property) => { const values = currentPages(); const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; } });
