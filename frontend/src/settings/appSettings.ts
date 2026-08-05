import { useSyncExternalStore } from 'react';

export const APP_SETTINGS_STORAGE_KEY = 'chess-tactics-settings-v1';
export const APP_SETTINGS_CHANGE_EVENT = 'chess-tactics:settings-change';

export interface AppSettings {
  uiScale: number;
  masterAudio: boolean;
  musicVolume: number;
  effectsVolume: number;
  interfaceSounds: boolean;
  autoDealDeployment: boolean;
}

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  uiScale: 100,
  masterAudio: true,
  musicVolume: 70,
  effectsVolume: 80,
  interfaceSounds: true,
  autoDealDeployment: false,
});

type SettingsUpdate = Partial<AppSettings> | ((current: AppSettings) => AppSettings);

const listeners = new Set<() => void>();
let snapshot: AppSettings | null = null;
let storageListening = false;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function normalizeAppSettings(value: unknown): AppSettings {
  const parsed = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<AppSettings>
    : {};
  return {
    uiScale: clamp(parsed.uiScale, 90, 120, DEFAULT_APP_SETTINGS.uiScale),
    masterAudio: typeof parsed.masterAudio === 'boolean' ? parsed.masterAudio : DEFAULT_APP_SETTINGS.masterAudio,
    musicVolume: clamp(parsed.musicVolume, 0, 100, DEFAULT_APP_SETTINGS.musicVolume),
    effectsVolume: clamp(parsed.effectsVolume, 0, 100, DEFAULT_APP_SETTINGS.effectsVolume),
    interfaceSounds: typeof parsed.interfaceSounds === 'boolean'
      ? parsed.interfaceSounds
      : DEFAULT_APP_SETTINGS.interfaceSounds,
    autoDealDeployment: typeof parsed.autoDealDeployment === 'boolean'
      ? parsed.autoDealDeployment
      : DEFAULT_APP_SETTINGS.autoDealDeployment,
  };
}

function readStoredSettings(): AppSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_APP_SETTINGS };
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    return normalizeAppSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

function sameSettings(left: AppSettings, right: AppSettings): boolean {
  return (Object.keys(DEFAULT_APP_SETTINGS) as Array<keyof AppSettings>)
    .every((key) => left[key] === right[key]);
}

function publish(next: AppSettings): void {
  if (snapshot && sameSettings(snapshot, next)) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function ensureStorageListener(): void {
  if (storageListening || typeof window === 'undefined') return;
  storageListening = true;
  window.addEventListener('storage', (event) => {
    if (event.key === APP_SETTINGS_STORAGE_KEY) publish(readStoredSettings());
  });
  window.addEventListener(APP_SETTINGS_CHANGE_EVENT, () => publish(readStoredSettings()));
}

export function appSettingsSnapshot(): AppSettings {
  ensureStorageListener();
  snapshot ??= readStoredSettings();
  return snapshot;
}

export function subscribeAppSettings(listener: () => void): () => void {
  ensureStorageListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateAppSettings(update: SettingsUpdate): AppSettings {
  const current = appSettingsSnapshot();
  const proposed = typeof update === 'function' ? update(current) : { ...current, ...update };
  const next = normalizeAppSettings(proposed);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }
  publish(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(APP_SETTINGS_CHANGE_EVENT, { detail: next }));
  }
  return next;
}

export function useAppSettings(): AppSettings {
  return useSyncExternalStore(subscribeAppSettings, appSettingsSnapshot, appSettingsSnapshot);
}
