import { DEFAULT_SURVIVE_TURNS } from '../core/objectives';
import { OBJECTIVE_TYPES, type LevelEvents, type ObjectiveType, type TimeControl, type VictoryRules } from '../core/level';
import { normalizeLevelEvents, type StoredLevelEvent } from '../core/levelEvents';
import { decodeBoard, encodeBoard, type EditorBoard } from './boardCode';

const STORAGE_PREFIX = 'ct:level-editor-draft:v1';
const SESSION_STORAGE_PREFIX = 'ct:level-editor-draft:v2';
const DRAFT_VERSION = 1;
const CLIENT_SESSION_STORAGE_KEY = 'ct:level-editor-client-session:v1';
const CLIENT_SESSION_SECRET_STORAGE_KEY = 'ct:level-editor-client-session-secret:v1';
const CLIENT_DEVICE_STORAGE_KEY = 'ct:level-editor-client-device:v1';

export interface LevelEditorDraft {
  savedAt: number;
  savedSig: string;
  // Cloud recovery entries are bound to both identities. This prevents a switched account or a
  // tampered levelId query from uploading another document's browser recovery into the open doc.
  documentId?: string;
  ownerEmail?: string;
  /** The page/tab edit session that owns this recovery key. */
  clientSessionId?: string;
  documentRevision?: number;
  /** Server writer-fence epoch observed by this local candidate. */
  editGeneration?: number;
  cloudSignature?: string;
  recoveryConflict?: boolean;
  // The canonical workspace level this document will update. New cloud documents receive it from
  // the server immediately, before their first canonical Save.
  editingId?: string;
  board: EditorBoard;
  levelName: string;
  // Pending campaign association from the admin-only Level Editor selector. `null`
  // explicitly means unassigned; `undefined` is a legacy draft with no staged choice.
  campaignId?: string | null;
  objective: ObjectiveType;
  surviveTurns: number;
  // The battle clock (ADR-0053), or undefined when the level is untimed.
  timeControl?: TimeControl;
  // Authored victory conditions (ADR-0064), or undefined when the level uses the objective preset.
  victory?: VictoryRules;
  // Authored non-victory events: setup spawns and trigger/action events.
  events?: LevelEvents;
}

export interface ScopedLevelEditorDraftIdentity {
  documentId?: string | null;
  ownerEmail?: string | null;
  /** Omit to use this page/tab's stable client session identity. */
  clientSessionId?: string | null;
}

export interface LevelEditorClientIdentity {
  sessionId: string;
  /** Per-page bearer credential. It remains in sessionStorage and is never displayed. */
  sessionKey: string;
  deviceId: string;
}

export interface PreservedScopedLevelEditorRecovery {
  recoveryId: string;
  source: 'legacy-v1' | 'edit-session';
  clientSessionId?: string;
  draft: LevelEditorDraft;
}

export interface ScopedLevelEditorDraftRebase {
  expectedDocumentRevision: number;
  expectedCloudSignature: string;
  nextDocumentRevision: number;
  nextCloudSignature: string;
  levelName: string;
}

export interface ScopedLevelEditorRecoveryConflictAcknowledgement {
  expectedDocumentRevision: number;
  expectedCloudSignature: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const safeKeyPart = (value: string): string => value.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 96) || 'draft';

const browserStore = (kind: 'localStorage' | 'sessionStorage'): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
};

const localStore = (): Storage | null => browserStore('localStorage');
const sessionStore = (): Storage | null => browserStore('sessionStorage');

const validClientIdentityId = (raw: unknown): raw is string =>
  typeof raw === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(raw);

const validClientSessionId = (raw: unknown): raw is string =>
  typeof raw === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);

const validClientSessionKey = (raw: unknown): raw is string =>
  typeof raw === 'string' && /^[0-9a-f]{64}$/i.test(raw);

const randomClientSessionKey = (): string | null => {
  try {
    if (typeof globalThis.crypto?.getRandomValues !== 'function') return null;
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  } catch {
    // A weak fallback would turn the visible session id into practical mutation authority.
    return null;
  }
};

const randomClientIdentityId = (): string => {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    /* Fall through to the per-page entropy fallback. */
  }
  // Edit-session ids are backend-validated UUIDs even in older or restricted
  // browser realms that expose neither randomUUID nor getRandomValues.
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
};

const volatileClientSessionIds = new Map<string, string>();
const volatileClientSessionKeys = new Map<string, string>();
let volatileClientDeviceId: string | null = null;

const CLIENT_IDENTITY_CLAIM_PREFIX = 'ct:level-editor-page-session:';
const CLIENT_IDENTITY_BROADCAST_PROTOCOL = 'ct:level-editor-page-session:v1';
const CLIENT_IDENTITY_BROADCAST_SETTLE_MS = 80;
const MAX_CLIENT_IDENTITY_CLAIM_ATTEMPTS = 16;

interface RuntimeClientIdentityClaim {
  sessionId: string;
  release: () => void;
}

interface BrowserLockManager {
  request: (
    name: string,
    options: { mode: 'exclusive'; ifAvailable: true },
    callback: (lock: unknown | null) => void | Promise<void>,
  ) => Promise<void>;
}

