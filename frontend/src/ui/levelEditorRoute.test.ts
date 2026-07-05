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

  it('recognizes canonical and legacy level editor routes', () => {
    expect(isLevelEditorRoutePath('/editor/level')).toBe(true);
    expect(isLevelEditorRoutePath('/level-editor/')).toBe(true);
    expect(isLevelEditorRoutePath('/skirmish')).toBe(false);
  });
});
