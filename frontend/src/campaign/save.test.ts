import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishOfficialWorkspace, saveUserWorkspace } from './save';
import { useCampaigns } from './store';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  useCampaigns.setState({
    campaigns: [],
    levels: {},
    selectedCampaignId: null,
    selectedLevelId: null,
    counter: 1,
    userWorkspaceRevision: 4,
    officialWorkspaceRevision: 11,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tiered workspace save revisions', () => {
  it('advances the user revision only after an acknowledged save', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, revision: 5, updated_at: null }));

    await saveUserWorkspace();

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).revision).toBe(4);
    expect(useCampaigns.getState().userWorkspaceRevision).toBe(5);
    expect(useCampaigns.getState().officialWorkspaceRevision).toBe(11);
  });

  it('advances the official revision independently after publish', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ portfolio: { revision: 12, updated_at: null } }));

    await publishOfficialWorkspace();

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).revision).toBe(11);
    expect(useCampaigns.getState().officialWorkspaceRevision).toBe(12);
    expect(useCampaigns.getState().userWorkspaceRevision).toBe(4);
  });
});
