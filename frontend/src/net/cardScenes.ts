import {
  CARD_SCENES_ID,
  CARD_SCENES_SCHEMA_VERSION,
  applyLiveCardScenes,
  assertCardScenes,
  resetLiveCardScenes,
  type CardScenesData,
  type CardScenesDocument,
} from '../run/cardSceneOverrides';
import { HttpError } from './http';

const CARD_SCENES_ROUTE = `/api/card-scenes/${CARD_SCENES_ID}`;

function documentFrom(value: unknown): CardScenesDocument {
  const body = value as { document?: Partial<CardScenesDocument> };
  const document = body?.document;
  if (!document || document.id !== CARD_SCENES_ID
    || document.clientSchemaVersion !== CARD_SCENES_SCHEMA_VERSION
    || !Number.isSafeInteger(document.revision) || Number(document.revision) < 0) {
    throw new Error('card scenes response metadata is invalid');
  }
  assertCardScenes(document.data);
  return {
    id: CARD_SCENES_ID,
    data: document.data as CardScenesData,
    clientSchemaVersion: CARD_SCENES_SCHEMA_VERSION,
    revision: Number(document.revision),
    createdAt: typeof document.createdAt === 'string' ? document.createdAt : null,
    updatedAt: typeof document.updatedAt === 'string' ? document.updatedAt : null,
    updatedBy: typeof document.updatedBy === 'string' ? document.updatedBy : null,
  };
}

export async function fetchLiveCardScenes(): Promise<CardScenesDocument | null> {
  const response = await fetch(CARD_SCENES_ROUTE, { cache: 'no-cache' });
  if (response.status === 404) return null;
  if (!response.ok) throw await HttpError.fromResponse('load-card-scenes', response);
  return documentFrom(await response.json());
}

/** A missing document means generated scenes — never a committed override fallback. */
export async function loadLiveCardScenes(): Promise<boolean> {
  try {
    const document = await fetchLiveCardScenes();
    if (!document) {
      resetLiveCardScenes();
      return false;
    }
    return applyLiveCardScenes(document);
  } catch (error) {
    resetLiveCardScenes();
    throw error;
  }
}

export async function saveLiveCardScenes(
  data: CardScenesData,
  expectedRevision: number | null,
): Promise<CardScenesDocument> {
  assertCardScenes(data);
  const response = await fetch(CARD_SCENES_ROUTE, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      data,
      expectedRevision,
      clientSchemaVersion: CARD_SCENES_SCHEMA_VERSION,
    }),
  });
  if (!response.ok) throw await HttpError.fromResponse('save-card-scenes', response);
  const document = documentFrom(await response.json());
  applyLiveCardScenes(document);
  return document;
}