interface BrowserBroadcastChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (message: unknown) => void;
  close: () => void;
}

type BrowserBroadcastChannelConstructor = new (name: string) => BrowserBroadcastChannel;

type ClientIdentityClaimResult = 'acquired' | 'occupied' | 'unavailable';

const heldClientIdentityClaims = new Map<string, RuntimeClientIdentityClaim>();
const pendingClientIdentityClaims = new Map<string, Promise<LevelEditorClientIdentity | null>>();
const clientIdentityRetirementEpochs = new Map<string, number>();

const storageBackedClientIdentityId = (
  store: Storage | null,
  key: string,
  volatile: 'session' | 'device',
  volatileScope = key,
): string | null => {
  if (typeof window === 'undefined') return null;
  const validStoredId = volatile === 'session' ? validClientSessionId : validClientIdentityId;
  try {
    const stored = store?.getItem(key);
    if (validStoredId(stored)) return stored;
    const created = randomClientIdentityId();
    if (store) {
      store.setItem(key, created);
      const acknowledged = store.getItem(key);
      if (validStoredId(acknowledged)) return acknowledged;
    }
  } catch {
    /* Blocked storage falls back to this page realm only. */
  }
  if (volatile === 'session') {
    const existing = volatileClientSessionIds.get(volatileScope);
    if (existing) return existing;
    const created = randomClientIdentityId();
    volatileClientSessionIds.set(volatileScope, created);
    return created;
  }
  volatileClientDeviceId ??= randomClientIdentityId();
  return volatileClientDeviceId;
};

function clientSessionStorageKey(scope?: string | null): string {
  const normalized = scope?.trim();
  if (!normalized) return CLIENT_SESSION_STORAGE_KEY;
  return `${CLIENT_SESSION_STORAGE_KEY}:${hashDraftSeed(normalized)}:${safeKeyPart(normalized)}`;
}

function clientSessionSecretStorageKey(scope?: string | null): string {
  const normalized = scope?.trim();
  if (!normalized) return CLIENT_SESSION_SECRET_STORAGE_KEY;
  return `${CLIENT_SESSION_SECRET_STORAGE_KEY}:${hashDraftSeed(normalized)}:${safeKeyPart(normalized)}`;
}

function storageBackedClientSessionKey(scope?: string | null): string | null {
  if (typeof window === 'undefined') return null;
  const key = clientSessionSecretStorageKey(scope);
  const store = sessionStore();
  try {
    const stored = store?.getItem(key);
    if (validClientSessionKey(stored)) return stored;
    const created = randomClientSessionKey();
    if (!created) return null;
    if (store) {
      store.setItem(key, created);
      const acknowledged = store.getItem(key);
      if (validClientSessionKey(acknowledged)) return acknowledged;
    }
  } catch {
    /* Blocked storage falls back to this page realm only. */
  }
  const existing = volatileClientSessionKeys.get(key);
  if (existing) return existing;
  const created = randomClientSessionKey();
  if (!created) return null;
  volatileClientSessionKeys.set(key, created);
  return created;
}

/**
 * Stable for this page/tab and document opening; separate tabs or documents
 * receive separate ids, while reloading the same document reuses its id.
 */
export function levelEditorClientSessionId(scope?: string | null): string | null {
  const key = clientSessionStorageKey(scope);
  return storageBackedClientIdentityId(sessionStore(), key, 'session', key);
}

/** Stable secret for this page/tab and document only; never use it for attribution or display. */
export function levelEditorClientSessionKey(scope?: string | null): string | null {
  return storageBackedClientSessionKey(scope);
}

/** Stable for this browser profile when localStorage is available; never mutation authority. */
export function levelEditorDeviceId(): string | null {
  return storageBackedClientIdentityId(localStore(), CLIENT_DEVICE_STORAGE_KEY, 'device');
}

export function levelEditorClientIdentity(scope?: string | null): LevelEditorClientIdentity | null {
  const sessionId = levelEditorClientSessionId(scope);
  const sessionKey = levelEditorClientSessionKey(scope);
  const deviceId = levelEditorDeviceId();
  return sessionId && sessionKey && deviceId ? { sessionId, sessionKey, deviceId } : null;
}

const releaseHeldClientIdentityClaim = (scopeKey: string, expectedSessionId?: string): void => {
  const held = heldClientIdentityClaims.get(scopeKey);
  if (!held || (expectedSessionId && held.sessionId !== expectedSessionId)) return;
  heldClientIdentityClaims.delete(scopeKey);
  held.release();
};

const rotateLevelEditorClientIdentity = (scope?: string | null): void => {
  const sessionIdKey = clientSessionStorageKey(scope);
  const sessionSecretKey = clientSessionSecretStorageKey(scope);
  releaseHeldClientIdentityClaim(sessionIdKey);
  const store = sessionStore();
  try {
    store?.removeItem(sessionIdKey);
    store?.removeItem(sessionSecretKey);
  } catch {
    /* Volatile cleanup below still rotates this page realm. */
  }
  volatileClientSessionIds.delete(sessionIdKey);
  volatileClientSessionKeys.delete(sessionSecretKey);
};

