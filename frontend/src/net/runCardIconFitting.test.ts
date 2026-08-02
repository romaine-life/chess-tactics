import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RUN_CARD_ICON_FITTING_PORTFOLIO_ID,
  fetchRunCardIconFittingPortfolio,
  saveRunCardIconFittingPortfolio,
} from './runCardIconFitting';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Run card icon fitting draft client', () => {
  it('loads and saves the non-publishing design portfolio through the shared JSON boundary', async () => {
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ): Promise<Response> => new Response(JSON.stringify({
      portfolio: {
        id: RUN_CARD_ICON_FITTING_PORTFOLIO_ID,
        data: { kind: 'run-card-icon-fitting-draft' },
        revision: fetchMock.mock.calls.length,
        updated_at: null,
        updated_by: null,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRunCardIconFittingPortfolio()).resolves.toMatchObject({ revision: 1 });
    await expect(saveRunCardIconFittingPortfolio({
      kind: 'run-card-icon-fitting-draft',
      selections: {},
    })).resolves.toMatchObject({ revision: 2 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/design-portfolios/${RUN_CARD_ICON_FITTING_PORTFOLIO_ID}`);
    const saveInit = fetchMock.mock.calls[1]?.[1];
    expect(saveInit).toMatchObject({ method: 'PUT', credentials: 'include' });
    expect(JSON.parse(String(saveInit?.body))).toMatchObject({
      client_schema_version: 1,
      metadata: { source: 'run-card-icon-fitting-studio' },
      data: { kind: 'run-card-icon-fitting-draft' },
    });
  });
});
