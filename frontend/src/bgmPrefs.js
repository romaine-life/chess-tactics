// Per-browser background-music preferences shared between the React Settings UI
// (the soundtrack manager) and the vanilla BGM player (bgm.js). Centralised so the
// storage key + event names can never desync between the writer and the reader.
//
// Plain JS (+ bgmPrefs.d.ts for types) so it resolves identically from the TS UI,
// the vite-bundled player, and the Node-run shuffle test that imports bgm.js.

export const BGM_DISABLED_KEY = 'chess-tactics-bgm-disabled-v1';

// Fired (detail.disabled: string[]) whenever the disabled-track set changes, so a
// running player can re-filter its rotation live, without a reload.
export const BGM_DISABLED_CHANGE_EVENT = 'chess-tactics:bgm-disabled-change';

// Transient pause/resume used while auditioning a track preview. Does NOT touch the
// persisted mute preference — it just parks the background shuffle so the two don't
// play over each other. detail.suspended: boolean.
export const BGM_SUSPEND_EVENT = 'chess-tactics:bgm-suspend';

// The set is stored as the list of track urls that are turned OFF (excluded). A
// track is in the rotation unless its url is present here, so newly-added tracks
// default to on without needing migration.
export function readDisabledUrls() {
  try {
    const raw = localStorage.getItem(BGM_DISABLED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

export function writeDisabledUrls(urls) {
  const list = Array.from(new Set(urls.filter((u) => typeof u === 'string')));
  try { localStorage.setItem(BGM_DISABLED_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent(BGM_DISABLED_CHANGE_EVENT, { detail: { disabled: list } }));
  return list;
}

export function setBgmSuspended(suspended) {
  window.dispatchEvent(new CustomEvent(BGM_SUSPEND_EVENT, { detail: { suspended: Boolean(suspended) } }));
}
