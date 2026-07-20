import { describe, expect, it } from 'vitest';
import { installLevelThumbnailUrls, levelThumbnailUrl } from './levelThumbnails';

describe('level thumbnail delivery projection', () => {
  it('accepts only immutable same-origin media identities', () => {
    const sha = 'b'.repeat(64);
    installLevelThumbnailUrls({
      l901: `/api/media/${sha}`,
      l902: '/assets/level-list-thumb/l902.png',
      l903: 'https://example.invalid/thumb.png',
    });
    expect(levelThumbnailUrl('l901')).toBe(`/api/media/${sha}`);
    expect(levelThumbnailUrl('l902')).toBeNull();
    expect(levelThumbnailUrl('l903')).toBeNull();
  });
});

