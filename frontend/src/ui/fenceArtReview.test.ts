import { describe, expect, it } from 'vitest';
import { CELL_DEPTH_STRIDE, boardDrawOps } from '@chess-tactics/board-render';
import { roadEdgeKey } from '../core/featureAutotile';
import type { EditorDocumentSummary } from '../net/editorDocuments';
import type {
  AdminLiveMediaCatalog,
  AdminLiveMediaSlot,
  AdminLiveMediaVersion,
  AdminLiveMediaVersionStatus,
} from '../net/liveMediaAdmin';
import type { EditorBoard } from './boardCode';
import {
  FENCE_ART_REVIEW_LEVEL_NAME,
  fenceArtReviewEditorHref,
  findFenceArtReviewDocument,
  transformFenceArtReviewOps,
} from './fenceArtReview';
import {
  cycleFenceArtKit,
  fenceArtKit,
  fenceArtKits,
  fenceArtworkBackendReview,
  type FenceArtKit,
} from './fenceCandidateProfiles';

const sha = (value: string): string => value.padEnd(64, value).slice(0, 64);

function media(slot: string, id: string, status: AdminLiveMediaVersionStatus) {
  const digest = sha(id.replace(/[^a-f0-9]/gi, 'a').toLowerCase() || 'a');
  return {
    url: status === 'candidate' || status === 'archived'
      ? `/api/admin/media/${digest}`
      : `/api/media/${digest}`,
    sha256: digest,
    mediaType: 'image/png',
    width: 96,
    height: 180,
    byteLength: 10,
  };
}

function version({
  id,
  slot,
  status,
  metadata = {},
  updatedAt = '2026-07-11T00:00:00.000Z',
}: {
  id: string;
  slot: string | null;
  status: AdminLiveMediaVersionStatus;
  metadata?: Record<string, unknown>;
  updatedAt?: string;
}): AdminLiveMediaVersion {
  return {
    id,
    slot,
    sourcePath: null,
    domain: 'terrain',
    role: 'review',
    label: `Backend record ${id}`,
    status,
    productionEligible: status === 'accepted',
    metadata,
    provenance: {},
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 1,
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt,
    updatedBy: 'owner@example.test',
    media: media(slot ?? id, id, status),
  };
}

function slot(
  id: string,
  activeVersionId: string | null,
  status: 'accepted' | 'legacy-bridge' | null,
  metadata: Record<string, unknown> = {},
): AdminLiveMediaSlot {
  return {
    slot: id,
    domain: 'terrain',
    role: 'review',
    availabilityPolicy: 'decorative',
    lifecycleState: activeVersionId ? 'active' : 'staging',
    activeVersionId,
    rowRevision: 1,
    metadata,
    versionStatus: status,
    productionEligible: status === 'accepted',
    media: null,
  };
}

function catalog(slots: AdminLiveMediaSlot[], versions: AdminLiveMediaVersion[]): AdminLiveMediaCatalog {
  return { schemaVersion: 1, revision: 7, updatedAt: null, slots, versions };
}

function suffixKitCatalog({
  id = 'dynamic-wood',
  lifecycle = 'legacy-bridge',
  post = true,
  acceptance = false,
}: {
  id?: string;
  lifecycle?: FenceArtKit['lifecycle'];
  post?: boolean;
  acceptance?: boolean;
} = {}): AdminLiveMediaCatalog {
  const components = post ? ['rail-e', 'rail-s', 'post'] : ['rail-e', 'rail-s'];
  const versions = components.map((component) => version({
    id: `${id}-${component}-version`,
    slot: `review/fences/${id}-${component}.png`,
    status: lifecycle,
  }));
  const active = lifecycle === 'accepted' || lifecycle === 'legacy-bridge';
  const slots = versions.map((item) => slot(
    item.slot!,
    active ? item.id : null,
    active ? lifecycle : null,
    acceptance ? { acceptance: { mode: 'standalone' } } : {},
  ));
  return catalog(slots, versions);
}

function explicitCandidateCatalog(): AdminLiveMediaCatalog {
  const components = [
    ['review/fence/oak/east', 'rail-e'],
    ['review/fence/oak/south', 'rail-s'],
  ] as const;
  const versions = components.map(([semanticSlot, component], index) => version({
    id: `oak-${component}-${index}`,
    slot: semanticSlot,
    status: 'candidate',
    metadata: {
      fenceReview: {
        groupId: 'fence/oak-v3',
        batchId: 'owner-pass-3',
        kitId: 'oak-v3',
        label: 'Oak V3',
        material: 'wood',
        component,
      },
    },
  }));
  return catalog(versions.map((item) => slot(item.slot!, null, null)), versions);
}

