import { describe, expect, it } from 'vitest';
import { installLevelThumbnailUrls, levelThumbnailUrl } from './levelThumbnails';

describe('level thumbnail delivery projection', () => {
  it('accepts public media and owner-scoped immutable derivative identities', () => {
    const sha = 'b'.repeat(64);
    installLevelThumbnailUrls({
      l901: `/api/media/${sha}`,
      'skirmish-profile-default': `/api/campaign-workspace/level-thumbnails/skirmish-profile-default/${sha}.png`,
      l902: '/assets/level-list-thumb/l902.png',
      l903: 'https://example.invalid/thumb.png',
      l904: `/api/campaign-workspace/level-thumbnails/../${sha}.png`,
      l905: `/api/campaign-workspace/level-thumbnails/id%2Fescape/${sha}.png`,
    });
    expect(levelThumbnailUrl('l901')).toBe(`/api/media/${sha}`);
    expect(levelThumbnailUrl('skirmish-profile-default')).toBe(
      `/api/campaign-workspace/level-thumbnails/skirmish-profile-default/${sha}.png`,
    );
    expect(levelThumbnailUrl('l902')).toBeNull();
    expect(levelThumbnailUrl('l903')).toBeNull();
    expect(levelThumbnailUrl('l904')).toBeNull();
    expect(levelThumbnailUrl('l905')).toBeNull();
  });
});

