import { describe, expect, it } from 'vitest';
import { boardDrawOps } from '@chess-tactics/board-render';
import { roadEdgeKey } from '../core/featureAutotile';
import type { EditorDocumentSummary } from '../net/editorDocuments';
import type { EditorBoard } from './boardCode';
import {
  FENCE_ART_REVIEW_LEVEL_NAME,
  fenceArtReviewEditorHref,
  findFenceArtReviewDocument,
  transformFenceArtReviewOps,
} from './fenceArtReview';
import {
  FENCE_ARCHIVED_ART_KITS,
  FENCE_ART_KITS,
  FENCE_ART_KIT_REGISTRY,
  cycleFenceArtKit,
  fenceArtKit,
} from './fenceCandidateProfiles';

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
    const document = summary({
      document_id: 'doc/a b',
      level_id: 'level 7',
      name: FENCE_ART_REVIEW_LEVEL_NAME,
    });

    expect(findFenceArtReviewDocument([
      summary({ name: `${FENCE_ART_REVIEW_LEVEL_NAME} ` }),
      document,
    ])).toBe(document);
    expect(fenceArtReviewEditorHref(document, 'pixellab-stone-rail-r2')).toBe(
      '/editor/level?document=doc%2Fa+b&levelId=level+7&from=studio&layer=fence&kind=fence&artReview=fence-native-candidates-2026-07-10&fenceArt=pixellab-stone-rail-r2',
    );
  });

  it('cycles only the four cleaned realignment candidates', () => {
    expect(FENCE_ART_KITS.map((kit) => kit.id)).toEqual([
      'pixellab-stone-rail-r2',
      'pixellab-wood-canonical-r2',
      'codex-wood-canonical-r2',
      'codex-stone-canonical-r2',
    ]);
    expect(cycleFenceArtKit('pixellab-stone-rail-r2', -1).id).toBe('codex-stone-canonical-r2');
    expect(cycleFenceArtKit('codex-stone-canonical-r2', 1).id).toBe('pixellab-stone-rail-r2');
  });

  it('keeps the original five ids resolvable as archived evidence but out of cycling', () => {
    const archivedIds = ['blender-stone', 'pixellab-wood', 'pixellab-stone', 'codex-wood', 'codex-stone'];

    expect(FENCE_ARCHIVED_ART_KITS.map((kit) => kit.id)).toEqual(archivedIds);
    expect(FENCE_ART_KIT_REGISTRY).toHaveLength(FENCE_ART_KITS.length + archivedIds.length);
    for (const id of archivedIds) {
      expect(FENCE_ART_KITS.some((kit) => kit.id === id)).toBe(false);
      expect(fenceArtKit(id)?.category).toBe('archived');
    }
    expect(cycleFenceArtKit('blender-stone', 1).id).toBe('pixellab-stone-rail-r2');
    expect(cycleFenceArtKit('blender-stone', -1).id).toBe('codex-stone-canonical-r2');
  });

  it('does not expose the procedural runtime kits through the review catalog or registry', () => {
    expect(fenceArtKit('live-wood')).toBeUndefined();
    expect(fenceArtKit('live-stone')).toBeUndefined();
    expect(FENCE_ART_KIT_REGISTRY.map((kit) => kit.id)).not.toContain('live-wood');
    expect(FENCE_ART_KIT_REGISTRY.map((kit) => kit.id)).not.toContain('live-stone');
  });

  it('keeps the accepted PixelLab stone rail frozen and intentionally postless', () => {
    const stone = fenceArtKit('pixellab-stone-rail-r2')!;

    expect(stone.railE).toBe('/assets/tiles/feature/candidates/2026-07-10/pixellab-stone-rail-e.png');
    expect(stone.railS).toBe('/assets/tiles/feature/candidates/2026-07-10/pixellab-stone-rail-s.png');
    expect(stone.post).toBeUndefined();
    expect(stone.statusLabel).toBe('Accepted · rail only');
    expect(fenceArtKit('pixellab-stone-pale-r2')).toBeUndefined();
    expect(fenceArtKit('pixellab-stone-compact-r2')).toBeUndefined();
    expect(fenceArtKit('pixellab-wood-canonical-r2')?.post).toBe(
      '/assets/tiles/feature/candidates/2026-07-10/pixellab-wood-post.png',
    );
    expect(fenceArtKit('codex-stone-canonical-r2')?.note).toContain('LANCZOS');
  });

  it('restyles every rail/post with a retained-post kit while retaining the shared scene', () => {
    const board = reviewBoard();
    const canonical = boardDrawOps(board);
    const kit = fenceArtKit('pixellab-wood-canonical-r2')!;
    const transformed = transformFenceArtReviewOps(canonical, board, kit);
    const sources = transformed.map((op) => op.src);
    const retainedSceneOp = canonical.find((op) => !op.src.startsWith('/assets/tiles/feature/fence-'))!;

    expect(sources.some((src) => src.startsWith('/assets/tiles/feature/fence-'))).toBe(false);
    expect(sources.filter((src) => src === kit.railE)).toHaveLength(2);
    expect(sources).toContain(kit.railS);
    expect(sources).toContain(kit.post!);
    expect(transformed).toContain(retainedSceneOp);
  });

  it('draws every retained candidate post in front of both endpoints of E and S rails', () => {
    for (const kit of FENCE_ART_KITS.filter((entry) => entry.post)) {
      for (const [edge, railSrc] of [
        [roadEdgeKey(1, 1, 2, 1), kit.railE],
        [roadEdgeKey(1, 1, 1, 2), kit.railS],
      ] as const) {
        const board = {
          ...reviewBoard(),
          fences: { [edge]: 'wood' as const },
          fencePosts: {},
        };
        const transformed = transformFenceArtReviewOps(boardDrawOps(board), board, kit);
        const rail = transformed.find((op) => op.src === railSrc)!;
        const posts = transformed.filter((op) => op.src === kit.post).sort((a, b) => a.z - b.z);
        const ordered = [...transformed].sort((a, b) => a.z - b.z);

        expect(posts.map((post) => post.z)).toEqual([rail.z + 0.5, rail.z + 1.5]);
        expect(ordered.indexOf(rail)).toBeLessThan(ordered.indexOf(posts[0]));
        expect(ordered.indexOf(rail)).toBeLessThan(ordered.indexOf(posts[1]));
      }
    }
  });

  it('draws the accepted PixelLab stone kit as rails only', () => {
    const board = reviewBoard();
    const kit = fenceArtKit('pixellab-stone-rail-r2')!;
    const transformed = transformFenceArtReviewOps(boardDrawOps(board), board, kit);

    expect(transformed.filter((op) => op.src === kit.railE)).toHaveLength(2);
    expect(transformed.filter((op) => op.src === kit.railS)).toHaveLength(1);
    expect(transformed.some((op) => op.src.endsWith('-post.png'))).toBe(false);
  });

});
