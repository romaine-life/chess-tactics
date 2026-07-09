import { useSyncExternalStore } from 'react';
import { familyLabels, type LiveUnitCatalog, type PieceId } from './unitCatalog';

export const UNIT_SIZE_STORAGE_KEY = 'chess-tactics.unit-size-draft.v1';
export const UNIT_SIZE_DEFAULT = 100;
export const UNIT_SIZE_MIN = 60;
export const UNIT_SIZE_MAX = 140;
export const UNIT_SIZE_IMAGE_MAX_H = 92;
export const UNIT_SIZE_IMAGE_MAX_W = 78;
export const UNIT_SIZE_SEAT_H = 86;
export const UNIT_SIZE_SEAT_W = 72;

export const UNIT_SIZE_PIECES: PieceId[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

export type UnitSizeDraft = Record<PieceId, number>;
type UnitAnchorDraft = Record<PieceId, { x: number; y: number }>;

const listeners = new Set<() => void>();

const clampPercent = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return UNIT_SIZE_DEFAULT;
  return Math.max(UNIT_SIZE_MIN, Math.min(UNIT_SIZE_MAX, Math.round(n)));
};

const defaultDraft = (value = UNIT_SIZE_DEFAULT): UnitSizeDraft =>
  Object.fromEntries(UNIT_SIZE_PIECES.map((piece) => [piece, value])) as UnitSizeDraft;

const defaultAnchors = (): UnitAnchorDraft =>
  Object.fromEntries(UNIT_SIZE_PIECES.map((piece) => [piece, { x: 0.5, y: 0.78 }])) as UnitAnchorDraft;

const sanitizeDraft = (value: unknown, fallback: UnitSizeDraft): UnitSizeDraft => {
  if (!value || typeof value !== 'object') return { ...fallback };
  const raw = value as Partial<Record<PieceId, unknown>>;
  return Object.fromEntries(
    UNIT_SIZE_PIECES.map((piece) => [piece, clampPercent(raw[piece] ?? fallback[piece])]),
  ) as UnitSizeDraft;
};

const canUseStorage = (): boolean => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
const canUseDocument = (): boolean => typeof document !== 'undefined' && !!document.documentElement;

let publishedDraft = defaultDraft();
let publishedAnchors = defaultAnchors();

const hasStoredDraft = (): boolean => canUseStorage() && window.localStorage.getItem(UNIT_SIZE_STORAGE_KEY) !== null;

const readStoredDraft = (): UnitSizeDraft => {
  if (!canUseStorage()) return { ...publishedDraft };
  try {
    return sanitizeDraft(JSON.parse(window.localStorage.getItem(UNIT_SIZE_STORAGE_KEY) || 'null'), publishedDraft);
  } catch {
    return { ...publishedDraft };
  }
};

let localDraftActive = hasStoredDraft();
let currentDraft = localDraftActive ? readStoredDraft() : { ...publishedDraft };

const emit = (): void => {
  for (const listener of listeners) listener();
};

function applyUnitAnchors(): void {
  if (!canUseDocument()) return;
  for (const piece of UNIT_SIZE_PIECES) {
    const anchor = publishedAnchors[piece];
    document.documentElement.style.setProperty(`--unit-anchor-x-${piece}`, `${(-anchor.x * 100).toFixed(3)}%`);
    document.documentElement.style.setProperty(`--unit-anchor-y-${piece}`, `${(-anchor.y * 100).toFixed(3)}%`);
  }
}

export function applyUnitSizeDraft(draft: UnitSizeDraft = currentDraft): void {
  if (!canUseDocument()) return;
  for (const piece of UNIT_SIZE_PIECES) {
    document.documentElement.style.setProperty(`--unit-scale-${piece}`, (draft[piece] / 100).toFixed(4));
  }
}

