export interface PlayRouteScreenNameInput {
  path?: string | null;
  search?: string | URLSearchParams | null;
  campaignId?: string | null;
  levelId?: string | null;
  mapId?: string | null;
  mode?: string | null;
}

const OFFICIAL_LEVEL_ID_RE = /^off-l-/;

function param(search: PlayRouteScreenNameInput['search'], key: string): string | null {
  if (!search) return null;
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search).replace(/^\?/, ''));
  return params.get(key);
}

function firstValue(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

export function playRouteScreenName(input: PlayRouteScreenNameInput = {}): string {
  const path = input.path || '/play';
  if (path !== '/play') return 'Skirmish';

  const search = input.search ?? null;
  const campaignId = firstValue(input.campaignId, param(search, 'campaignId'));
  const levelId = firstValue(input.levelId, param(search, 'levelId'));
  const mapId = firstValue(input.mapId, param(search, 'map'));
  const mode = firstValue(input.mode, param(search, 'mode'));

  if (mapId) return 'Community Map';
  if (campaignId && levelId && mode !== 'test') return 'Campaign';
  if (levelId && OFFICIAL_LEVEL_ID_RE.test(levelId) && mode !== 'skirmish' && mode !== 'test') return 'Official Level';
  return 'Skirmish';
}
