// Client for the campaign-editor workspace (all campaigns + their level docs as
// one document). File-backed on the server today; swappable to a DB later.

import type { Campaign, Level } from '../core/level';
import { HttpError } from './http';

export interface Workspace {
  campaigns: Campaign[];
  levels: Record<string, Level>;
}

export interface RevisionedWorkspace extends Workspace {
  revision: number;
  updated_at: string | null;
}

export interface OfficialCampaignLoadResult {
  workspace: RevisionedWorkspace;
  available: boolean;
}

export type WorkspaceConflictScope = 'user' | 'official';

/**
 * A whole-workspace CAS failure. `currentWorkspace` is evidence for the UI, not a
 * revision token that may be paired with the stale body and retried automatically.
 */
export class WorkspaceConflictError extends HttpError {
  readonly scope: WorkspaceConflictScope;
  readonly code: string;
  readonly currentWorkspace: RevisionedWorkspace;
  readonly reservedLevelIds: string[];

  constructor(input: {
    action: string;
    scope: WorkspaceConflictScope;
    code: string;
    currentWorkspace: RevisionedWorkspace;
    reservedLevelIds?: string[];
  }) {
    super(input.action, 409, input.code);
    this.name = 'WorkspaceConflictError';
    this.scope = input.scope;
    this.code = input.code;
    this.currentWorkspace = input.currentWorkspace;
    this.reservedLevelIds = input.reservedLevelIds ?? [];
  }
}

export function isWorkspaceConflict(error: unknown): error is WorkspaceConflictError {
  return error instanceof WorkspaceConflictError;
}

function safeRevision(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeUpdatedAt(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asRevisionedWorkspace(value: unknown): RevisionedWorkspace {
  const data = (value && typeof value === 'object' ? value : {}) as Partial<RevisionedWorkspace>;
  return {
    campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
    levels: data.levels && typeof data.levels === 'object' ? data.levels : {},
    revision: safeRevision(data.revision),
    updated_at: safeUpdatedAt(data.updated_at),
  };
}

export async function loadWorkspace(): Promise<RevisionedWorkspace> {
  const res = await fetch('/api/campaign-workspace', { credentials: 'include' });
  if (!res.ok) throw await HttpError.fromResponse('load', res);
  return asRevisionedWorkspace(await res.json());
}

export async function saveWorkspace(
  ws: Workspace,
  expectedRevision: number,
): Promise<{ ok: boolean; revision: number; updated_at: string | null }> {
  const res = await fetch('/api/campaign-workspace', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ...ws, revision: expectedRevision }),
  });
  if (res.status === 409) {
    try {
      const body = await res.clone().json() as {
        error?: unknown;
        workspace?: unknown;
        level_ids?: unknown;
      };
      if (body.workspace && typeof body.error === 'string') {
        throw new WorkspaceConflictError({
          action: 'save',
          scope: 'user',
          code: body.error,
          currentWorkspace: asRevisionedWorkspace(body.workspace),
          reservedLevelIds: Array.isArray(body.level_ids)
            ? body.level_ids.filter((id): id is string => typeof id === 'string')
            : [],
        });
      }
    } catch (error) {
      if (error instanceof WorkspaceConflictError) throw error;
    }
  }
  if (!res.ok) throw await HttpError.fromResponse('save', res);
  const body = await res.json() as { ok?: unknown; revision?: unknown; updated_at?: unknown };
  return {
    ok: body.ok === true,
    revision: safeRevision(body.revision),
    updated_at: safeUpdatedAt(body.updated_at),
  };
}

// --- Official (global) tier ------------------------------------------------
// The live global DB row (public GET) is the SINGLE and ONLY source of truth for official
// campaigns. There is no committed fixture and no fallback: a DB miss/error resolves to NO
// officials (empty), never stale content. In dev this means a frontend running with no backend
// shows no officials. Never throws — officials must survive any backend failure.
const OFFICIAL_ID = 'default';

export async function loadOfficialCampaignsResult(): Promise<OfficialCampaignLoadResult> {
  // The live DB row (public GET, design_portfolios envelope) is authoritative. Any error or a
  // synthesized-empty miss resolves to no officials rather than throwing. Keep availability
  // separate so route hydration can retry a transient failure instead of caching it as success.
  const empty: RevisionedWorkspace = { campaigns: [], levels: {}, revision: 0, updated_at: null };
  try {
    const res = await fetch(`/api/official-campaigns/${OFFICIAL_ID}`, { cache: 'no-cache' });
    if (!res.ok) return { workspace: empty, available: false };
    const body = (await res.json()) as {
      portfolio?: { data?: unknown; revision?: unknown; updated_at?: unknown };
    };
    return {
      workspace: {
        ...asRevisionedWorkspace(body.portfolio?.data),
        revision: safeRevision(body.portfolio?.revision),
        updated_at: safeUpdatedAt(body.portfolio?.updated_at),
      },
      available: true,
    };
  } catch {
    return { workspace: empty, available: false };
  }
}

export async function loadOfficialCampaigns(): Promise<RevisionedWorkspace> {
  return (await loadOfficialCampaignsResult()).workspace;
}

export async function saveOfficialCampaigns(
  ws: Workspace,
  expectedRevision: number,
): Promise<{ revision: number; updated_at: string | null }> {
  const res = await fetch(`/api/official-campaigns/${OFFICIAL_ID}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ data: ws, revision: expectedRevision }),
  });
  if (res.status === 409) {
    try {
      const body = await res.clone().json() as {
        error?: unknown;
        portfolio?: { data?: unknown; revision?: unknown; updated_at?: unknown };
      };
      if (body.portfolio && typeof body.error === 'string') {
        throw new WorkspaceConflictError({
          action: 'save-official',
          scope: 'official',
          code: body.error,
          currentWorkspace: {
            ...asRevisionedWorkspace(body.portfolio.data),
            revision: safeRevision(body.portfolio.revision),
            updated_at: safeUpdatedAt(body.portfolio.updated_at),
          },
        });
      }
    } catch (error) {
      if (error instanceof WorkspaceConflictError) throw error;
    }
  }
  if (!res.ok) throw await HttpError.fromResponse('save-official', res);
  const body = (await res.json()) as { portfolio?: { revision?: unknown; updated_at?: unknown } };
  return {
    revision: safeRevision(body.portfolio?.revision),
    updated_at: safeUpdatedAt(body.portfolio?.updated_at),
  };
}
