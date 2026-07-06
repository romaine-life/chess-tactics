import { DEFAULT_SURVIVE_TURNS } from '../core/objectives';
import { OBJECTIVE_TYPES, type LevelEvents, type ObjectiveType, type TimeControl, type VictoryRules } from '../core/level';
import { decodeBoard, encodeBoard, type EditorBoard } from './boardCode';

const STORAGE_PREFIX = 'ct:level-editor-draft:v1';
const DRAFT_VERSION = 1;

export interface LevelEditorDraft {
  savedAt: number;
  savedSig: string;
  board: EditorBoard;
  levelName: string;
  objective: ObjectiveType;
  surviveTurns: number;
  // The battle clock (ADR-0053), or undefined when the level is untimed.
  timeControl?: TimeControl;
  // Authored victory conditions (ADR-0064), or undefined when the level uses the objective preset.
  victory?: VictoryRules;
  // Authored non-victory events: setup spawn and pawn-promotion triggers.
  events?: LevelEvents;
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

export function levelEditorDraftKey({ levelId, boardCode }: { levelId?: string; boardCode?: string | null }): string {
  if (boardCode) return `${STORAGE_PREFIX}:board:${hashDraftSeed(boardCode)}`;
  if (levelId) return `${STORAGE_PREFIX}:level:${safeKeyPart(levelId)}`;
  return `${STORAGE_PREFIX}:standalone`;
}

export function serializeLevelEditorDraft(draft: LevelEditorDraft): string {
  return JSON.stringify({
    v: DRAFT_VERSION,
    savedAt: draft.savedAt,
    savedSig: draft.savedSig,
    boardCode: encodeBoard(draft.board),
    levelName: draft.levelName,
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
  Array.isArray(raw) ? (raw as LevelEvents) : undefined;

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
      board,
      levelName: typeof value.levelName === 'string' && value.levelName.trim() ? value.levelName : 'Untitled level',
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

export function writeLevelEditorDraft(key: string, draft: LevelEditorDraft): void {
  const store = localStore();
  if (!store) return;
  try {
    store.setItem(key, serializeLevelEditorDraft(draft));
  } catch {
    /* Storage can be blocked or full; losing autosave is non-fatal to editing. */
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
