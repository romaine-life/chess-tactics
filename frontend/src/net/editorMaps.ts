import type { Level } from '../core/level';
import { HttpError } from './http';

export interface EditorMapDocument {
  public_id: string;
  level: Level;
  revision: number;
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
  saved_at?: string | null;
  is_misc: boolean;
  can_edit: boolean;
  edit_key?: string;
  creator?: EditorMapCreator;
}

export interface EditorMapSummary {
  public_id: string;
  name: string;
  cols?: number | null;
  rows?: number | null;
  revision: number;
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
  saved_at?: string | null;
  is_misc: boolean;
  can_edit: boolean;
  creator?: EditorMapCreator;
}

export interface EditorMapAdminSummary extends EditorMapSummary {
  owner_email?: string | null;
  anonymous_user_hash?: string | null;
  anonymous_label?: string | null;
  listed: boolean;
  saved_by?: string | null;
}

export interface EditorMapAuditEvent {
  id: number | string;
  public_id: string;
  action: string;
  actor_email?: string | null;
  anonymous_user_hash?: string | null;
  anonymous_label?: string | null;
  created_at?: string | null;
}

const EDITOR_MAP_KEY_PREFIX = 'ct:editor-map-key:v1:';
const EDITOR_MAP_ANONYMOUS_ID_KEY = 'ct:editor-anonymous-id:v1';

export interface EditorMapCreator {
  kind: 'account' | 'anonymous' | 'system';
  label: string;
}

export interface CreateEditorMapOptions {
  misc?: boolean;
  headless?: boolean;
}

const localStore = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

function rememberEditorMapKey(publicId: string, key: string | undefined): void {
  if (!key) return;
  const store = localStore();
  if (!store) return;
  try {
    store.setItem(`${EDITOR_MAP_KEY_PREFIX}${publicId}`, key);
  } catch {
    /* A missing key only downgrades this browser to read-only. */
  }
}

function storedEditorMapKey(publicId: string): string | null {
  const store = localStore();
  if (!store) return null;
  try {
    return store.getItem(`${EDITOR_MAP_KEY_PREFIX}${publicId}`);
  } catch {
    return null;
  }
}

function editorMapAuthHeaders(publicId: string): HeadersInit {
  const key = storedEditorMapKey(publicId);
  return key ? { 'x-editor-map-key': key } : {};
}

function randomToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function editorAnonymousId(): string {
  const store = localStore();
  if (!store) return randomToken();
  try {
    const existing = store.getItem(EDITOR_MAP_ANONYMOUS_ID_KEY);
    if (existing) return existing;
    const next = randomToken();
    store.setItem(EDITOR_MAP_ANONYMOUS_ID_KEY, next);
    return next;
  } catch {
    return randomToken();
  }
}

function editorMapIdentityHeaders(): HeadersInit {
  return { 'x-editor-anonymous-id': editorAnonymousId() };
}

export async function createEditorMap(level: Level, options: boolean | CreateEditorMapOptions = false): Promise<EditorMapDocument> {
  const misc = typeof options === 'boolean' ? options : options.misc === true;
  const headless = typeof options === 'object' && options.headless === true;
  const res = await fetch('/api/editor-maps', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...editorMapIdentityHeaders() },
    credentials: 'include',
    body: JSON.stringify({ level, misc, headless }),
  });
  if (!res.ok) throw await HttpError.fromResponse('create-editor-map', res);
  const doc = (await res.json()) as EditorMapDocument;
  rememberEditorMapKey(doc.public_id, doc.edit_key);
  return doc;
}

export async function loadEditorMap(publicId: string): Promise<EditorMapDocument> {
  const res = await fetch(`/api/editor-maps/${encodeURIComponent(publicId)}`, {
    credentials: 'include',
    cache: 'no-cache',
    headers: { ...editorMapIdentityHeaders(), ...editorMapAuthHeaders(publicId) },
  });
  if (!res.ok) throw await HttpError.fromResponse('load-editor-map', res);
  const doc = (await res.json()) as EditorMapDocument;
  rememberEditorMapKey(doc.public_id, doc.edit_key);
  return doc;
}

export async function updateEditorMap(publicId: string, level: Level): Promise<EditorMapDocument> {
  const res = await fetch(`/api/editor-maps/${encodeURIComponent(publicId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...editorMapIdentityHeaders(), ...editorMapAuthHeaders(publicId) },
    credentials: 'include',
    body: JSON.stringify({ level }),
  });
  if (!res.ok) throw await HttpError.fromResponse('update-editor-map', res);
  const doc = (await res.json()) as EditorMapDocument;
  rememberEditorMapKey(doc.public_id, doc.edit_key);
  return doc;
}

export async function markEditorMapSaved(publicId: string): Promise<EditorMapDocument> {
  const res = await fetch(`/api/editor-maps/${encodeURIComponent(publicId)}/saved`, {
    method: 'POST',
    credentials: 'include',
    headers: editorMapIdentityHeaders(),
  });
  if (!res.ok) throw await HttpError.fromResponse('save-editor-map', res);
  const doc = (await res.json()) as EditorMapDocument;
  rememberEditorMapKey(doc.public_id, doc.edit_key);
  return doc;
}

export async function listEditorMaps(scope: 'misc' | 'mine' = 'mine'): Promise<EditorMapSummary[]> {
  const res = await fetch(`/api/editor-maps?scope=${encodeURIComponent(scope)}`, {
    credentials: 'include',
    cache: 'no-cache',
    headers: editorMapIdentityHeaders(),
  });
  if (!res.ok) throw await HttpError.fromResponse('list-editor-maps', res);
  return (await res.json() as { maps: EditorMapSummary[] }).maps;
}

export async function listAdminEditorMaps(): Promise<EditorMapAdminSummary[]> {
  const res = await fetch('/api/admin/editor-maps', {
    credentials: 'include',
    cache: 'no-cache',
  });
  if (!res.ok) throw await HttpError.fromResponse('list-admin-editor-maps', res);
  return (await res.json() as { maps: EditorMapAdminSummary[] }).maps;
}

export async function listEditorMapAuditEvents(publicId: string): Promise<EditorMapAuditEvent[]> {
  const res = await fetch(`/api/admin/editor-maps/${encodeURIComponent(publicId)}/events`, {
    credentials: 'include',
    cache: 'no-cache',
  });
  if (!res.ok) throw await HttpError.fromResponse('list-editor-map-events', res);
  return (await res.json() as { events: EditorMapAuditEvent[] }).events;
}
