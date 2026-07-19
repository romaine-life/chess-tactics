import { describe, expect, it } from 'vitest';
import {
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

  it('infers the editor layer from a brush kind when layer is absent', () => {
    expect(readLevelEditorRouteState('?from=studio&kind=unit&brush=rook')).toEqual({
      layer: 'unit',
      brushKind: 'unit',
      brush: 'rook',
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
    });
  });

  it('recognizes canonical and legacy level editor routes', () => {
    expect(isLevelEditorRoutePath('/editor/level')).toBe(true);
    expect(isLevelEditorRoutePath('/level-editor/')).toBe(true);
    expect(isLevelEditorRoutePath('/skirmish')).toBe(false);
  });
});