const browserLockManager = (): BrowserLockManager | null => {
  if (typeof navigator === 'undefined') return null;
  const locks = (navigator as Navigator & { locks?: BrowserLockManager }).locks;
  return locks && typeof locks.request === 'function' ? locks : null;
};

const tryAcquireClientIdentityWebLock = (
  scopeKey: string,
  sessionId: string,
  locks: BrowserLockManager,
): Promise<ClientIdentityClaimResult> => new Promise((resolve) => {
  let decided = false;
  const decide = (result: ClientIdentityClaimResult): void => {
    if (decided) return;
    decided = true;
    resolve(result);
  };

  try {
    const request = locks.request(
      `${CLIENT_IDENTITY_CLAIM_PREFIX}${sessionId}`,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (!lock) {
          decide('occupied');
          return;
        }

        let releaseLock!: () => void;
        const released = new Promise<void>((release) => { releaseLock = release; });
        let releasedAlready = false;
        heldClientIdentityClaims.set(scopeKey, {
          sessionId,
          release: () => {
            if (releasedAlready) return;
            releasedAlready = true;
            releaseLock();
          },
        });
        decide('acquired');
        await released;
      },
    );
    // The request intentionally stays pending for the page session's lifetime.
    void Promise.resolve(request).catch(() => decide('unavailable'));
  } catch {
    decide('unavailable');
  }
});

interface ClientIdentityBroadcastMessage {
  protocol: typeof CLIENT_IDENTITY_BROADCAST_PROTOCOL;
  type: 'probe' | 'contender' | 'occupied';
  claimantId: string;
  targetId?: string;
}

const parseClientIdentityBroadcastMessage = (value: unknown): ClientIdentityBroadcastMessage | null => {
  if (!isRecord(value)
    || value.protocol !== CLIENT_IDENTITY_BROADCAST_PROTOCOL
    || (value.type !== 'probe' && value.type !== 'contender' && value.type !== 'occupied')
    || typeof value.claimantId !== 'string'
    || (value.targetId !== undefined && typeof value.targetId !== 'string')) return null;
  return value as unknown as ClientIdentityBroadcastMessage;
};

const broadcastChannelConstructor = (): BrowserBroadcastChannelConstructor | null => {
  const candidate = (globalThis as typeof globalThis & {
    BroadcastChannel?: BrowserBroadcastChannelConstructor;
  }).BroadcastChannel;
  return typeof candidate === 'function' ? candidate : null;
};

/**
 * Web Locks are not universal. BroadcastChannel is only a collision detector here: the
 * authenticated backend lease and secret remain the mutation authority. A deterministic
 * contender exchange prevents two simultaneously duplicated tabs from both winning.
 */
const tryAcquireClientIdentityBroadcastClaim = async (
  scopeKey: string,
  sessionId: string,
): Promise<ClientIdentityClaimResult> => {
  const Channel = broadcastChannelConstructor();
  if (!Channel) return 'unavailable';

  let channel: BrowserBroadcastChannel;
  try {
    channel = new Channel(`${CLIENT_IDENTITY_CLAIM_PREFIX}${sessionId}`);
  } catch {
    return 'unavailable';
  }

  const claimantId = randomClientIdentityId();
  const contenders = new Set<string>();
  let established = false;
  let occupied = false;
  channel.onmessage = (event) => {
    const message = parseClientIdentityBroadcastMessage(event.data);
    if (!message || message.claimantId === claimantId) return;
    if (message.type === 'probe') {
      try {
        if (established) {
          channel.postMessage({
            protocol: CLIENT_IDENTITY_BROADCAST_PROTOCOL,
            type: 'occupied',
            claimantId,
            targetId: message.claimantId,
          } satisfies ClientIdentityBroadcastMessage);
        } else {
          contenders.add(message.claimantId);
          // A contender may have opened its channel after our probe. Reply so both sides
          // observe the same claimant set and choose the same lexical winner.
          channel.postMessage({
            protocol: CLIENT_IDENTITY_BROADCAST_PROTOCOL,
            type: 'contender',
            claimantId,
            targetId: message.claimantId,
          } satisfies ClientIdentityBroadcastMessage);
        }
      } catch {
        occupied = true;
      }
      return;
    }
    if (message.targetId !== claimantId) return;
    if (message.type === 'occupied') occupied = true;
    if (message.type === 'contender') contenders.add(message.claimantId);
  };

  try {
    channel.postMessage({
      protocol: CLIENT_IDENTITY_BROADCAST_PROTOCOL,
      type: 'probe',
      claimantId,
    } satisfies ClientIdentityBroadcastMessage);
  } catch {
    channel.close();
    return 'unavailable';
  }

  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, CLIENT_IDENTITY_BROADCAST_SETTLE_MS));
  if (occupied || [...contenders].some((contenderId) => contenderId < claimantId)) {
    channel.close();
    return 'occupied';
  }

  established = true;
  heldClientIdentityClaims.set(scopeKey, {
    sessionId,
    release: () => channel.close(),
  });
  return 'acquired';
};

