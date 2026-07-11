export const SETTINGS_STORAGE_KEY = 'chess-tactics-settings-v1';
export const SETTINGS_CHANGE_EVENT = 'chess-tactics:settings-change';

function browserStorage(): Pick<Storage, 'getItem'> | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readReduceMotionPreference(storage: Pick<Storage, 'getItem'> | null | undefined = undefined): boolean {
  const source = storage === undefined ? browserStorage() : storage;
  if (!source) return false;
  try {
    const parsed = JSON.parse(source.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as { reduceMotion?: unknown };
    return parsed.reduceMotion === true;
  } catch {
    return false;
  }
}

export function applyReduceMotionPreference(reduced = readReduceMotionPreference()): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('reduce-motion', reduced);
}

export function initReduceMotionPreference(): () => void {
  applyReduceMotionPreference();
  if (typeof window === 'undefined') return () => {};
  const sync = () => applyReduceMotionPreference();
  const syncStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_STORAGE_KEY) sync();
  };
  window.addEventListener(SETTINGS_CHANGE_EVENT, sync);
  window.addEventListener('storage', syncStorage);
  return () => {
    window.removeEventListener(SETTINGS_CHANGE_EVENT, sync);
    window.removeEventListener('storage', syncStorage);
  };
}
