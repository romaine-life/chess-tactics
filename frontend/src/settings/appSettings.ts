import { useSyncExternalStore } from 'react';
import { DEFAULT_PLAYER_PALETTE, isPlayerPalette, type PlayerPalette } from '../core/pieces';

/**
 * How the board grid is drawn. Every value is a design that was authored and looked at on a real
 * board; `chalk` is the one the game ships with. See `.tileset-board-grid-layer path` in style.css,
 * which owns the pixels — this union only names them.
 */
export const BOARD_GRID_STYLES = ['chalk', 'ink', 'carved', 'bold', 'hairline'] as const;
export type BoardGridStyle = typeof BOARD_GRID_STYLES[number];

export function isBoardGridStyle(value: unknown): value is BoardGridStyle {
  return typeof value === 'string' && (BOARD_GRID_STYLES as readonly string[]).includes(value);
}

export const APP_SETTINGS_STORAGE_KEY = 'chess-tactics-settings-v1';
export const APP_SETTINGS_CHANGE_EVENT = 'chess-tactics:settings-change';

export interface AppSettings {
  uiScale: number;
  masterAudio: boolean;
  musicVolume: number;
  effectsVolume: number;
  interfaceSounds: boolean;
  showBoardGrid: boolean;
  boardGridStyle: BoardGridStyle;
  autoDealDeployment: boolean;
  /** The color the pieces you command wear. Opponents own every other palette. */
  playerPalette: PlayerPalette;
}

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  uiScale: 100,
  masterAudio: true,
  musicVolume: 70,
  effectsVolume: 80,
  interfaceSounds: true,
  showBoardGrid: true,
  boardGridStyle: 'chalk',
  autoDealDeployment: false,
  playerPalette: DEFAULT_PLAYER_PALETTE,
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
    showBoardGrid: typeof parsed.showBoardGrid === 'boolean'
      ? parsed.showBoardGrid
      : DEFAULT_APP_SETTINGS.showBoardGrid,
    boardGridStyle: isBoardGridStyle(parsed.boardGridStyle)
      ? parsed.boardGridStyle
      : DEFAULT_APP_SETTINGS.boardGridStyle,
    autoDealDeployment: typeof parsed.autoDealDeployment === 'boolean'
      ? parsed.autoDealDeployment
      : DEFAULT_APP_SETTINGS.autoDealDeployment,
    // A stored palette that is no longer player-selectable (or an opponent color written by an
    // older build) falls back to the default rather than reserving an opponent's color.
    playerPalette: isPlayerPalette(parsed.playerPalette)
      ? parsed.playerPalette
      : DEFAULT_APP_SETTINGS.playerPalette,
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
