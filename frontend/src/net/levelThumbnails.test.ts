import { describe, expect, it, vi } from 'vitest';
import {
  installLevelThumbnailUrl,
  installLevelThumbnailUrls,
  levelThumbnailUrl,
  subscribeLevelThumbnailUrls,
} from './levelThumbnails';

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

  it('re-addresses a level a write just rebaked and tells mounted rows', () => {
    const before = `/api/media/${'c'.repeat(64)}`;
    const after = `/api/media/${'d'.repeat(64)}`;
    installLevelThumbnailUrls({ l910: before });
    const listener = vi.fn();
    const unsubscribe = subscribeLevelThumbnailUrls(listener);

    // A Save that changed nothing re-answers with the same address: no listener churn.
    installLevelThumbnailUrl('l910', before);
    expect(listener).not.toHaveBeenCalled();

    installLevelThumbnailUrl('l910', after);
    expect(levelThumbnailUrl('l910')).toBe(after);
    expect(listener).toHaveBeenCalledTimes(1);

    // A write that could not prepare one retires the address rather than leaving the row
    // rendering content the level no longer has.
    installLevelThumbnailUrl('l910', null);
    expect(levelThumbnailUrl('l910')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    installLevelThumbnailUrl('l910', after);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('announces a batch install once, and not at all when every address already stood', () => {
    const sha = `/api/media/${'e'.repeat(64)}`;
    const other = `/api/media/${'f'.repeat(64)}`;
    installLevelThumbnailUrls({ l920: sha, l921: other });
    const listener = vi.fn();
    const unsubscribe = subscribeLevelThumbnailUrls(listener);
    installLevelThumbnailUrls({ l920: sha, l921: other });
    expect(listener).not.toHaveBeenCalled();
    installLevelThumbnailUrls({ l920: other, l921: sha });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