const claimLevelEditorClientIdentityInternal = async (
  scope: string | null | undefined,
  scopeKey: string,
  retirementEpoch: number,
): Promise<LevelEditorClientIdentity | null> => {
  for (let attempt = 0; attempt < MAX_CLIENT_IDENTITY_CLAIM_ATTEMPTS; attempt += 1) {
    if ((clientIdentityRetirementEpochs.get(scopeKey) ?? 0) !== retirementEpoch) return null;
    const identity = levelEditorClientIdentity(scope);
    if (!identity) return null;

    const held = heldClientIdentityClaims.get(scopeKey);
    if (held?.sessionId === identity.sessionId) return identity;
    if (held) releaseHeldClientIdentityClaim(scopeKey);

    const locks = browserLockManager();
    let result = locks
      ? await tryAcquireClientIdentityWebLock(scopeKey, identity.sessionId, locks)
      : 'unavailable' as ClientIdentityClaimResult;
    if (result === 'unavailable') {
      result = await tryAcquireClientIdentityBroadcastClaim(scopeKey, identity.sessionId);
    }

    if ((clientIdentityRetirementEpochs.get(scopeKey) ?? 0) !== retirementEpoch) {
      if (result === 'acquired') releaseHeldClientIdentityClaim(scopeKey, identity.sessionId);
      return null;
    }
    if (result === 'acquired') return identity;
    if (result === 'unavailable') return null;

    // A duplicated tab inherited both sessionStorage values. Keep the old recovery address
    // untouched, rotate both authority values, and try to claim the fresh UUID instead.
    rotateLevelEditorClientIdentity(scope);
  }
  return null;
};

/**
 * Claims this page's stored edit identity for its runtime lifetime. Duplicated tabs can inherit
 * sessionStorage; an occupied claim rotates both the UUID and bearer secret before server use.
 * Browsers with neither Web Locks nor BroadcastChannel fail closed and receive no authority.
 */
export function claimLevelEditorClientIdentity(
  scope?: string | null,
): Promise<LevelEditorClientIdentity | null> {
  const scopeKey = clientSessionStorageKey(scope);
  const identity = levelEditorClientIdentity(scope);
  const held = heldClientIdentityClaims.get(scopeKey);
  if (identity && held?.sessionId === identity.sessionId) return Promise.resolve(identity);

  const pending = pendingClientIdentityClaims.get(scopeKey);
  if (pending) return pending;
  const retirementEpoch = clientIdentityRetirementEpochs.get(scopeKey) ?? 0;
  let claim!: Promise<LevelEditorClientIdentity | null>;
  claim = claimLevelEditorClientIdentityInternal(scope, scopeKey, retirementEpoch)
    .finally(() => {
      if (pendingClientIdentityClaims.get(scopeKey) === claim) pendingClientIdentityClaims.delete(scopeKey);
    });
  pendingClientIdentityClaims.set(scopeKey, claim);
  return claim;
}

/**
 * Retire the page credential after an acknowledged SPA departure. The scoped
 * browser draft is intentionally retained under the old session id so a failed
 * final autosave remains discoverable as recovery on the next opening.
 */
export function retireLevelEditorClientIdentity(scope?: string | null): void {
  const scopeKey = clientSessionStorageKey(scope);
  clientIdentityRetirementEpochs.set(scopeKey, (clientIdentityRetirementEpochs.get(scopeKey) ?? 0) + 1);
  rotateLevelEditorClientIdentity(scope);
}

/** Fresh one-shot authority for Campaign Editor actions that close their session immediately. */
export function newLevelEditorClientIdentity(): LevelEditorClientIdentity | null {
  if (typeof window === 'undefined') return null;
  const sessionKey = randomClientSessionKey();
  const deviceId = levelEditorDeviceId();
  return sessionKey && deviceId
    ? { sessionId: randomClientIdentityId(), sessionKey, deviceId }
    : null;
}

