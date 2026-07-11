import { describe, expect, it } from 'vitest';
import {
  editorDocumentWorkspaceForLevelId,
  levelEditorHrefForDocument,
  shouldRestoreLocalEditorRecovery,
} from './levelEditorPersistence';

describe('editor document workspace selection', () => {
  it('selects the canonical official workspace for off-prefixed levels', () => {
    expect(editorDocumentWorkspaceForLevelId('off-l-fortress-gate')).toEqual({
      workspace_kind: 'official',
      workspace_id: 'default',
    });
  });

  it('uses the implicit user workspace for every other level id', () => {
    expect(editorDocumentWorkspaceForLevelId('l12')).toBeUndefined();
    expect(editorDocumentWorkspaceForLevelId('demo-level')).toBeUndefined();
  });
});

describe('local editor recovery freshness', () => {
  const documentUpdatedAt = '2026-07-10T18:00:00.000Z';
  const documentUpdatedAtMs = Date.parse(documentUpdatedAt);

  it('does not treat identical content as a divergent recovery', () => {
    expect(shouldRestoreLocalEditorRecovery({
      localSignature: 'same-board',
      documentSignature: 'same-board',
      localSavedAt: documentUpdatedAtMs + 60_000,
      documentUpdatedAt,
    })).toBe(false);
  });

  it('restores differing local content only when it is strictly newer', () => {
    expect(shouldRestoreLocalEditorRecovery({
      localSignature: 'local-board',
      documentSignature: 'cloud-board',
      localSavedAt: documentUpdatedAtMs + 1,
      documentUpdatedAt,
    })).toBe(true);

    expect(shouldRestoreLocalEditorRecovery({
      localSignature: 'local-board',
      documentSignature: 'cloud-board',
      localSavedAt: documentUpdatedAtMs,
      documentUpdatedAt,
    })).toBe(false);

    expect(shouldRestoreLocalEditorRecovery({
      localSignature: 'local-board',
      documentSignature: 'cloud-board',
      localSavedAt: documentUpdatedAtMs - 1,
      documentUpdatedAt,
    })).toBe(false);
  });

  it('uses the observed CAS revision instead of comparing device and server clocks', () => {
    expect(shouldRestoreLocalEditorRecovery({
      localSignature: 'local-board',
      documentSignature: 'cloud-board',
      localSavedAt: 1,
      documentUpdatedAt: '2099-01-01T00:00:00.000Z',
      localDocumentRevision: 7,
      documentRevision: 7,
      localCloudSignature: 'cloud-board',
    })).toBe(true);

    expect(shouldRestoreLocalEditorRecovery({
      localSignature: 'local-board',
      documentSignature: 'newer-cloud-board',
      localSavedAt: Date.now() + 100_000,
      documentUpdatedAt: documentUpdatedAt,
      localDocumentRevision: 7,
      documentRevision: 8,
      localCloudSignature: 'cloud-board',
    })).toBe(false);

    expect(shouldRestoreLocalEditorRecovery({
      localSignature: 'local-board',
      documentSignature: 'cloud-board',
      localSavedAt: Date.now(),
      documentUpdatedAt,
      localDocumentRevision: 7,
      documentRevision: 7,
      localCloudSignature: 'cloud-board',
      localRecoveryConflict: true,
    })).toBe(false);
  });

  it('uses the timestamp fallback for a pre-revision browser entry', () => {
    expect(shouldRestoreLocalEditorRecovery({
      localSignature: 'legacy-local-board',
      documentSignature: 'cloud-board',
      localSavedAt: documentUpdatedAtMs + 1,
      documentUpdatedAt,
      documentRevision: 9,
    })).toBe(true);

    expect(shouldRestoreLocalEditorRecovery({
      localSignature: 'legacy-local-board',
      documentSignature: 'cloud-board',
      localSavedAt: documentUpdatedAtMs + 1,
      documentUpdatedAt,
      localCloudSignature: 'unpaired-cloud-signature',
      documentRevision: 9,
    })).toBe(false);
  });

  it('does not prefer browser recovery when either timestamp is invalid', () => {
    expect(shouldRestoreLocalEditorRecovery({
      localSignature: 'local-board',
      documentSignature: 'cloud-board',
      localSavedAt: Number.NaN,
      documentUpdatedAt,
    })).toBe(false);

    expect(shouldRestoreLocalEditorRecovery({
      localSignature: 'local-board',
      documentSignature: 'cloud-board',
      localSavedAt: documentUpdatedAtMs + 1,
      documentUpdatedAt: 'not-a-date',
    })).toBe(false);
  });

  it('requires both content signatures before making a freshness comparison', () => {
    expect(shouldRestoreLocalEditorRecovery({
      localSignature: undefined,
      documentSignature: 'cloud-board',
      localSavedAt: documentUpdatedAtMs + 1,
      documentUpdatedAt,
    })).toBe(false);

    expect(shouldRestoreLocalEditorRecovery({
      localSignature: 'local-board',
      documentSignature: undefined,
      localSavedAt: documentUpdatedAtMs + 1,
      documentUpdatedAt,
    })).toBe(false);
  });
});

describe('durable document editor href', () => {
  it('sets both identities and consumes one-shot recovery snapshot parameters', () => {
    const href = levelEditorHrefForDocument(
      '/editor/level?map=retired&campaignId=c7&returnTo=%2Fcampaigns&layer=rules&board=recovery&obj=survive#panel',
      { levelId: 'l42', documentId: 'doc-42' },
    );

    const url = new URL(href, 'https://chess-tactics.local');
    expect(url.pathname).toBe('/editor/level');
    expect(url.searchParams.get('levelId')).toBe('l42');
    expect(url.searchParams.get('document')).toBe('doc-42');
    expect(url.searchParams.has('map')).toBe(false);
    expect(url.searchParams.get('campaignId')).toBe('c7');
    expect(url.searchParams.get('returnTo')).toBe('/campaigns');
    expect(url.searchParams.get('layer')).toBe('rules');
    expect(url.searchParams.has('board')).toBe(false);
    expect(url.searchParams.has('obj')).toBe(false);
    expect(url.hash).toBe('#panel');
  });

  it('can retain a recovery snapshot only while its cloud write is pending', () => {
    const href = levelEditorHrefForDocument(
      '/editor/level?board=recovery&obj=survive&time=300&inc=2&events=e&victory=v&docRev=7&layer=status',
      { levelId: 'l42', documentId: 'doc-42' },
      { keepRecoverySnapshot: true },
    );
    const url = new URL(href, 'https://chess-tactics.local');
    expect(url.searchParams.get('board')).toBe('recovery');
    expect(url.searchParams.get('obj')).toBe('survive');
    expect(url.searchParams.get('time')).toBe('300');
    expect(url.searchParams.get('inc')).toBe('2');
    expect(url.searchParams.get('events')).toBe('e');
    expect(url.searchParams.get('victory')).toBe('v');
    expect(url.searchParams.get('docRev')).toBe('7');
    expect(url.searchParams.get('layer')).toBe('status');
  });

  it('replaces an old level id without dropping unrelated query state', () => {
    expect(levelEditorHrefForDocument(
      'https://example.test/editor/level?levelId=temporary&document=old-doc&kind=unit&brush=rook',
      { levelId: 'off-l-new-level', documentId: 'new-doc' },
    )).toBe('/editor/level?levelId=off-l-new-level&document=new-doc&kind=unit&brush=rook');
  });
});
