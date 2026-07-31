// Owner-authored Run card scene overrides: one revisioned, DB-authoritative document
// (the ADR-0089 shape — like the SFX profile) holding per-card composition overrides
// applied over the deterministic generated scene plan. Absence of the document, or of
// a card's entry, means the generated scene: there is no committed fallback copy.

import type { Direction } from '@chess-tactics/board-render';

export const CARD_SCENES_ID = 'default';
export const CARD_SCENES_SCHEMA_VERSION = 1;

const DIRECTIONS = new Set<Direction>([
  'south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west',
]);

export interface CardSceneLandmarkOverride {
  sourceArtId: string;
  direction: Direction;
  pixelX: number;
  pixelY: number;
  scale: number;
}

export type CardSceneCoverMode = 'none' | 'sparse' | 'filled';

export interface CardSceneOverride {
  /** Re-deal salt for the generated base scene (absent = the base deal). */
  salt?: number;
  /** Wholesale landmark replacement; null = explicitly no landmark. Absent = generated. */
  landmark?: CardSceneLandmarkOverride | null;
  /** Wholesale doodad channel replacement keyed by tactical cell "x,y". Absent = generated. */
  doodads?: Record<string, { doodadId: string }>;
  /** Wholesale prop channel replacement keyed by anchor cell "x,y". Absent = generated. */
  props?: Record<string, { propId: string }>;
  /** Scene-wide ground-cover mode. Absent = generated per-cell rolls. */
  cover?: CardSceneCoverMode;
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

const CELL_KEY = /^-?\d{1,2},-?\d{1,2}$/;
const ART_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/;
const COVER_MODES = new Set<CardSceneCoverMode>(['none', 'sparse', 'filled']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertLandmark(value: unknown, cardId: string): asserts value is CardSceneLandmarkOverride {
  if (!isRecord(value)) throw new Error(`card scene ${cardId} landmark is invalid`);
  if (typeof value.sourceArtId !== 'string' || !ART_ID.test(value.sourceArtId)
    || typeof value.direction !== 'string' || !DIRECTIONS.has(value.direction as Direction)
    || !Number.isFinite(value.pixelX) || !Number.isFinite(value.pixelY)
    || !Number.isFinite(value.scale) || Number(value.scale) <= 0 || Number(value.scale) > 8) {
    throw new Error(`card scene ${cardId} landmark fields are invalid`);
  }
}

function assertPlacedMap(value: unknown, key: 'doodadId' | 'propId', cardId: string): void {
  if (!isRecord(value)) throw new Error(`card scene ${cardId} ${key} map is invalid`);
  for (const [cell, placed] of Object.entries(value)) {
    if (!CELL_KEY.test(cell) || !isRecord(placed)
      || typeof placed[key] !== 'string' || !ART_ID.test(String(placed[key]))) {
      throw new Error(`card scene ${cardId} ${key} entry ${cell} is invalid`);
    }
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
    if (override.landmark !== undefined && override.landmark !== null) assertLandmark(override.landmark, cardId);
    if (override.doodads !== undefined) assertPlacedMap(override.doodads, 'doodadId', cardId);
    if (override.props !== undefined) assertPlacedMap(override.props, 'propId', cardId);
    if (override.cover !== undefined && !COVER_MODES.has(override.cover)) {
      throw new Error(`card scene ${cardId} cover mode is invalid`);
    }
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