export function hashDraftSeed(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function levelEditorDraftKey({
  levelId,
  boardCode,
  documentId,
  ownerEmail,
  clientSessionId,
}: {
  levelId?: string;
  boardCode?: string | null;
  documentId?: string | null;
  ownerEmail?: string | null;
  clientSessionId?: string | null;
}): string {
  if (documentId && ownerEmail) {
    const base = `account:${hashDraftSeed(ownerEmail.trim().toLowerCase())}:document:${safeKeyPart(documentId)}`;
    return clientSessionId
      ? `${SESSION_STORAGE_PREFIX}:${base}:session:${safeKeyPart(clientSessionId)}`
      : `${STORAGE_PREFIX}:${base}`;
  }
  // A Test return carries both fields. Keep recovery attached to the known level so the
  // one-shot board snapshot cannot fork subsequent edits into an undiscoverable board key.
  if (levelId) return `${STORAGE_PREFIX}:level:${safeKeyPart(levelId)}`;
  if (boardCode) return `${STORAGE_PREFIX}:board:${hashDraftSeed(boardCode)}`;
  return `${STORAGE_PREFIX}:standalone`;
}

export function serializeLevelEditorDraft(draft: LevelEditorDraft): string {
  return JSON.stringify({
    v: DRAFT_VERSION,
    savedAt: draft.savedAt,
    savedSig: draft.savedSig,
    documentId: draft.documentId,
    ownerEmail: draft.ownerEmail,
    clientSessionId: draft.clientSessionId,
    documentRevision: draft.documentRevision,
    editGeneration: draft.editGeneration,
    cloudSignature: draft.cloudSignature,
    recoveryConflict: draft.recoveryConflict,
    editingId: draft.editingId,
    boardCode: encodeBoard(draft.board),
    levelName: draft.levelName,
    campaignId: draft.campaignId,
    objective: draft.objective,
    surviveTurns: draft.surviveTurns,
    timeControl: draft.timeControl,
    victory: draft.victory,
    events: draft.events,
  });
}

// A stored time control survives the round-trip only when both fields are whole numbers in range
// (integer initialSeconds ≥ 1, integer incrementSeconds ≥ 0 — the ADR-0053 schema); anything else
// restores as untimed rather than seeding an invalid clock.
const cleanTimeControl = (raw: unknown): TimeControl | undefined => {
  if (!isRecord(raw)) return undefined;
  const { initialSeconds, incrementSeconds } = raw;
  if (typeof initialSeconds !== 'number' || !Number.isInteger(initialSeconds) || initialSeconds < 1) return undefined;
  if (typeof incrementSeconds !== 'number' || !Number.isInteger(incrementSeconds) || incrementSeconds < 0) return undefined;
  return { initialSeconds, incrementSeconds };
};

// A stored victory (ADR-0064 if-then rule list) survives the round-trip when it is an array; the
// contents came from our own serialize, so a light shape check is enough — the real gate is
// validateLevel / validatePlayability at save time. (A pre-ADR-0064 `{win,lose}` draft is not an
// array, so it resolves to undefined and the level falls back to its objective preset.)
const cleanVictory = (raw: unknown): VictoryRules | undefined =>
  Array.isArray(raw) ? (raw as VictoryRules) : undefined;

const cleanEvents = (raw: unknown): LevelEvents | undefined =>
  Array.isArray(raw) ? normalizeLevelEvents(raw as StoredLevelEvent[]) : undefined;

export function parseLevelEditorDraft(raw: string): LevelEditorDraft | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value) || value.v !== DRAFT_VERSION) return null;
    if (typeof value.savedSig !== 'string' || typeof value.boardCode !== 'string') return null;
    const board = decodeBoard(value.boardCode);
    if (!board) return null;
    const objective = (OBJECTIVE_TYPES as readonly string[]).includes(String(value.objective))
      ? value.objective as ObjectiveType
      : 'capture-all';
    const surviveTurns = typeof value.surviveTurns === 'number' && Number.isFinite(value.surviveTurns) && value.surviveTurns > 0
      ? Math.floor(value.surviveTurns)
      : DEFAULT_SURVIVE_TURNS;
    return {
      savedAt: typeof value.savedAt === 'number' && Number.isFinite(value.savedAt) ? value.savedAt : Date.now(),
      savedSig: value.savedSig,
      documentId: typeof value.documentId === 'string' && value.documentId.trim() ? value.documentId : undefined,
      ownerEmail: typeof value.ownerEmail === 'string' && value.ownerEmail.trim() ? value.ownerEmail.trim().toLowerCase() : undefined,
      clientSessionId: validClientIdentityId(value.clientSessionId) ? value.clientSessionId : undefined,
      documentRevision: typeof value.documentRevision === 'number' && Number.isSafeInteger(value.documentRevision) && value.documentRevision >= 1
        ? value.documentRevision
        : undefined,
      editGeneration: typeof value.editGeneration === 'number' && Number.isSafeInteger(value.editGeneration) && value.editGeneration >= 0
        ? value.editGeneration
        : undefined,
      cloudSignature: typeof value.cloudSignature === 'string' ? value.cloudSignature : undefined,
      recoveryConflict: value.recoveryConflict === true ? true : undefined,
      editingId: typeof value.editingId === 'string' && value.editingId.trim() ? value.editingId : undefined,
      board,
      levelName: typeof value.levelName === 'string' && value.levelName.trim() ? value.levelName : 'Untitled level',
      campaignId: value.campaignId === null
        ? null
        : typeof value.campaignId === 'string' && value.campaignId.trim()
          ? value.campaignId
          : undefined,
      objective,
      surviveTurns,
      timeControl: cleanTimeControl(value.timeControl),
      victory: cleanVictory(value.victory),
      events: cleanEvents(value.events),
    };
  } catch {
    return null;
  }
}

export function readLevelEditorDraft(key: string): LevelEditorDraft | null {
  const store = localStore();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? parseLevelEditorDraft(raw) : null;
  } catch {
    return null;
  }
}

