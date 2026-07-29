import type { RunDocument } from '../run/model';
import { HttpError } from './http';

export interface RevisionedActiveRun {
  run: RunDocument | null;
  revision: number;
  updated_at: string | null;
}

function safeRevision(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function parsedActiveRun(value: unknown): RevisionedActiveRun {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const run = body.run && typeof body.run === 'object' ? body.run as RunDocument : null;
  return {
    run,
    revision: safeRevision(body.revision),
    updated_at: typeof body.updated_at === 'string' ? body.updated_at : null,
  };
}

export async function loadActiveRun(): Promise<RevisionedActiveRun> {
  const response = await fetch('/api/active-run', { credentials: 'include', cache: 'no-cache' });
  if (!response.ok) throw await HttpError.fromResponse('load-active-run', response);
  return parsedActiveRun(await response.json());
}

export async function saveActiveRun(run: RunDocument, revision: number): Promise<RevisionedActiveRun> {
  const response = await fetch('/api/active-run', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ run, revision }),
  });
  if (!response.ok) throw await HttpError.fromResponse('save-active-run', response);
  return parsedActiveRun(await response.json());
}

export async function deleteActiveRun(revision: number): Promise<void> {
  const response = await fetch('/api/active-run', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ revision }),
  });
  if (!response.ok) throw await HttpError.fromResponse('delete-active-run', response);
}