function reviewBoard(): EditorBoard {
  return {
    cols: 4,
    rows: 4,
    cells: Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`${index % 4},${Math.floor(index / 4)}`, 'grass-surf-0'])),
    units: { '3,3': { unitId: 'king', direction: 'north', faction: 'navy-blue' } },
    doodads: {},
    props: {},
    cover: {},
    coverTypes: {},
    features: {},
    fences: {
      [roadEdgeKey(1, 1, 2, 1)]: 'stone',
      [roadEdgeKey(1, 1, 1, 2)]: 'stone',
      [roadEdgeKey(0, 3, 1, 3)]: 'wood',
    },
    fencePosts: { '0,0': 'wood' },
    walls: {},
    wallArt: {},
    featureCuts: {},
    featureExits: {},
    zoneEntries: [],
    zones: {},
  };
}

describe('fence art review', () => {
  it('opens only the exact pre-seeded private document through its durable identity', () => {
    const summary = (over: Partial<EditorDocumentSummary>): EditorDocumentSummary => ({
      document_id: 'doc-other',
      level_id: 'level-other',
      workspace_kind: 'user',
      workspace_id: 'default',
      name: 'Other level',
      revision: 1,
      saved_revision: 1,
      dirty: false,
      has_saved_baseline: true,
      never_saved: false,
      created_at: null,
      updated_at: null,
      ...over,
    });
    const document = summary({ document_id: 'doc/a b', level_id: 'level 7', name: FENCE_ART_REVIEW_LEVEL_NAME });

    expect(findFenceArtReviewDocument([summary({ name: `${FENCE_ART_REVIEW_LEVEL_NAME} ` }), document])).toBe(document);
    expect(fenceArtReviewEditorHref(document, 'oak-v3@candidate')).toBe(
      '/editor/level?document=doc%2Fa+b&levelId=level+7&from=studio&layer=fence&kind=fence&artReview=fence-native-candidates-2026-07-10&fenceArt=oak-v3%40candidate',
    );
  });

  it('derives complete review membership and bridge lifecycle from active backend versions', () => {
    const kits = fenceArtKits(suffixKitCatalog());

    expect(kits).toHaveLength(1);
    expect(kits[0]).toMatchObject({
      id: 'dynamic-wood',
      label: 'Dynamic Wood',
      material: 'wood',
      lifecycle: 'legacy-bridge',
      acceptanceRegistered: false,
      productionEligible: false,
    });
    expect(kits[0].railE).toMatch(/^\/api\/media\//);
    expect(kits[0].post).toMatch(/^\/api\/media\//);
    expect(fenceArtworkBackendReview(kits[0])).toMatchObject({
      status: 'bridge-only',
      statusLabel: 'Backend legacy bridge · bridge-only',
    });
  });

  it('uses backend metadata to group private candidates whose slots have no filename taxonomy', () => {
    const kits = fenceArtKits(explicitCandidateCatalog());

    expect(kits).toHaveLength(1);
    expect(kits[0]).toMatchObject({
      id: 'oak-v3@candidate',
      label: 'Oak V3',
      lifecycle: 'candidate',
      material: 'wood',
    });
    expect(kits[0].post).toBeUndefined();
    expect(kits[0].railE).toMatch(/^\/api\/admin\/media\//);
    expect(fenceArtworkBackendReview(kits[0]).statusLabel).toBe('Backend candidate · bridge-only');
  });

  it('derives archived and accepted lifecycle from backend records and exposes missing acceptance registration', () => {
    const archived = fenceArtKits(suffixKitCatalog({ lifecycle: 'archived' }))[0];
    expect(archived.id).toBe('dynamic-wood@archived');
    expect(fenceArtworkBackendReview(archived).status).toBe('backend-archived');

    const unsupported = fenceArtKits(suffixKitCatalog({ lifecycle: 'accepted' }))[0];
    expect(fenceArtworkBackendReview(unsupported).status).toBe('unsupported-accepted');

    const registered = fenceArtKits(suffixKitCatalog({ lifecycle: 'accepted', acceptance: true }))[0];
    expect(fenceArtworkBackendReview(registered).status).toBe('backend-accepted');
  });

  it('omits incomplete kits and stale active-version history instead of filling from Git', () => {
    const incomplete = suffixKitCatalog({ post: false });
    incomplete.versions = incomplete.versions.filter((item) => !item.slot?.includes('rail-s'));
    expect(fenceArtKits(incomplete)).toEqual([]);

    const stale = suffixKitCatalog();
    stale.versions.push(version({
      id: 'stale-wood-rail-e-version',
      slot: 'review/fences/stale-wood-rail-e.png',
      status: 'legacy-bridge',
    }));
    stale.versions.push(version({
      id: 'stale-wood-rail-s-version',
      slot: 'review/fences/stale-wood-rail-s.png',
      status: 'legacy-bridge',
    }));
    stale.slots.push(slot('review/fences/stale-wood-rail-e.png', 'another-version', 'legacy-bridge'));
    stale.slots.push(slot('review/fences/stale-wood-rail-s.png', 'another-version', 'legacy-bridge'));
    expect(fenceArtKits(stale).map((kit) => kit.id)).toEqual(['dynamic-wood']);
  });

  it('cycles only the backend-projected set passed by the consumer', () => {
    const first = fenceArtKits(suffixKitCatalog({ id: 'oak-wood' }))[0];
    const second = fenceArtKits(suffixKitCatalog({ id: 'granite-stone' }))[0];
    const kits = [first, second];

    expect(fenceArtKit(kits, 'oak-wood')).toBe(first);
    expect(cycleFenceArtKit(kits, 'oak-wood', 1)).toBe(second);
    expect(cycleFenceArtKit(kits, 'oak-wood', -1)).toBe(second);
    expect(cycleFenceArtKit([], 'oak-wood', 1)).toBeUndefined();
  });

  it('restyles every rail/post with backend URLs while retaining the shared scene', () => {
    const board = reviewBoard();
    const canonical = boardDrawOps(board);
    const kit = fenceArtKits(suffixKitCatalog())[0];
    const transformed = transformFenceArtReviewOps(canonical, board, kit);
    const sources = transformed.map((op) => op.src);
    const retainedSceneOp = canonical.find((op) => !op.src.startsWith('/assets/tiles/feature/fence-'))!;

    expect(sources.some((source) => source.startsWith('/assets/tiles/feature/fence-'))).toBe(false);
    expect(sources.filter((source) => source === kit.railE)).toHaveLength(2);
    expect(sources).toContain(kit.railS);
    expect(sources).toContain(kit.post!);
    expect(transformed).toContain(retainedSceneOp);
  });

  it('draws backend-member posts in front of both endpoints of E and S rails', () => {
    const kit = fenceArtKits(suffixKitCatalog())[0];
    for (const [edge, railSrc] of [
      [roadEdgeKey(1, 1, 2, 1), kit.railE],
      [roadEdgeKey(1, 1, 1, 2), kit.railS],
    ] as const) {
      const board = { ...reviewBoard(), fences: { [edge]: 'wood' as const }, fencePosts: {} };
      const transformed = transformFenceArtReviewOps(boardDrawOps(board), board, kit);
      const rail = transformed.find((op) => op.src === railSrc)!;
      const posts = transformed.filter((op) => op.src === kit.post).sort((a, b) => a.z - b.z);
      const ordered = [...transformed].sort((a, b) => a.z - b.z);

      expect(posts.map((post) => post.z)).toEqual([
        rail.z + 0.5,
        rail.z + CELL_DEPTH_STRIDE + 0.5,
      ]);
      expect(ordered.indexOf(rail)).toBeLessThan(ordered.indexOf(posts[0]));
      expect(ordered.indexOf(rail)).toBeLessThan(ordered.indexOf(posts[1]));
    }
  });

  it('renders an explicitly backend-membered rail-only candidate without inventing a post', () => {
    const kit = fenceArtKits(explicitCandidateCatalog())[0];
    const transformed = transformFenceArtReviewOps(boardDrawOps(reviewBoard()), reviewBoard(), kit);

    expect(kit.post).toBeUndefined();
    expect(transformed.filter((op) => op.src === kit.railE)).toHaveLength(2);
    expect(transformed.filter((op) => op.src === kit.railS)).toHaveLength(1);
    expect(transformed.some((op) => op.src.includes('post'))).toBe(false);
  });
});