export function writeLevelEditorDraft(key: string, draft: LevelEditorDraft): boolean {
  const store = localStore();
  if (!store) return false;
  try {
    store.setItem(key, serializeLevelEditorDraft(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearLevelEditorDraft(key: string): void {
  const store = localStore();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* Storage can be blocked; nothing to clear. */
  }
}

function normalizeScopedLevelEditorDocumentIdentity(
  identity: ScopedLevelEditorDraftIdentity,
): { documentId: string; ownerEmail: string } | null {
  const documentId = identity.documentId?.trim() ?? '';
  const ownerEmail = identity.ownerEmail?.trim().toLowerCase() ?? '';
  return documentId && ownerEmail ? { documentId, ownerEmail } : null;
}

function normalizeScopedLevelEditorDraftIdentity(
  identity: ScopedLevelEditorDraftIdentity,
): { documentId: string; ownerEmail: string; clientSessionId: string } | null {
  const document = normalizeScopedLevelEditorDocumentIdentity(identity);
  if (!document) return null;
  const clientSessionId = identity.clientSessionId?.trim() || levelEditorClientSessionId(document.documentId);
  return validClientIdentityId(clientSessionId) ? { ...document, clientSessionId } : null;
}

function scopedDraftBase(identity: { documentId: string; ownerEmail: string }): string {
  return `account:${hashDraftSeed(identity.ownerEmail)}:document:${safeKeyPart(identity.documentId)}`;
}

function scopedSessionDraftPrefix(identity: { documentId: string; ownerEmail: string }): string {
  return `${SESSION_STORAGE_PREFIX}:${scopedDraftBase(identity)}:session:`;
}

function scopedArchivedRecoveryPrefix(identity: { documentId: string; ownerEmail: string }): string {
  return `${SESSION_STORAGE_PREFIX}:${scopedDraftBase(identity)}:recovery:`;
}

function scopedLegacyMigrationMarkerKey(identity: { documentId: string; ownerEmail: string }): string {
  return `${SESSION_STORAGE_PREFIX}:${scopedDraftBase(identity)}:legacy-migration-complete`;
}

function scopedRecoveryForwardingMarkerKey(
  identity: { documentId: string; ownerEmail: string },
  recovery: PreservedScopedLevelEditorRecovery,
  targetDocumentId: string,
): string {
  const raw = serializeLevelEditorDraft(recovery.draft);
  return `${SESSION_STORAGE_PREFIX}:${scopedDraftBase(identity)}:forwarded:${safeKeyPart(targetDocumentId)}:${safeKeyPart(recovery.recoveryId)}:${hashDraftSeed(raw)}:${hashDraftSeed([...raw].reverse().join(''))}`;
}

function legacyScopedLevelEditorDraftKey(identity: { documentId: string; ownerEmail: string }): string {
  return levelEditorDraftKey({ documentId: identity.documentId, ownerEmail: identity.ownerEmail });
}

function storedDraftMatchesDocument(
  draft: LevelEditorDraft | null,
  identity: { documentId: string; ownerEmail: string },
): draft is LevelEditorDraft {
  return draft?.documentId === identity.documentId && draft.ownerEmail === identity.ownerEmail;
}

function storageKeys(store: Storage): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key !== null) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

/**
 * Preserve the former account+document v1 recovery exactly once, under a
 * content-addressed archival key. It is deliberately not adopted as the newly
 * opened session's current draft: that tab must mount the latest cloud document
 * while the displaced recovery remains separately inspectable.
 */
export function migrateLegacyScopedLevelEditorDraft(
  identity: ScopedLevelEditorDraftIdentity,
): PreservedScopedLevelEditorRecovery | null {
  const normalized = normalizeScopedLevelEditorDraftIdentity(identity);
  const store = localStore();
  if (!normalized || !store) return null;
  const legacyKey = legacyScopedLevelEditorDraftKey(normalized);
  const migrationMarkerKey = scopedLegacyMigrationMarkerKey(normalized);
  try {
    if (store.getItem(migrationMarkerKey) === '1') return null;
    const raw = store.getItem(legacyKey);
    if (!raw) {
      store.setItem(migrationMarkerKey, '1');
      return null;
    }
    const draft = parseLevelEditorDraft(raw);
    if (!storedDraftMatchesDocument(draft, normalized)) return null;

    // Two tabs racing this migration converge on one content-addressed archive
    // instead of creating two apparent recoveries for the singleton source.
    const recoveryId = `legacy:${hashDraftSeed(raw)}:${hashDraftSeed([...raw].reverse().join(''))}`;
    const archiveKey = `${scopedArchivedRecoveryPrefix(normalized)}${safeKeyPart(recoveryId)}`;
    const archivedDraft = { ...draft, clientSessionId: normalized.clientSessionId };
    const archivedRaw = serializeLevelEditorDraft(archivedDraft);
    const existing = store.getItem(archiveKey);
    if (existing === null) store.setItem(archiveKey, archivedRaw);
    const acknowledged = parseLevelEditorDraft(store.getItem(archiveKey) ?? '');
    if (!storedDraftMatchesDocument(acknowledged, normalized)) return null;
    // Do not mark the source consumed if another tab changed it between read
    // and removal, or if a storage implementation silently rejected removal.
    if (store.getItem(legacyKey) !== raw) return null;
    store.removeItem(legacyKey);
    if (store.getItem(legacyKey) !== null) return null;
    store.setItem(migrationMarkerKey, '1');
    if (store.getItem(migrationMarkerKey) !== '1') return null;
    return {
      recoveryId,
      source: 'legacy-v1',
      clientSessionId: acknowledged.clientSessionId,
      draft: acknowledged,
    };
  } catch {
    // Never remove the only recovery unless its archive was acknowledged.
    return null;
  }
}

/** The account + document + page-session browser-recovery address. */
export function scopedLevelEditorDraftKey(identity: ScopedLevelEditorDraftIdentity): string | null {
  const normalized = normalizeScopedLevelEditorDraftIdentity(identity);
  return normalized ? levelEditorDraftKey(normalized) : null;
}

/**
 * Read only this page session's recovery. A legacy v1 recovery is first archived
 * for explicit recovery UI and is never silently mounted into this new session.
 */
export function readScopedLevelEditorDraft(identity: ScopedLevelEditorDraftIdentity): LevelEditorDraft | null {
  const normalized = normalizeScopedLevelEditorDraftIdentity(identity);
  if (!normalized) return null;
  migrateLegacyScopedLevelEditorDraft(normalized);
  const draft = readLevelEditorDraft(levelEditorDraftKey(normalized));
  return storedDraftMatchesDocument(draft, normalized) && draft.clientSessionId === normalized.clientSessionId
    ? draft
    : null;
}

/** Write a recovery through the canonical scoped address and bind its payload to that identity. */
export function writeScopedLevelEditorDraft(
  identity: ScopedLevelEditorDraftIdentity,
  draft: LevelEditorDraft,
): boolean {
  const normalized = normalizeScopedLevelEditorDraftIdentity(identity);
  if (!normalized) return false;
  return writeLevelEditorDraft(levelEditorDraftKey(normalized), {
    ...draft,
    documentId: normalized.documentId,
    ownerEmail: normalized.ownerEmail,
    clientSessionId: normalized.clientSessionId,
  });
}

/** Clear only this page session's recovery; other sessions remain losslessly isolated. */
export function clearScopedLevelEditorDraft(identity: ScopedLevelEditorDraftIdentity): void {
  const key = scopedLevelEditorDraftKey(identity);
  if (key) clearLevelEditorDraft(key);
}

/**
 * Freeze a page session's current candidate under an immutable, content-addressed
 * recovery key. This is used synchronously on displacement so a rapid re-takeover
 * cannot turn the only local branch back into the session's writable draft.
 */
export function preserveScopedLevelEditorRecovery(
  identity: ScopedLevelEditorDraftIdentity,
  draft: LevelEditorDraft,
): PreservedScopedLevelEditorRecovery | null {
  const normalized = normalizeScopedLevelEditorDraftIdentity(identity);
  const store = localStore();
  if (!normalized || !store) return null;
  const archivedDraft: LevelEditorDraft = {
    ...draft,
    documentId: normalized.documentId,
    ownerEmail: normalized.ownerEmail,
    clientSessionId: normalized.clientSessionId,
  };
  const raw = serializeLevelEditorDraft(archivedDraft);
  const recoveryId = `session:${normalized.clientSessionId}:${hashDraftSeed(raw)}:${hashDraftSeed([...raw].reverse().join(''))}`;
  const storageKey = `${scopedArchivedRecoveryPrefix(normalized)}${safeKeyPart(recoveryId)}`;
  try {
    if (store.getItem(storageKey) === null) store.setItem(storageKey, raw);
    const acknowledged = parseLevelEditorDraft(store.getItem(storageKey) ?? '');
    if (!storedDraftMatchesDocument(acknowledged, normalized)) return null;
    return {
      recoveryId,
      source: 'edit-session',
      clientSessionId: acknowledged.clientSessionId,
      draft: acknowledged,
    };
  } catch {
    return null;
  }
}

type StoredPreservedRecovery = PreservedScopedLevelEditorRecovery & { storageKey: string };

function storedPreservedScopedLevelEditorRecoveries(
  identity: ScopedLevelEditorDraftIdentity,
): StoredPreservedRecovery[] {
  const normalized = normalizeScopedLevelEditorDocumentIdentity(identity);
  const store = localStore();
  if (!normalized || !store) return [];
  migrateLegacyScopedLevelEditorDraft(identity);
  const currentSessionId = identity.clientSessionId?.trim() || levelEditorClientSessionId(normalized.documentId);
  const sessionPrefix = scopedSessionDraftPrefix(normalized);
  const archivePrefix = scopedArchivedRecoveryPrefix(normalized);
  const recoveries: StoredPreservedRecovery[] = [];

  for (const key of storageKeys(store).sort()) {
    if (!key.startsWith(sessionPrefix) && !key.startsWith(archivePrefix)) continue;
    const draft = readLevelEditorDraft(key);
    if (!storedDraftMatchesDocument(draft, normalized)) continue;
    if (key.startsWith(sessionPrefix)) {
      if (!draft.clientSessionId || draft.clientSessionId === currentSessionId) continue;
      recoveries.push({
        recoveryId: `session:${draft.clientSessionId}`,
        source: 'edit-session',
        clientSessionId: draft.clientSessionId,
        draft,
        storageKey: key,
      });
      continue;
    }
    const recoveryId = key.slice(archivePrefix.length).replace(/^legacy:/, 'legacy:');
    recoveries.push({
      recoveryId,
      source: recoveryId.startsWith('session:') ? 'edit-session' : 'legacy-v1',
      clientSessionId: draft.clientSessionId,
      draft,
      storageKey: key,
    });
  }
  return recoveries;
}

/** List recoveries belonging to other/retired sessions without adopting them. */
export function listPreservedScopedLevelEditorRecoveries(
  identity: ScopedLevelEditorDraftIdentity,
): PreservedScopedLevelEditorRecovery[] {
  return storedPreservedScopedLevelEditorRecoveries(identity).map(({ storageKey: _storageKey, ...entry }) => entry);
}

/**
 * A provisional level URL can outlive the page session that wrote its recovery. Once that exact
 * immutable candidate has been copied into the resolved document's recovery list, remember the
 * acknowledged forwarding so later openings do not resurrect a recovery the owner already
 * reviewed or deleted. The source draft remains untouched because it may still belong to a live
 * duplicated tab; a changed source body receives a different content-addressed marker.
 */
export function isPreservedScopedLevelEditorRecoveryForwarded(
  sourceIdentity: ScopedLevelEditorDraftIdentity,
  recovery: PreservedScopedLevelEditorRecovery,
  targetDocumentId: string,
): boolean {
  const normalized = normalizeScopedLevelEditorDocumentIdentity(sourceIdentity);
  const store = localStore();
  if (!normalized || !store || !targetDocumentId.trim() || !storedDraftMatchesDocument(recovery.draft, normalized)) return false;
  try {
    return store.getItem(scopedRecoveryForwardingMarkerKey(normalized, recovery, targetDocumentId)) === '1';
  } catch {
    return false;
  }
}

/** Mark forwarding only after the target document archive has been read back successfully. */
export function markPreservedScopedLevelEditorRecoveryForwarded(
  sourceIdentity: ScopedLevelEditorDraftIdentity,
  recovery: PreservedScopedLevelEditorRecovery,
  targetDocumentId: string,
): boolean {
  const normalized = normalizeScopedLevelEditorDocumentIdentity(sourceIdentity);
  const store = localStore();
  if (!normalized || !store || !targetDocumentId.trim() || !storedDraftMatchesDocument(recovery.draft, normalized)) return false;
  const markerKey = scopedRecoveryForwardingMarkerKey(normalized, recovery, targetDocumentId);
  try {
    store.setItem(markerKey, '1');
    return store.getItem(markerKey) === '1';
  } catch {
    return false;
  }
}

export function readPreservedScopedLevelEditorRecovery(
  identity: ScopedLevelEditorDraftIdentity,
  recoveryId: string,
): PreservedScopedLevelEditorRecovery | null {
  const found = storedPreservedScopedLevelEditorRecoveries(identity)
    .find((entry) => entry.recoveryId === recoveryId);
  if (!found) return null;
  const { storageKey: _storageKey, ...entry } = found;
  return entry;
}

/** Explicit recovery cleanup removes exactly the selected preserved entry. */
export function clearPreservedScopedLevelEditorRecovery(
  identity: ScopedLevelEditorDraftIdentity,
  recoveryId: string,
): boolean {
  const store = localStore();
  if (!store) return false;
  const found = storedPreservedScopedLevelEditorRecoveries(identity)
    .find((entry) => entry.recoveryId === recoveryId);
  if (!found) return false;
  try {
    store.removeItem(found.storageKey);
    return store.getItem(found.storageKey) === null;
  } catch {
    return false;
  }
}

/**
 * Rebase a browser fallback after a name-only cloud CAS. Local board/rule edits are preserved,
 * but only when the recovery proves it observed the exact cloud revision being renamed. A stale
 * or already-conflicted recovery remains untouched for the Level Editor's normal conflict flow.
 */
export function rebaseScopedLevelEditorDraft(
  identity: ScopedLevelEditorDraftIdentity,
  rebase: ScopedLevelEditorDraftRebase,
): boolean {
  const draft = readScopedLevelEditorDraft(identity);
  if (
    !draft
    || draft.recoveryConflict === true
    || draft.documentRevision !== rebase.expectedDocumentRevision
    || (draft.cloudSignature !== undefined && draft.cloudSignature !== rebase.expectedCloudSignature)
  ) return false;

  return writeScopedLevelEditorDraft(identity, {
    ...draft,
    savedAt: Date.now(),
    documentRevision: rebase.nextDocumentRevision,
    cloudSignature: rebase.nextCloudSignature,
    levelName: rebase.levelName,
  });
}

/**
 * Clear a preserved recovery conflict only after the owner explicitly chooses the browser copy
 * and that copy proves it is already bound to the cloud document revision currently on screen.
 * The next normal autosave may then compare-and-swap this exact recovery over that revision.
 */
export function acknowledgeScopedLevelEditorRecoveryConflict(
  identity: ScopedLevelEditorDraftIdentity,
  acknowledgement: ScopedLevelEditorRecoveryConflictAcknowledgement,
): boolean {
  const draft = readScopedLevelEditorDraft(identity);
  if (
    !draft
    || draft.recoveryConflict !== true
    || draft.documentRevision !== acknowledgement.expectedDocumentRevision
    || draft.cloudSignature !== acknowledgement.expectedCloudSignature
  ) return false;

  return writeScopedLevelEditorDraft(identity, {
    ...draft,
    savedAt: Date.now(),
    recoveryConflict: undefined,
  });
}
