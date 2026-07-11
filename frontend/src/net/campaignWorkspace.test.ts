import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WorkspaceConflictError,
  isWorkspaceConflict,
  loadOfficialCampaignsResult,
  loadWorkspace,
  saveOfficialCampaigns,
  saveWorkspace,
  type Workspace,
} from './campaignWorkspace';

const workspace: Workspace = { campaigns: [], levels: {} };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('user campaign workspace revisions', () => {
  it('loads the body and its compare-and-swap revision together', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      ...workspace,
      revision: 7,
      updated_at: '2026-07-10T18:00:00.000Z',
    }));

    await expect(loadWorkspace()).resolves.toEqual({
      ...workspace,
      revision: 7,
      updated_at: '2026-07-10T18:00:00.000Z',
    });
  });

  it('sends the last observed revision with the complete workspace', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      ok: true,
      revision: 8,
      updated_at: '2026-07-10T18:01:00.000Z',
    }));

    await expect(saveWorkspace(workspace, 7)).resolves.toMatchObject({ ok: true, revision: 8 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/campaign-workspace');
    expect(init).toMatchObject({ method: 'PUT', credentials: 'include' });
    expect(JSON.parse(init.body)).toEqual({ ...workspace, revision: 7 });
  });

  it('surfaces the current server workspace on a stale 409 without retrying', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      error: 'workspace_revision_conflict',
      workspace: { ...workspace, revision: 9, updated_at: null },
    }));

    const error = await saveWorkspace(workspace, 7).catch((caught: unknown) => caught);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(WorkspaceConflictError);
    expect(isWorkspaceConflict(error)).toBe(true);
    expect(error).toMatchObject({
      scope: 'user',
      code: 'workspace_revision_conflict',
      currentWorkspace: { revision: 9 },
    });
  });
});

describe('official campaign workspace revisions', () => {
  it('loads the portfolio revision with its data', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      portfolio: {
        data: workspace,
        revision: 12,
        updated_at: '2026-07-10T19:00:00.000Z',
      },
    }));

    await expect(loadOfficialCampaignsResult()).resolves.toEqual({
      available: true,
      workspace: {
        ...workspace,
        revision: 12,
        updated_at: '2026-07-10T19:00:00.000Z',
      },
    });
  });

  it('requires the observed portfolio revision when publishing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      portfolio: { revision: 13, updated_at: null },
    }));

    await saveOfficialCampaigns(workspace, 12);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ data: workspace, revision: 12 });
  });

  it('carries the current portfolio on a stale publish and does not retry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      error: 'official_campaign_revision_conflict',
      portfolio: { data: workspace, revision: 14, updated_at: null },
    }));

    const error = await saveOfficialCampaigns(workspace, 12).catch((caught: unknown) => caught);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({
      scope: 'official',
      code: 'official_campaign_revision_conflict',
      currentWorkspace: { revision: 14 },
    });
  });
});
