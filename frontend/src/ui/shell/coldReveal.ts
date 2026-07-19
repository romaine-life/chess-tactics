import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';

// Cold-load reveal director.
//
// On a FRESH load of the main menu (route "/"), background, title bar, and buttons
// are one visual unit. None is exposed until all critical art is drawable. Rain is
// decorative and ungated: it keeps its own fade and can never stall the menu.
//
// "Ready" means the layer's art has ACTUALLY loaded (its onload/decode fired), not a
// timer and not fetch-start — so the fade reveals real pixels and nothing downstream
// can paint before an earlier layer's pixels are on screen. Critical failure becomes
// an explicit retryable menu state; it is never force-completed by elapsed time.
//
// This is a tiny module-scope store (read via useSyncExternalStore) rather than React
// context because the participants live in SEPARATE subtrees: the title bar is rendered
// in App OUTSIDE the routed screen, while the background + buttons live inside MainMenu.
// A module store reaches both and is drivable from imperative image-load callbacks.
//
// It gates ONLY a cold menu load: armForColdHome() is called once from main.tsx
// before React renders. On any non-menu route — and on every later soft navigation —
// the store stays in its default fully-revealed state, so nothing ever hides or blinks.

export type RevealLayer = 'bg' | 'title' | 'buttons' | 'rain';

const LADDER: RevealLayer[] = ['bg', 'title', 'buttons', 'rain'];
const LAST = LADDER.length - 1;

const BACKGROUND_SLOT = 'ui/main-menu/background-scene-v1.avif';

// stageIndex = the highest ladder layer currently allowed to be visible. Default is
// LAST (everything revealed) so any route that never arms shows instantly.
let stageIndex = LAST;
let didArm = false;
let failure: Error | null = null;
const ready = new Set<RevealLayer>();
const listeners = new Set<() => void>();

interface RevealSnapshot {
  stageIndex: number;
  error: Error | null;
  has: (layer: RevealLayer) => boolean;
}

function makeSnapshot(): RevealSnapshot {
  const idx = stageIndex;
  return { stageIndex: idx, error: failure, has: (layer) => idx >= LADDER.indexOf(layer) };
}

// Cached so useSyncExternalStore sees a stable reference between changes (a new object
// is emitted only when stageIndex actually advances).
let snapshot: RevealSnapshot = makeSnapshot();

function emit(): void {
  snapshot = makeSnapshot();
  for (const cb of listeners) cb();
}

// The shell is an atomic surface: readiness from one layer is recorded but cannot
// reveal that layer independently. One store emission exposes the entire visual unit
// only after every critical participant has acknowledged drawable pixels.
function advance(): void {
  if (stageIndex === LAST) return;
  if (!ready.has('bg') || !ready.has('title') || !ready.has('buttons')) return;
  stageIndex = LAST;
  emit();
}

export function markReady(layer: RevealLayer): void {
  if (ready.has(layer)) return;
  ready.add(layer);
  advance();
}

export function markFailed(error: unknown): void {
  if (failure) return;
  failure = error instanceof Error ? error : new Error(String(error));
  emit();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getSnapshot(): RevealSnapshot {
  return snapshot;
}

// True for any path that resolves to <MainMenu> — the renderRoute default. The menu
// has a couple of legacy aliases; everything else is a real route.
export function isMainMenuPath(path: string): boolean {
  const p = path.replace(/\/+$/, '') || '/';
  return p === '/' || p === '/menu-next' || p === '/main-menu';
}

// Arm the atomic reveal — call ONCE from main.tsx before React renders. No-op (leaves
// the store fully revealed) on any non-menu route, so the menu only sequences on a true
// cold load and nothing ever re-hides on later navigations.
export function armForColdHome(): void {
  if (didArm) return;
  didArm = true;
  if (typeof window === 'undefined') return;
  if (!isMainMenuPath(window.location.pathname)) return;

  // Hide the complete unit until every critical layer's art actually loads.
  stageIndex = -1;
  failure = null;
  ready.clear();
  // Rain is decorative. Its canvas reveals on its own fade and is never a critical gate.
  ready.add('rain');
  emit();

  // Background readiness is gated on the image ACTUALLY loading (not a timer, not
  // fetch-start) so the scene's fade reveals the real photo and nothing downstream can
  // paint before the background pixels are on screen. This probe shares the preloaded,
  // high-priority request from main.tsx (same URL -> one fetch).
  const img = new Image();
  const backgroundUrl = resolvedLiveMediaUrl(BACKGROUND_SLOT);
  img.decoding = 'async';
  try {
    (img as unknown as { fetchPriority?: string }).fetchPriority = 'high';
  } catch {
    /* fetchPriority unsupported — the preload link in main.tsx still prioritizes it */
  }
  img.onload = () => markReady('bg');
  img.onerror = () => markFailed(new Error(`Main-menu background failed: ${backgroundUrl}`));
  img.src = backgroundUrl;

  // Title + buttons readiness is reported by MainMenu. Critical failure is an explicit
  // retryable surface state; it is never renamed "ready" by a timeout.
}