function writeDraft(next: UnitSizeDraft): void {
  currentDraft = sanitizeDraft(next, publishedDraft);
  localDraftActive = true;
  if (canUseStorage()) window.localStorage.setItem(UNIT_SIZE_STORAGE_KEY, JSON.stringify(currentDraft));
  applyUnitSizeDraft(currentDraft);
  emit();
}

export function initUnitSizeTuning(): void {
  localDraftActive = hasStoredDraft();
  currentDraft = localDraftActive ? readStoredDraft() : { ...publishedDraft };
  applyUnitAnchors();
  applyUnitSizeDraft(currentDraft);
  if (!canUseStorage()) return;
  window.addEventListener('storage', (event) => {
    if (event.key !== UNIT_SIZE_STORAGE_KEY) return;
    localDraftActive = event.newValue !== null;
    currentDraft = localDraftActive ? readStoredDraft() : { ...publishedDraft };
    applyUnitSizeDraft(currentDraft);
    emit();
  });
}

/** Apply the globally published family sizes and accepted-art anchors. */
export function applyPublishedUnitCatalog(catalog: LiveUnitCatalog): void {
  const nextSizes = { ...publishedDraft };
  const nextAnchors = { ...publishedAnchors };
  const assetById = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  for (const family of catalog.families) {
    nextSizes[family.family] = clampPercent(family.displayScalePercent);
    const accepted = family.acceptedAssetId ? assetById.get(family.acceptedAssetId) : undefined;
    if (accepted) nextAnchors[family.family] = { x: accepted.anchor.x, y: accepted.anchor.y };
  }
  publishedDraft = nextSizes;
  publishedAnchors = nextAnchors;
  applyUnitAnchors();
  if (!localDraftActive) {
    currentDraft = { ...publishedDraft };
    applyUnitSizeDraft(currentDraft);
    emit();
  }
}

export function unitSizeSnapshot(): UnitSizeDraft {
  return currentDraft;
}

export function publishedUnitSizeSnapshot(): UnitSizeDraft {
  return publishedDraft;
}

export function hasLocalUnitSizeDraft(): boolean {
  return localDraftActive;
}

export function subscribeUnitSizeDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUnitSizeDraft(): UnitSizeDraft {
  return useSyncExternalStore(subscribeUnitSizeDraft, unitSizeSnapshot, unitSizeSnapshot);
}

export function setUnitSizePercent(piece: PieceId, percent: number): void {
  writeDraft({ ...currentDraft, [piece]: clampPercent(percent) });
}

export function resetUnitSize(piece?: PieceId): void {
  if (piece) {
    writeDraft({ ...currentDraft, [piece]: publishedDraft[piece] });
    return;
  }
  localDraftActive = false;
  currentDraft = { ...publishedDraft };
  if (canUseStorage()) window.localStorage.removeItem(UNIT_SIZE_STORAGE_KEY);
  applyUnitSizeDraft(currentDraft);
  emit();
}

export function unitSizeHandoffSpec(draft: UnitSizeDraft = currentDraft): string {
  const units = Object.fromEntries(
    UNIT_SIZE_PIECES.map((piece) => {
      const scale = draft[piece] / 100;
      return [piece, {
        label: familyLabels[piece],
        scalePercent: draft[piece],
        publishedScalePercent: publishedDraft[piece],
        boardSeatPx: {
          w: Math.round(UNIT_SIZE_SEAT_W * scale),
          h: Math.round(UNIT_SIZE_SEAT_H * scale),
        },
        imageMaxPx: {
          w: Math.round(UNIT_SIZE_IMAGE_MAX_W * scale),
          h: Math.round(UNIT_SIZE_IMAGE_MAX_H * scale),
        },
        nativeTargetPx: {
          w: Math.round(UNIT_SIZE_IMAGE_MAX_W * scale),
          h: Math.round(UNIT_SIZE_IMAGE_MAX_H * scale),
        },
      }];
    }),
  );
  return JSON.stringify({ unitSizeDraft: 2, units }, null, 2);
}
