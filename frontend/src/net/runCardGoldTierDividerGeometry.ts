import { requestJson } from './http';

export interface RunCardGoldTierDividerGeometry {
  coin: {
    size: number;
    x: number;
    y: number;
  };
  /** The struck mark's share of the drawn coin, in whole percent (ADR-0530). */
  mark: {
    fill: number;
  };
}

export function saveRunCardGoldTierDividerGeometry(
  geometry: RunCardGoldTierDividerGeometry,
): Promise<RunCardGoldTierDividerGeometry> {
  return requestJson<RunCardGoldTierDividerGeometry>(
    'PUT',
    '/api/studio/run-card-gold-tier-divider/defaults',
    geometry,
  );
}
