import type { PlayingSide } from './clientPerspective';

export interface PersistedRelayMove {
  x: number;
  y: number;
  promotion?: 'queen' | 'rook' | 'bishop' | 'knight';
}

const STORAGE_PREFIX = 'ct:net-intent:';
const STORAGE_VERSION = 1;
const MAX_INTENT_AGE_MS = 24 * 60 * 60 * 1000;
const PROMOTIONS = new Set(['queen', 'rook', 'bishop', 'knight']);

export interface PersistedNetIntent {
  version: 1;
  lobbyId: string;
  localSide: PlayingSide;
  intentId: string;
  expectedMoveCount: number;
  pieceId: string;
  move: PersistedRelayMove;
  createdAt: number;
}

function intentStorages(): Storage[] {
  const storages: Storage[] = [];
  try { if (typeof globalThis.localStorage !== 'undefined') storages.push(globalThis.localStorage); } catch { /* denied */ }
  return storages;
}

function storageKey(lobbyId: string, localSide: PlayingSide): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(lobbyId)}:${localSide}`;
}

function validMove(value: unknown): value is PersistedRelayMove {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const move = value as { x?: unknown; y?: unknown; promotion?: unknown };
  return typeof move.x === 'number'
    && Number.isFinite(move.x)
    && typeof move.y === 'number'
    && Number.isFinite(move.y)
    && (move.promotion === undefined || (typeof move.promotion === 'string' && PROMOTIONS.has(move.promotion)));
}

function parseIntent(value: unknown): PersistedNetIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const intent = value as Partial<PersistedNetIntent>;
  if (
    intent.version !== STORAGE_VERSION
    || typeof intent.lobbyId !== 'string'
    || !intent.lobbyId
    || (intent.localSide !== 'player' && intent.localSide !== 'enemy')
    || typeof intent.intentId !== 'string'
    || !intent.intentId
    || !Number.isInteger(intent.expectedMoveCount)
    || (intent.expectedMoveCount ?? -1) < 0
    || typeof intent.pieceId !== 'string'
    || !intent.pieceId
    || !validMove(intent.move)
    || typeof intent.createdAt !== 'number'
    || !Number.isFinite(intent.createdAt)
  ) return null;
  return intent as PersistedNetIntent;
}

export function persistNetIntent(intent: Omit<PersistedNetIntent, 'version'>): boolean {
  const serialized = JSON.stringify({ version: STORAGE_VERSION, ...intent });
  for (const storage of intentStorages()) {
    try {
      storage.setItem(storageKey(intent.lobbyId, intent.localSide), serialized);
      return true;
    } catch {
      // No weaker session-only fallback: a request can outlive a closed tab, so its
      // identity must remain visible to a replacement tab on the same origin.
    }
  }
  return false;
}

export function loadPersistedNetIntent(lobbyId: string, localSide: PlayingSide): PersistedNetIntent | null {
  const key = storageKey(lobbyId, localSide);
  for (const storage of intentStorages()) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const intent = parseIntent(JSON.parse(raw));
      if (!intent || Date.now() - intent.createdAt > MAX_INTENT_AGE_MS) {
        storage.removeItem(key);
        continue;
      }
      if (intent.lobbyId !== lobbyId || intent.localSide !== localSide) continue;
      return intent;
    } catch {
      try { storage.removeItem(key); } catch { /* storage became unavailable */ }
    }
  }
  return null;
}

/** Clear only the identity the caller settled. A stale response cannot erase a newer
 * gesture that reused the same lobby storage slot. */
export function clearPersistedNetIntent(lobbyId: string, intentId?: string): void {
  for (const storage of intentStorages()) {
    for (const localSide of ['player', 'enemy'] as const) {
      const key = storageKey(lobbyId, localSide);
      try {
        if (intentId) {
          const raw = storage.getItem(key);
          if (!raw) continue;
          const stored = parseIntent(JSON.parse(raw));
          if (!stored || stored.intentId !== intentId) continue;
        }
        storage.removeItem(key);
      } catch {
        // Best effort. A later load discards malformed/expired data.
      }
    }
  }
}
