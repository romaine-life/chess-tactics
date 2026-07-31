// Owner-authored Run card scene overrides: one revisioned, DB-authoritative document
// (the ADR-0089 shape — like the SFX profile) holding per-card authored scenes applied
// over the deterministic generated plan. Absence of the document, or of a card's
// entry, means the generated scene: there is no committed fallback copy.

import { decodeBoard } from '../ui/boardCode';

export const CARD_SCENES_ID = 'default';
export const CARD_SCENES_SCHEMA_VERSION = 1;

/**
 * The card's authored viewing pane in board-world pixels: (x, y) is the pane centre,
 * width spans the pane horizontally, and height is implied by the capture aspect.
 * Every consumer — the live card window, the capture stage, the installed-art plate —
 * renders exactly this pane.
 */
export interface CardSceneFrame {
  x: number;
  y: number;
  width: number;
}

export interface CardSceneOverride {
  /** Re-deal salt for the generated base scene (absent = the base deal). */
  salt?: number;
  /**
   * The whole authored scene as a canonical board code (unit-less, 3×3 tactical
   * stage). Present ⇒ it replaces the generated scene wholesale; the card's mustered
   * units are always derived from the card id at render time.
   */
  board?: string;
  frame?: CardSceneFrame;
}

export interface CardScenesData {
  overrides: Record<string, CardSceneOverride>;
}

export interface CardScenesDocument {
  id: typeof CARD_SCENES_ID;
  data: CardScenesData;
  clientSchemaVersion: typeof CARD_SCENES_SCHEMA_VERSION;
  revision: number;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const CARD_SCENE_FRAME_MIN_WIDTH = 80;
export const CARD_SCENE_FRAME_MAX_WIDTH = 640;
export const CARD_SCENE_BOARD_CODE_MAX_LENGTH = 200_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function assertCardSceneFrame(value: unknown, cardId: string): asserts value is CardSceneFrame {
  if (!isRecord(value)
    || !Number.isFinite(value.x) || Math.abs(Number(value.x)) > 2000
    || !Number.isFinite(value.y) || Math.abs(Number(value.y)) > 2000
    || !Number.isFinite(value.width)
    || Number(value.width) < CARD_SCENE_FRAME_MIN_WIDTH
    || Number(value.width) > CARD_SCENE_FRAME_MAX_WIDTH) {
    throw new Error(`card scene ${cardId} frame is invalid`);
  }
}

function assertSceneBoardCode(value: unknown, cardId: string): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > CARD_SCENE_BOARD_CODE_MAX_LENGTH) {
    throw new Error(`card scene ${cardId} board code is invalid`);
  }
  const board = decodeBoard(value);
  if (!board) throw new Error(`card scene ${cardId} board code does not decode`);
  if (board.cols !== 3 || board.rows !== 3) {
    throw new Error(`card scene ${cardId} board must keep the 3×3 tactical stage`);
  }
  if (Object.keys(board.units).length > 0) {
    throw new Error(`card scene ${cardId} board must not persist units — the card derives them`);
  }
}

export function assertCardScenes(value: unknown): asserts value is CardScenesData {
  if (!isRecord(value) || !isRecord(value.overrides)) {
    throw new Error('card scenes document is invalid');
  }
  for (const [cardId, rawOverride] of Object.entries(value.overrides)) {
    if (!/^[a-z]{1,9}$/.test(cardId) || !isRecord(rawOverride)) {
      throw new Error(`card scene override ${cardId} is invalid`);
    }
    const override = rawOverride as CardSceneOverride;
    if (override.salt !== undefined && (!Number.isSafeInteger(override.salt) || override.salt < 0)) {
      throw new Error(`card scene ${cardId} salt is invalid`);
    }
    if (override.board !== undefined) assertSceneBoardCode(override.board, cardId);
    if (override.frame !== undefined) assertCardSceneFrame(override.frame, cardId);
  }
}

let current: CardScenesDocument | null = null;
let storeRevision = 0;
const listeners = new Set<() => void>();

function notify(): void {
  storeRevision += 1;
  for (const listener of [...listeners]) listener();
}

export function applyLiveCardScenes(document: CardScenesDocument): boolean {
  assertCardScenes(document.data);
  const changed = current?.revision !== document.revision;
  current = document;
  notify();
  return changed;
}

export function resetLiveCardScenes(): void {
  if (current === null) return;
  current = null;
  notify();
}

/** The authored override for one canonical card id, or null for the generated scene. */
export function cardSceneOverride(cardId: string): CardSceneOverride | null {
  return current?.data.overrides[cardId] ?? null;
}

export function currentCardScenes(): CardScenesDocument | null {
  return current;
}

/** Monotonic store revision — the reactive memo key for scene consumers. */
export function cardScenesStoreRevision(): number {
  return storeRevision;
}

export function subscribeCardScenes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
