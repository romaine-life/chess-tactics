import type { LevelEvents, ObjectiveType, TimeControl, VictoryRules } from '../core/level';
import { normalizeLevelEvents, type StoredLevelEvent } from '../core/levelEvents';

const TIME_INITIAL_PARAM = 'time';
const TIME_INCREMENT_PARAM = 'inc';
const EVENTS_PARAM = 'events';
const VICTORY_PARAM = 'victory';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeRouteJson(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeRouteJson(value: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as unknown;
}

export function appendTimeControlParams(params: URLSearchParams, timeControl: TimeControl | undefined): void {
  params.delete(TIME_INITIAL_PARAM);
  params.delete(TIME_INCREMENT_PARAM);
  if (!timeControl) return;
  params.set(TIME_INITIAL_PARAM, String(timeControl.initialSeconds));
  params.set(TIME_INCREMENT_PARAM, String(timeControl.incrementSeconds));
}

export function readTimeControlParams(params: URLSearchParams): TimeControl | undefined {
  const initialRaw = params.get(TIME_INITIAL_PARAM);
  const incrementRaw = params.get(TIME_INCREMENT_PARAM);
  if (initialRaw === null && incrementRaw === null) return undefined;

  const initialSeconds = Number(initialRaw);
  const incrementSeconds = incrementRaw === null ? 0 : Number(incrementRaw);
  if (!Number.isInteger(initialSeconds) || initialSeconds < 1) return undefined;
  if (!Number.isInteger(incrementSeconds) || incrementSeconds < 0) return undefined;
  return { initialSeconds, incrementSeconds };
}

export function appendLevelEventsParam(params: URLSearchParams, events: LevelEvents | undefined): void {
  params.delete(EVENTS_PARAM);
  if (!events?.length) return;
  params.set(EVENTS_PARAM, encodeRouteJson(events));
}

export function readLevelEventsParam(params: URLSearchParams): LevelEvents | undefined {
  const raw = params.get(EVENTS_PARAM);
  if (!raw) return undefined;
  try {
    const value = decodeRouteJson(raw);
    return Array.isArray(value) ? normalizeLevelEvents(value as StoredLevelEvent[]) : undefined;
  } catch {
    return undefined;
  }
}

export function appendVictoryRulesParam(params: URLSearchParams, victory: VictoryRules | undefined): void {
  params.delete(VICTORY_PARAM);
  if (!victory?.length) return;
  params.set(VICTORY_PARAM, encodeRouteJson(victory));
}

export function readVictoryRulesParam(params: URLSearchParams): VictoryRules | undefined {
  const raw = params.get(VICTORY_PARAM);
  if (!raw) return undefined;
  try {
    const value = decodeRouteJson(raw);
    return Array.isArray(value) ? value as VictoryRules : undefined;
  } catch {
    return undefined;
  }
}

/** Build the editor's one human-facing Test action: always play the exact board currently on
 * screen, while carrying its campaign target and editor location back through the round-trip. */
export function currentBoardTestHref(input: {
  boardCode: string;
  levelName: string;
  objective: ObjectiveType;
  surviveTurns: number;
  timeControl?: TimeControl;
  events?: LevelEvents;
  victory?: VictoryRules;
  editorSearch?: string;
  campaignId?: string;
  levelId?: string;
  documentRevision?: number;
  editorReturnTo?: string;
  layer?: string;
}): string {
  const backParams = new URLSearchParams(input.editorSearch ?? '');
  backParams.set('board', input.boardCode);
  backParams.set('name', input.levelName);
  backParams.set('obj', input.objective);
  if (Number.isSafeInteger(input.surviveTurns) && input.surviveTurns >= 1) {
    backParams.set('survive', String(input.surviveTurns));
  }
  if (input.campaignId) backParams.set('campaignId', input.campaignId);
  if (input.levelId) backParams.set('levelId', input.levelId);
  if (Number.isSafeInteger(input.documentRevision) && (input.documentRevision ?? 0) >= 1) {
    backParams.set('docRev', String(input.documentRevision));
  }
  if (input.editorReturnTo) backParams.set('returnTo', input.editorReturnTo);
  if (input.layer) backParams.set('layer', input.layer);
  appendTimeControlParams(backParams, input.timeControl);
  appendLevelEventsParam(backParams, input.events);
  appendVictoryRulesParam(backParams, input.victory);

  const playParams = new URLSearchParams({
    board: input.boardCode,
    name: input.levelName,
    obj: input.objective,
    survive: String(input.surviveTurns),
    mode: 'test',
    returnTo: `/editor/level?${backParams.toString()}`,
  });
  appendTimeControlParams(playParams, input.timeControl);
  appendLevelEventsParam(playParams, input.events);
  appendVictoryRulesParam(playParams, input.victory);
  const predrawnPreview = backParams.get('predrawnPreview');
  if (predrawnPreview) playParams.set('predrawnPreview', predrawnPreview);
  const predrawnCorners = backParams.get('predrawnCorners');
  if (predrawnCorners) playParams.set('predrawnCorners', predrawnCorners);
  return `/play?${playParams.toString()}`;
}

/** An explicit validated returnTo carries richer editor identity than the board-only fallback. */
export function resolvePlayReturnHref(input: {
  explicitReturnHref: string | null;
  hasBoard: boolean;
  boardReturnHref: string | null;
  levelReturnHref: string | null;
}): string | null {
  return input.explicitReturnHref ?? (input.hasBoard ? input.boardReturnHref : input.levelReturnHref);
}
