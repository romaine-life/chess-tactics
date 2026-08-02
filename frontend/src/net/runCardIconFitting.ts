import { requestJson } from './http';

export const RUN_CARD_ICON_FITTING_PORTFOLIO_ID = 'run-card-icon-fitting-v1';

export interface RunCardIconFittingPortfolio {
  id: string;
  data: Record<string, unknown>;
  revision: number;
  updated_at: string | null;
  updated_by: string | null;
}

type PortfolioEnvelope = Readonly<{
  portfolio: RunCardIconFittingPortfolio;
}>;

export async function fetchRunCardIconFittingPortfolio(): Promise<RunCardIconFittingPortfolio> {
  const result = await requestJson<PortfolioEnvelope>(
    'GET',
    `/api/design-portfolios/${RUN_CARD_ICON_FITTING_PORTFOLIO_ID}`,
  );
  return result.portfolio;
}

export async function saveRunCardIconFittingPortfolio(
  data: Record<string, unknown>,
): Promise<RunCardIconFittingPortfolio> {
  const result = await requestJson<PortfolioEnvelope>(
    'PUT',
    `/api/design-portfolios/${RUN_CARD_ICON_FITTING_PORTFOLIO_ID}`,
    {
      client_schema_version: 1,
      metadata: {
        route: '/studio?mode=viewer&cat=cardicons&vk=cardicons',
        source: 'run-card-icon-fitting-studio',
      },
      data,
    },
  );
  return result.portfolio;
}
