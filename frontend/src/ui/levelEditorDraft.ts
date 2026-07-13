import { DEFAULT_SURVIVE_TURNS } from '../core/objectives';
import { OBJECTIVE_TYPES, type LevelEvents, type ObjectiveType, type TimeControl, type VictoryRules } from '../core/level';
import { normalizeLevelEvents, type StoredLevelEvent } from '../core/levelEvents';
import { decodeBoard, encodeBoard, type EditorBoard } from './boardCode';

const STORAGE_PREFIX = 'ct:level-editor-draft:v1';
const DRAFT_VERSION = 1;

export interface LevelEditorDraft {
  savedAt: number;
  savedSig: string;
  // Cloud recovery entries are bound to both identities. This prevents a switched account or a
  // tampered levelId query from uploading another document's browser recovery into the open doc.
  documentId?: string;
  ownerEmail?: string;
  documentRevision?: number;
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
}

export interface ScopedLevelEditorDraftRebase {
  expectedDocumentRevision: number;
  expectedCloudSignature: string;
  nextDocumentRevision: number;
  nextCloudSignature: string;
  levelName: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const safeKeyPart = (value: string): string => value.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 96) || 'draft';

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
}: {
  levelId?: string;
  boardCode?: string | null;
  documentId?: string | null;
  ownerEmail?: string | null;
}): string {
  if (documentId && ownerEmail) {
    return `${STORAGE_PREFIX}:account:${hashDraftSeed(ownerEmail.trim().toLowerCase())}:document:${safeKeyPart(documentId)}`;
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
    documentRevision: draft.documentRevision,
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
      documentRevision: typeof value.documentRevision === 'number' && Number.isSafeInteger(value.documentRevision) && value.documentRevision >= 1
        ? value.documentRevision
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

const localStore = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

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

function normalizeScopedLevelEditorDraftIdentity(
  identity: ScopedLevelEditorDraftIdentity,
): { documentId: string; ownerEmail: string } | null {
  const documentId = identity.documentId?.trim() ?? '';
  const ownerEmail = identity.ownerEmail?.trim().toLowerCase() ?? '';
  return documentId && ownerEmail ? { documentId, ownerEmail } : null;
}

/** The one account + opaque-document browser-recovery address used by the Level Editor. */
export function scopedLevelEditorDraftKey(identity: ScopedLevelEditorDraftIdentity): string | null {
  const normalized = normalizeScopedLevelEditorDraftIdentity(identity);
  return normalized ? levelEditorDraftKey(normalized) : null;
}

/** Read a scoped recovery only when its stored identities still match its storage address. */
export function readScopedLevelEditorDraft(identity: ScopedLevelEditorDraftIdentity): LevelEditorDraft | null {
  const normalized = normalizeScopedLevelEditorDraftIdentity(identity);
  if (!normalized) return null;
  const draft = readLevelEditorDraft(levelEditorDraftKey(normalized));
  return draft?.documentId === normalized.documentId && draft.ownerEmail === normalized.ownerEmail
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
  });
}

/** Explicit Discard/Delete owns both the cloud working copy and this browser fallback. */
export function clearScopedLevelEditorDraft(identity: ScopedLevelEditorDraftIdentity): void {
  const key = scopedLevelEditorDraftKey(identity);
  if (key) clearLevelEditorDraft(key);
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
