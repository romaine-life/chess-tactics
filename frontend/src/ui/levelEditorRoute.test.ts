import { describe, expect, it } from 'vitest';
import {
  isLevelEditorLayerKey,
  levelEditorHrefWithRouteState,
  levelEditorRouteBrushKind,
  isLevelEditorRoutePath,
  readLevelEditorRouteState,
} from './levelEditorRoute';

describe('level editor route helpers', () => {
  it('reads an explicit layer from the query string', () => {
    expect(readLevelEditorRouteState('?board=abc&layer=rules')).toMatchObject({
      layer: 'rules',
    });
  });

  it('round-trips the dedicated Level Artwork workspace without a brush kind', () => {
    const href = levelEditorHrefWithRouteState('/editor/level?levelId=l1&document=doc-1&kind=cover', {
      layer: 'level-artwork',
      brushKind: levelEditorRouteBrushKind('level-artwork', 'cover'),
      brush: null,
      levelArtworkWorkspace: 'pipeline',
    });
    expect(href).toBe('/editor/level?levelId=l1&document=doc-1&layer=level-artwork&levelArtworkEditor=pipeline');
    expect(readLevelEditorRouteState(new URL(href, 'https://example.test').search)).toMatchObject({
      layer: 'level-artwork',
      levelArtworkWorkspace: 'pipeline',
    });
  });

  it('keeps Level Artwork separate from Placed Art and validates its two center workspaces', () => {
    expect(readLevelEditorRouteState('?layer=level-artwork').levelArtworkWorkspace).toBeUndefined();
    expect(readLevelEditorRouteState('?layer=level-artwork&levelArtworkEditor=source').levelArtworkWorkspace).toBe('source');
    expect(readLevelEditorRouteState('?layer=level-artwork&levelArtworkEditor=pipeline').levelArtworkWorkspace).toBe('pipeline');
    expect(readLevelEditorRouteState('?layer=level-artwork&levelArtworkEditor=unknown').levelArtworkWorkspace).toBeUndefined();
    expect(readLevelEditorRouteState('?layer=placed-art&levelArtworkEditor=source').levelArtworkWorkspace).toBeUndefined();
    expect(levelEditorHrefWithRouteState('/editor/level?layer=level-artwork&levelArtworkEditor=source', {
      layer: 'level-artwork',
      levelArtworkWorkspace: null,
    })).toBe('/editor/level?layer=level-artwork');
    expect(levelEditorHrefWithRouteState('/editor/level?layer=level-artwork&levelArtworkEditor=source', {
      layer: 'board',
    })).toBe('/editor/level?layer=board');
  });

  it('reads old artwork URLs without preserving their collided route vocabulary', () => {
    expect(readLevelEditorRouteState('?layer=artwork&artworkEditor=source&kind=artwork&brush=oak')).toMatchObject({
      layer: 'level-artwork',
      brushKind: undefined,
      brush: undefined,
      levelArtworkWorkspace: 'source',
    });
    expect(readLevelEditorRouteState('?layer=artwork&artworkEditor=pipeline')).toMatchObject({
      layer: 'level-artwork',
      brushKind: undefined,
      levelArtworkWorkspace: 'pipeline',
    });
    expect(readLevelEditorRouteState('?layer=artwork')).toMatchObject({
      layer: 'placed-art',
      brushKind: 'artwork',
      levelArtworkWorkspace: undefined,
    });
    expect(readLevelEditorRouteState('?layer=artwork&artworkEditor=unknown&kind=prop')).toMatchObject({
      layer: 'placed-art',
      brushKind: 'artwork',
      levelArtworkWorkspace: undefined,
    });
  });

  it('reads old Doodad and Prop layer URLs as their matching Placed Art modes', () => {
    expect(readLevelEditorRouteState('?layer=doodad&kind=prop')).toMatchObject({
      layer: 'placed-art',
      brushKind: 'doodad',
    });
    expect(readLevelEditorRouteState('?layer=prop&kind=doodad')).toMatchObject({
      layer: 'placed-art',
      brushKind: 'prop',
    });
  });

  it('keeps legacy layer names out of the canonical layer vocabulary', () => {
    expect(isLevelEditorLayerKey('level-artwork')).toBe(true);
    expect(isLevelEditorLayerKey('placed-art')).toBe(true);
    expect(isLevelEditorLayerKey('artwork')).toBe(false);
    expect(isLevelEditorLayerKey('doodad')).toBe(false);
    expect(isLevelEditorLayerKey('prop')).toBe(false);
  });

  it('routes Scene Art, Doodads, and Props through one Placed Art layer', () => {
    for (const kind of ['artwork', 'doodad', 'prop'] as const) {
      expect(readLevelEditorRouteState(`?kind=${kind}`)).toMatchObject({
        layer: 'placed-art',
        brushKind: kind,
      });
      expect(levelEditorRouteBrushKind('placed-art', kind)).toBe(kind);
    }
    expect(levelEditorRouteBrushKind('placed-art', 'tile')).toBe('artwork');
  });

  it('infers the editor layer from a brush kind when layer is absent', () => {
    expect(readLevelEditorRouteState('?from=studio&kind=unit&brush=rook')).toEqual({
      layer: 'unit',
      brushKind: 'unit',
      brush: 'rook',
      eventsEditor: false,
      eventsTab: undefined,
      levelArtworkWorkspace: undefined,
    });
    expect(readLevelEditorRouteState('?kind=river')).toMatchObject({
      layer: 'paths',
      brushKind: 'river',
    });
    expect(readLevelEditorRouteState('?kind=wall')).toMatchObject({
      layer: 'wall',
      brushKind: 'wall',
    });
    expect(readLevelEditorRouteState('?kind=wallart')).toMatchObject({
      layer: 'wallart',
      brushKind: 'wallart',
    });
  });

  it('preserves board identity while replacing stale editor route params', () => {
    expect(levelEditorHrefWithRouteState('/editor/level?board=abc&kind=unit&brush=rook#cell', {
      layer: 'rules',
      brushKind: null,
      brush: null,
    })).toBe('/editor/level?board=abc&layer=rules#cell');
  });

  it('writes only the canonical Level Artwork route vocabulary', () => {
    expect(levelEditorHrefWithRouteState(
      '/editor/level?document=doc-1&layer=artwork&artworkEditor=source&kind=artwork&brush=oak',
      {
        layer: 'level-artwork',
        levelArtworkWorkspace: 'pipeline',
      },
    )).toBe('/editor/level?document=doc-1&layer=level-artwork&levelArtworkEditor=pipeline');
  });

  it('writes only the canonical Placed Art route vocabulary', () => {
    expect(levelEditorHrefWithRouteState(
      '/editor/level?document=doc-1&layer=doodad&artworkEditor=pipeline&levelArtworkEditor=source',
      {
        layer: 'placed-art',
        brushKind: 'doodad',
        brush: 'grass-tuft',
      },
    )).toBe('/editor/level?document=doc-1&layer=placed-art&kind=doodad&brush=grass-tuft');
  });

  it('serializes the paths submode as a brush kind', () => {
    expect(levelEditorRouteBrushKind('paths', 'river')).toBe('river');
    expect(levelEditorHrefWithRouteState('/editor/level?board=abc', {
      layer: 'paths',
      brushKind: levelEditorRouteBrushKind('paths', 'river'),
      brush: null,
    })).toBe('/editor/level?board=abc&layer=paths&kind=river');
  });

  it('serializes the wall layer as its own brush kind', () => {
    expect(levelEditorRouteBrushKind('wall', undefined)).toBe('wall');
    expect(levelEditorHrefWithRouteState('/editor/level?board=abc', {
      layer: 'wall',
      brushKind: levelEditorRouteBrushKind('wall', undefined),
      brush: null,
    })).toBe('/editor/level?board=abc&layer=wall&kind=wall');
  });

  it('serializes the wall art layer as its own brush kind', () => {
    expect(levelEditorRouteBrushKind('wallart', undefined)).toBe('wallart');
    expect(levelEditorHrefWithRouteState('/editor/level?board=abc', {
      layer: 'wallart',
      brushKind: levelEditorRouteBrushKind('wallart', undefined),
      brush: null,
    })).toBe('/editor/level?board=abc&layer=wallart&kind=wallart');
  });

  it('round-trips the selected wall-art stamp in a copyable editor URL', () => {
    const href = levelEditorHrefWithRouteState('/editor/level?levelId=l18&document=doc-18', {
      layer: 'wallart',
      brushKind: 'wallart',
      brush: 'test-art-mirror-grand-gallery',
    });

    expect(href).toBe('/editor/level?levelId=l18&document=doc-18&layer=wallart&kind=wallart&brush=test-art-mirror-grand-gallery');
    expect(readLevelEditorRouteState(new URL(href, 'https://example.test').search)).toEqual({
      layer: 'wallart',
      brushKind: 'wallart',
      brush: 'test-art-mirror-grand-gallery',
      eventsEditor: false,
      eventsTab: undefined,
      levelArtworkWorkspace: undefined,
    });
  });

  it('round-trips the addressable Events workspace and its non-default tab', () => {
    const victoryHref = levelEditorHrefWithRouteState('/editor/level?document=doc-18&layer=rules', {
      layer: 'rules',
      eventsEditor: true,
      eventsTab: 'victory',
    });
    expect(victoryHref).toBe('/editor/level?document=doc-18&layer=rules&eventsEditor=1');
    expect(readLevelEditorRouteState(new URL(victoryHref, 'https://example.test').search)).toMatchObject({
      layer: 'rules',
      eventsEditor: true,
      eventsTab: undefined,
    });

    const otherHref = levelEditorHrefWithRouteState(victoryHref, {
      layer: 'rules',
      eventsEditor: true,
      eventsTab: 'other',
    });
    expect(otherHref).toBe('/editor/level?document=doc-18&layer=rules&eventsEditor=1&eventsTab=other');
    expect(readLevelEditorRouteState(new URL(otherHref, 'https://example.test').search)).toMatchObject({
      layer: 'rules',
      eventsEditor: true,
      eventsTab: 'other',
    });

    const deploymentHref = levelEditorHrefWithRouteState(otherHref, {
      layer: 'rules',
      eventsEditor: true,
      eventsTab: 'deployment',
    });
    expect(deploymentHref).toBe('/editor/level?document=doc-18&layer=rules&eventsEditor=1&eventsTab=deployment');
    expect(readLevelEditorRouteState(new URL(deploymentHref, 'https://example.test').search)).toMatchObject({
      layer: 'rules',
      eventsEditor: true,
      eventsTab: 'deployment',
    });
  });

  it('forces Events onto Rules and strips it when another layer is serialized', () => {
    expect(readLevelEditorRouteState('?layer=status&eventsEditor=1&eventsTab=other')).toMatchObject({
      layer: 'rules',
      eventsEditor: true,
      eventsTab: 'other',
    });
    expect(readLevelEditorRouteState('?layer=rules&eventsEditor=no&eventsTab=other')).toMatchObject({
      layer: 'rules',
      eventsEditor: false,
      eventsTab: undefined,
    });
    expect(levelEditorHrefWithRouteState('/editor/level?layer=rules&eventsEditor=1&eventsTab=other', {
      layer: 'status',
    })).toBe('/editor/level?layer=status');
  });

  it('round-trips the dedicated Recovery layer without authoring state', () => {
    expect(readLevelEditorRouteState('?layer=recovery&kind=wall&brush=stone')).toMatchObject({
      layer: 'recovery',
      eventsEditor: false,
    });
    expect(levelEditorHrefWithRouteState('/editor/level?layer=status&kind=wall&brush=stone', {
      layer: 'recovery',
      brushKind: null,
      brush: null,
    })).toBe('/editor/level?layer=recovery');
  });

  it('does not confuse the Events workspace flag with serialized gameplay events', () => {
    const href = levelEditorHrefWithRouteState('/editor/level?layer=rules&events=encoded-level-events', {
      layer: 'rules',
      eventsEditor: true,
      eventsTab: 'victory',
    });
    expect(href).toBe('/editor/level?layer=rules&events=encoded-level-events&eventsEditor=1');
    expect(readLevelEditorRouteState(new URL(href, 'https://example.test').search)).toMatchObject({
      layer: 'rules',
      eventsEditor: true,
    });
  });

  it('recognizes canonical and legacy level editor routes', () => {
    expect(isLevelEditorRoutePath('/editor/level')).toBe(true);
    expect(isLevelEditorRoutePath('/level-editor/')).toBe(true);
    expect(isLevelEditorRoutePath('/skirmish')).toBe(false);
  });
});
