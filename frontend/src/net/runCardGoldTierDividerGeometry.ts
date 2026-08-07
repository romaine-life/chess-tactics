import { requestJson } from './http';

export interface RunCardGoldTierDividerGeometry {
  coin: {
    size: number;
    x: number;
    y: number;
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
